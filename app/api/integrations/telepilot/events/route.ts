import { NextRequest, NextResponse } from "next/server";

import { agentRunEnqueueEnvelopeSchema, enqueueAgentRun } from "@/lib/agent-runs";
import { readAppEnv } from "@/lib/env";
import { hasValidTelepilotSignature } from "@/lib/telepilot-event-auth";

export async function POST(request: NextRequest) {
  const envResult = readAppEnv();

  if (!envResult.success || !envResult.data.CLARION_TELEPILOT_EVENT_SECRET) {
    return NextResponse.json({ error: "Telepilot events are not configured." }, { status: 503 });
  }

  const rawBody = await request.text();

  if (
    !hasValidTelepilotSignature({
      rawBody,
      received: request.headers.get("x-telepilot-signature"),
      secret: envResult.data.CLARION_TELEPILOT_EVENT_SECRET,
    })
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = agentRunEnqueueEnvelopeSchema.safeParse(payload);

  if (!parsed.success || parsed.data.request.type !== "TELEPILOT_EVENT") {
    return NextResponse.json({ error: "Invalid Telepilot event." }, { status: 400 });
  }

  try {
    const run = await enqueueAgentRun({
      organizationId: parsed.data.organizationId,
      idempotencyKey: `telepilot:${parsed.data.request.requestId}`,
      ...parsed.data.request,
    });

    return NextResponse.json(
      {
        id: run.id,
        status: run.status,
        type: run.type,
      },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record Telepilot event.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
