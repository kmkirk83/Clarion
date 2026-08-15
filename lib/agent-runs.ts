import { createHash } from "node:crypto";

import { AgentRunStatus, AgentRunType, AgentStepStatus, type AgentRun } from "@/app/generated/prisma/client";
import { z } from "zod";

import { createCopilotReply } from "@/lib/copilot";
import { getDb } from "@/lib/db";
import type { AppEnv } from "@/lib/env";

const MAX_PROMPTS_PER_AUDIT = 12;
const MAX_AUDIT_PROMPT_LENGTH = 4_000;
const MAX_COPILOT_MESSAGE_LENGTH = 12_000;
const MAX_EVENT_SUMMARY_LENGTH = 2_000;

const runBaseSchema = z.object({
  configurationVersion: z.string().trim().min(1).max(100),
});

const visibilityAuditInputSchema = runBaseSchema.extend({
  type: z.literal("VISIBILITY_AUDIT"),
  brandId: z.string().trim().min(1).max(100),
  promptSetVersion: z.string().trim().min(1).max(100),
  prompts: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(100),
        text: z.string().trim().min(1).max(MAX_AUDIT_PROMPT_LENGTH),
      })
    )
    .min(1)
    .max(MAX_PROMPTS_PER_AUDIT),
});

const copilotTaskInputSchema = runBaseSchema.extend({
  type: z.literal("COPILOT_TASK"),
  message: z.string().trim().min(1).max(MAX_COPILOT_MESSAGE_LENGTH),
  source: z.enum(["operator", "telegram"]),
});

const telepilotEventInputSchema = runBaseSchema.extend({
  type: z.literal("TELEPILOT_EVENT"),
  actionVersion: z.string().trim().min(1).max(100),
  requestId: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(100),
  outcome: z.enum(["SUCCEEDED", "FAILED"]),
  durationMs: z.number().int().nonnegative().max(900_000),
  responseDigest: z.string().trim().min(1).max(256).optional(),
  summary: z.string().trim().min(1).max(MAX_EVENT_SUMMARY_LENGTH).optional(),
});

export const agentRunRequestSchema = z.discriminatedUnion("type", [
  visibilityAuditInputSchema,
  copilotTaskInputSchema,
  telepilotEventInputSchema,
]);

export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>;

export const agentRunEnqueueEnvelopeSchema = z.object({
  organizationId: z.string().trim().min(1).max(100),
  request: agentRunRequestSchema,
});

export type EnqueueAgentRunInput = AgentRunRequest & {
  organizationId: string;
  idempotencyKey?: string;
};

export type ProcessedAgentRun = {
  id: string;
  type: AgentRunType;
  status: AgentRunStatus;
};

const VISIBILITY_AUDIT_SYSTEM_PROMPT = [
  "You are Clarion, an evidence-first AI visibility analyst.",
  "Answer the supplied scenario directly. Do not claim web browsing, live search, rankings, or facts you cannot support.",
  "When the supplied context is insufficient, say so plainly.",
  "Mention the candidate brand only when it is relevant to the scenario.",
  "Return a concise answer suitable for an audit artifact; do not include hidden reasoning.",
].join(" ");

export async function enqueueAgentRun(input: EnqueueAgentRunInput) {
  const organizationId = input.organizationId.trim();

  if (!organizationId) {
    throw new Error("organizationId is required.");
  }

  const parsed = agentRunRequestSchema.parse(input);
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;

  if (idempotencyKey) {
    const existing = await getDb().agentRun.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
    });

    if (existing) {
      return existing;
    }
  }

  return getDb().agentRun.create({
    data: {
      organizationId,
      type: parsed.type as AgentRunType,
      status: AgentRunStatus.QUEUED,
      idempotencyKey,
      inputJson: JSON.stringify(parsed),
      configurationVersion: parsed.configurationVersion,
    },
  });
}

export async function claimNextAgentRun(leaseMs = 120_000): Promise<AgentRun | null> {
  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + leaseMs);
  const candidate = await getDb().agentRun.findFirst({
    where: {
      OR: [
        { status: AgentRunStatus.QUEUED },
        {
          status: AgentRunStatus.RUNNING,
          claimExpiresAt: { lt: now },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (!candidate) {
    return null;
  }

  const claim = await getDb().agentRun.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: AgentRunStatus.QUEUED },
        {
          status: AgentRunStatus.RUNNING,
          claimExpiresAt: { lt: now },
        },
      ],
    },
    data: {
      status: AgentRunStatus.RUNNING,
      claimedAt: now,
      claimExpiresAt,
      startedAt: candidate.startedAt ?? now,
      failureCode: null,
      failureMessage: null,
    },
  });

  if (claim.count !== 1) {
    return null;
  }

  return getDb().agentRun.findUnique({ where: { id: candidate.id } });
}

export async function processNextAgentRun(env: AppEnv): Promise<ProcessedAgentRun | null> {
  const run = await claimNextAgentRun();

  if (!run) {
    return null;
  }

  try {
    switch (run.type) {
      case AgentRunType.VISIBILITY_AUDIT:
        await processVisibilityAudit(run, env);
        break;
      case AgentRunType.COPILOT_TASK:
        await processCopilotTask(run, env);
        break;
      case AgentRunType.TELEPILOT_EVENT:
        await processTelepilotEvent(run);
        break;
      default:
        assertUnreachable(run.type);
    }
  } catch (error) {
    const message = getSafeErrorMessage(error);
    await getDb().agentRun.update({
      where: { id: run.id },
      data: {
        status: AgentRunStatus.FAILED,
        completedAt: new Date(),
        claimExpiresAt: null,
        failureCode: "RUNNER_ERROR",
        failureMessage: message,
      },
    });

    return {
      id: run.id,
      type: run.type,
      status: AgentRunStatus.FAILED,
    };
  }

  const completed = await getDb().agentRun.findUniqueOrThrow({ where: { id: run.id } });

  return {
    id: completed.id,
    type: completed.type,
    status: completed.status,
  };
}

async function processVisibilityAudit(run: AgentRun, env: AppEnv) {
  const input = visibilityAuditInputSchema.parse(parseInput(run));
  const brand = await getDb().brand.findFirst({
    where: {
      id: input.brandId,
      organizationId: run.organizationId,
    },
    include: { competitors: true },
  });

  if (!brand) {
    throw new Error("The requested brand does not belong to this organization.");
  }

  const findings: Array<{
    promptId: string;
    prompt: string;
    brandMentioned: boolean;
    provider: string;
    responseDigest: string;
  }> = [];

  for (const [index, prompt] of input.prompts.entries()) {
    const step = await getDb().agentStep.create({
      data: {
        agentRunId: run.id,
        sequence: index + 1,
        kind: "PROMPT_EVALUATION",
        status: AgentStepStatus.RUNNING,
        startedAt: new Date(),
        inputJson: JSON.stringify({ promptId: prompt.id, prompt: prompt.text }),
      },
    });

    try {
      const reply = await createCopilotReply({
        env,
        systemPrompt: VISIBILITY_AUDIT_SYSTEM_PROMPT,
        message: buildVisibilityAuditMessage({
          prompt: prompt.text,
          brand: { name: brand.name, website: brand.website },
          competitors: brand.competitors.map((competitor) => ({
            name: competitor.name,
            website: competitor.website,
          })),
        }),
      });
      const brandMentioned = includesNormalizedText(reply.text, brand.name);
      const responseDigest = digest(reply.text);

      await getDb().agentArtifact.create({
        data: {
          agentRunId: run.id,
          kind: "PROMPT_RESPONSE",
          title: prompt.id,
          contentType: "text/plain",
          contentText: reply.text,
          checksum: responseDigest,
        },
      });
      await getDb().agentStep.update({
        where: { id: step.id },
        data: {
          status: AgentStepStatus.SUCCEEDED,
          completedAt: new Date(),
          outputJson: JSON.stringify({
            provider: reply.provider,
            brandMentioned,
            responseDigest,
          }),
        },
      });
      findings.push({
        promptId: prompt.id,
        prompt: prompt.text,
        brandMentioned,
        provider: reply.provider,
        responseDigest,
      });
    } catch (error) {
      const message = getSafeErrorMessage(error);
      await getDb().agentStep.update({
        where: { id: step.id },
        data: {
          status: AgentStepStatus.FAILED,
          completedAt: new Date(),
          errorMessage: message,
        },
      });
      throw error;
    }
  }

  const brandMentionRate = Math.round(
    (findings.filter((finding) => finding.brandMentioned).length / findings.length) * 100
  );
  const summary = {
    brand: { id: brand.id, name: brand.name, website: brand.website },
    promptSetVersion: input.promptSetVersion,
    promptCount: findings.length,
    brandMentionRate,
    findings,
    limitations: [
      "This result reflects a bounded prompt set and a specific provider/model configuration.",
      "It is not a universal ranking, live-search result, or guarantee of future AI-assistant output.",
    ],
  };

  await getDb().agentArtifact.create({
    data: {
      agentRunId: run.id,
      kind: "AUDIT_SUMMARY",
      title: "Visibility audit summary",
      contentType: "application/json",
      contentJson: JSON.stringify(summary),
      checksum: digest(JSON.stringify(summary)),
    },
  });
  await getDb().agentRun.update({
    where: { id: run.id },
    data: {
      status: AgentRunStatus.AWAITING_REVIEW,
      completedAt: new Date(),
      claimExpiresAt: null,
      provider: findings[0]?.provider,
      model: selectedModel(env, findings[0]?.provider),
    },
  });
}

async function processCopilotTask(run: AgentRun, env: AppEnv) {
  const input = copilotTaskInputSchema.parse(parseInput(run));
  const step = await getDb().agentStep.create({
    data: {
      agentRunId: run.id,
      sequence: 1,
      kind: "COPILOT_RESPONSE",
      status: AgentStepStatus.RUNNING,
      startedAt: new Date(),
      inputJson: JSON.stringify({ source: input.source }),
    },
  });

  try {
    const reply = await createCopilotReply({ env, message: input.message });
    const responseDigest = digest(reply.text);

    await getDb().agentArtifact.create({
      data: {
        agentRunId: run.id,
        kind: "COPILOT_RESPONSE",
        title: "Clarion Copilot response",
        contentType: "text/plain",
        contentText: reply.text,
        checksum: responseDigest,
      },
    });
    await getDb().agentStep.update({
      where: { id: step.id },
      data: {
        status: AgentStepStatus.SUCCEEDED,
        completedAt: new Date(),
        outputJson: JSON.stringify({ provider: reply.provider, responseDigest }),
      },
    });
    await getDb().agentRun.update({
      where: { id: run.id },
      data: {
        status: AgentRunStatus.SUCCEEDED,
        completedAt: new Date(),
        claimExpiresAt: null,
        provider: reply.provider,
        model: selectedModel(env, reply.provider),
      },
    });
  } catch (error) {
    const message = getSafeErrorMessage(error);
    await getDb().agentStep.update({
      where: { id: step.id },
      data: {
        status: AgentStepStatus.FAILED,
        completedAt: new Date(),
        errorMessage: message,
      },
    });
    throw error;
  }
}

async function processTelepilotEvent(run: AgentRun) {
  const input = telepilotEventInputSchema.parse(parseInput(run));
  const summary = {
    actionVersion: input.actionVersion,
    requestId: input.requestId,
    provider: input.provider,
    outcome: input.outcome,
    durationMs: input.durationMs,
    responseDigest: input.responseDigest,
    summary: input.summary,
  };

  await getDb().agentStep.create({
    data: {
      agentRunId: run.id,
      sequence: 1,
      kind: "EVENT_CAPTURE",
      status: AgentStepStatus.SUCCEEDED,
      startedAt: new Date(),
      completedAt: new Date(),
      outputJson: JSON.stringify(summary),
    },
  });
  await getDb().agentArtifact.create({
    data: {
      agentRunId: run.id,
      kind: "TELEPILOT_EVENT",
      title: "Telepilot action event",
      contentType: "application/json",
      contentJson: JSON.stringify(summary),
      checksum: digest(JSON.stringify(summary)),
    },
  });
  await getDb().agentRun.update({
    where: { id: run.id },
    data: {
      status: input.outcome === "SUCCEEDED" ? AgentRunStatus.SUCCEEDED : AgentRunStatus.FAILED,
      completedAt: new Date(),
      claimExpiresAt: null,
      provider: input.provider,
      failureCode: input.outcome === "FAILED" ? "TELEPILOT_ACTION_FAILED" : null,
      failureMessage: input.outcome === "FAILED" ? input.summary || "Telepilot reported a failed action." : null,
    },
  });
}

function parseInput(run: AgentRun) {
  try {
    return JSON.parse(run.inputJson) as unknown;
  } catch {
    throw new Error("Agent run input is not valid JSON.");
  }
}

function buildVisibilityAuditMessage({
  prompt,
  brand,
  competitors,
}: {
  prompt: string;
  brand: { name: string; website: string };
  competitors: Array<{ name: string; website: string | null }>;
}) {
  const competitorList = competitors.length
    ? competitors.map((competitor) => `- ${competitor.name}${competitor.website ? ` (${competitor.website})` : ""}`).join("\n")
    : "- No competitors supplied";

  return [
    "Audit scenario:",
    prompt,
    "",
    `Candidate brand: ${brand.name} (${brand.website})`,
    "Competitors:",
    competitorList,
    "",
    "Provide a concise answer to the scenario. State uncertainty where applicable.",
  ].join("\n");
}

function includesNormalizedText(text: string, candidate: string) {
  return text.toLocaleLowerCase().includes(candidate.toLocaleLowerCase());
}

function selectedModel(env: AppEnv, provider: string | undefined) {
  if (provider === "openai") {
    return env.OPENAI_MODEL || "gpt-4o-mini";
  }

  if (provider === "anthropic") {
    return env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
  }

  return undefined;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return "The agent runner failed with an unknown error.";
}

function assertUnreachable(value: never): never {
  throw new Error(`Unsupported agent run type: ${String(value)}`);
}
