import { NextRequest, NextResponse } from "next/server";

import { agentRunEnqueueEnvelopeSchema, enqueueAgentRun } from "@/lib/agent-runs";
import { readAppEnv } from "@/lib/env";
import { hasValidOrchestratorSecret } from "@/lib/orchestrator-auth";

export async function POST(request: NextRequest) {
  const envResult = readAppEnv();

  if (!envResult.success || !envResult.data.CLARION_ORCHESTRATOR_SECRET) {
    return NextResponse.json({ error: "Orchestration is not configured." }, { status: 503 });
  }

  if (
    !hasValidOrchestratorSecret({
      received: request.headers.get("x-clarion-orchestrator-secret"),
      configured: envResult.data.CLARION_ORCHESTRATOR_SECRET,
    })
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = agentRunEnqueueEnvelopeSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid agent-run request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || undefined;

  try {
    const run = await enqueueAgentRun({
      organizationId: parsed.data.organizationId,
      idempotencyKey,
      ...parsed.data.request,
    });

    return NextResponse.json(
      {
        id: run.id,
        status: run.status,
        type: run.type,
        createdAt: run.createdAt,
      },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to queue agent run.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
