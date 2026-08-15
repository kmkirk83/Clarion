import {
  agentRunEnqueueEnvelopeSchema,
  agentRunRequestSchema,
} from "@/lib/agent-runs";
import { hasValidOrchestratorSecret } from "@/lib/orchestrator-auth";

describe("agent-run request validation", () => {
  it("accepts a bounded visibility audit request", () => {
    const parsed = agentRunRequestSchema.safeParse({
      type: "VISIBILITY_AUDIT",
      configurationVersion: "clarion-v0",
      brandId: "brand_123",
      promptSetVersion: "starter-2026-08",
      prompts: [
        {
          id: "category-discovery",
          text: "Which platforms help a small brand measure AI visibility?",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects an audit that exceeds the bounded prompt budget", () => {
    const parsed = agentRunRequestSchema.safeParse({
      type: "VISIBILITY_AUDIT",
      configurationVersion: "clarion-v0",
      brandId: "brand_123",
      promptSetVersion: "starter-2026-08",
      prompts: Array.from({ length: 13 }, (_, index) => ({
        id: `prompt-${index}`,
        text: "A bounded audit prompt.",
      })),
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a Telepilot event only through the bounded summary contract", () => {
    const parsed = agentRunEnqueueEnvelopeSchema.safeParse({
      organizationId: "org_123",
      request: {
        type: "TELEPILOT_EVENT",
        configurationVersion: "telepilot-v0",
        actionVersion: "v0.1.0-rc.1",
        requestId: "request_123",
        provider: "verified-provider",
        outcome: "SUCCEEDED",
        durationMs: 450,
        responseDigest: "abc123",
      },
    });

    expect(parsed.success).toBe(true);
  });
});

describe("orchestrator authentication", () => {
  const configured = "clarion-orchestrator-secret-which-is-long-enough";

  it("accepts the configured secret", () => {
    expect(
      hasValidOrchestratorSecret({
        received: configured,
        configured,
      })
    ).toBe(true);
  });

  it("rejects absent, mismatched, and differently sized values", () => {
    expect(hasValidOrchestratorSecret({ received: null, configured })).toBe(false);
    expect(hasValidOrchestratorSecret({ received: "different", configured })).toBe(false);
    expect(hasValidOrchestratorSecret({ received: `${configured}x`, configured })).toBe(false);
  });
});
