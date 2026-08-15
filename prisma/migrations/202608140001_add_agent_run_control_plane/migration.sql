-- Durable, organization-scoped orchestration records for Clarion.
CREATE TYPE "AgentRunType" AS ENUM ('VISIBILITY_AUDIT', 'COPILOT_TASK', 'TELEPILOT_EVENT');
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'AWAITING_REVIEW', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AgentStepStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "AgentRunType" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT,
    "inputJson" TEXT NOT NULL,
    "configurationVersion" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "AgentStepStatus" NOT NULL DEFAULT 'QUEUED',
    "inputJson" TEXT,
    "outputJson" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentArtifact" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "contentType" TEXT NOT NULL,
    "contentText" TEXT,
    "contentJson" TEXT,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRun_organizationId_idempotencyKey_key" ON "AgentRun"("organizationId", "idempotencyKey");
CREATE INDEX "AgentRun_organizationId_createdAt_idx" ON "AgentRun"("organizationId", "createdAt");
CREATE INDEX "AgentRun_status_claimExpiresAt_idx" ON "AgentRun"("status", "claimExpiresAt");
CREATE UNIQUE INDEX "AgentStep_agentRunId_sequence_key" ON "AgentStep"("agentRunId", "sequence");
CREATE INDEX "AgentStep_agentRunId_status_idx" ON "AgentStep"("agentRunId", "status");
CREATE INDEX "AgentArtifact_agentRunId_createdAt_idx" ON "AgentArtifact"("agentRunId", "createdAt");

ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentArtifact" ADD CONSTRAINT "AgentArtifact_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
