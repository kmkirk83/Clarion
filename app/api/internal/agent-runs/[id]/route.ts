import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { readAppEnv } from "@/lib/env";
import { hasValidOrchestratorSecret } from "@/lib/orchestrator-auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const run = await getDb().agentRun.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { sequence: "asc" } },
      artifacts: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Agent run not found." }, { status: 404 });
  }

  return NextResponse.json({ run });
}
