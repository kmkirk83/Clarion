import { NextRequest, NextResponse } from "next/server";

import { processNextAgentRun } from "@/lib/agent-runs";
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

  const run = await processNextAgentRun(envResult.data);

  if (!run) {
    return NextResponse.json({ processed: false, message: "No queued agent runs." });
  }

  return NextResponse.json({ processed: true, run });
}
