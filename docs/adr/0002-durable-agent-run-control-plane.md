# ADR 0002: Durable Agent-Run Control Plane

**Status:** Accepted  
**Date:** 2026-08-14  
**Owners:** Clarion engineering

## Context

Clarion already has a multi-tenant commercial model and an authenticated Telegram webhook. It needs a durable way to coordinate AI-assisted work without turning every inbound message or audit into an opaque, untraceable LLM call. The control plane must support customer-facing visibility audits, bounded internal operations, and future integrations such as Telepilot while preserving tenant isolation, reviewability, and retry-safe state.

## Decision

Clarion will use its application database as the initial **agent-run control plane**. Every agentic workflow is represented by a durable `AgentRun` record, with ordered `AgentStep` records and immutable `AgentArtifact` records. The application owns all state transitions:

```text
QUEUED → RUNNING → SUCCEEDED
                 ↘ FAILED
                 ↘ AWAITING_REVIEW → RUNNING
CANCELLED may be entered only before terminal completion.
```

The initial run types are deliberately bounded:

| Run type | Purpose | Human control |
|---|---|---|
| `VISIBILITY_AUDIT` | Evaluate a fixed, versioned prompt set for an organization’s brand and competitors. | An operator can review evidence and report narrative before external sharing. |
| `COPILOT_TASK` | Process a text-only internal task from an approved Clarion interface or authorized Telegram chat. | The system cannot execute code, make purchases, change credentials, or access arbitrary repositories. |
| `TELEPILOT_EVENT` | Retain a signed summary of a Telepilot action result when the integration is explicitly enabled. | Telepilot remains the executor; Clarion is a status and audit sink, not a remote command channel. |

Each run records its organization, initiator, idempotency key, immutable input JSON, configuration version, provider/model metadata, timestamps, failure code, and a non-sensitive failure message. Each artifact records a typed, reviewable result such as a response excerpt, normalized finding, report draft, or run summary. Credentials, raw authorization headers, access tokens, and unrestricted source code are never stored as artifacts.

## Orchestration Model

The first release uses a **request-created, worker-executed** pattern. A trusted application route creates a run in the database. A separately authenticated internal worker route claims queued runs, advances state atomically, invokes a bounded runner, persists artifacts, and records terminal state. This separation makes the workflow retryable even before a dedicated queue worker or scheduler is introduced.

The worker route is not a public API. It requires a dedicated orchestration secret, uses a short claim lease, and processes a small bounded batch. The future deployment scheduler may invoke the same route, but scheduler selection is intentionally outside this ADR.

```text
Authorized request / Telegram webhook
        │
        ▼
Create AgentRun (QUEUED) ──► Internal worker claims run ──► Bounded runner
        │                                                        │
        └────────────── audit log ◄── artifacts + state ◄───────┘
```

## Security and Tenant Boundaries

All control-plane queries are organization-scoped. An agent run may only reference data belonging to the same organization. Inputs are schema-validated, size-limited, and typed. The model provider receives the minimum content required for the selected run type. Any externally delivered result is limited to an allowlisted channel and an explicitly configured destination.

Inbound Telegram traffic retains the existing webhook-secret and chat-allowlist requirements. Telegram-originated work is text-only, uses a bounded system prompt, and produces no side effect beyond saving a run/artifact and replying with a plain-text result. Telepilot integration accepts signed run summaries only; it never grants Telepilot permission to initiate arbitrary Clarion commands.

## Consequences

This approach creates a real operational foundation without prematurely deploying a separate workflow platform. It makes run history, retries, evidence, and support diagnostics first-class product data. It also forces capability boundaries before expanding agent behavior.

The initial tradeoff is that an application-level worker must be invoked by an internal scheduler or deployment job for asynchronous processing. That is acceptable for the current phase because the workflow contract, persistence layer, and testability are more important than adding infrastructure before real workloads exist.

## Non-Goals

This ADR does not introduce autonomous code execution, browser automation, user credential handling, trading execution, general-purpose tool use, long-lived agent memory, a public task API, self-serve automation builders, or an always-on worker process. Those capabilities require separate product, security, and operating decisions.
