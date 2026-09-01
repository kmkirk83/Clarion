# Kyzen

Kyzen is a commercialization-focused foundation for an **AI Visibility Intelligence** platform. It is designed as a hosted, multi-tenant SaaS product that helps brands measure, monitor, and improve [...]

## What is included

This repository now provides a production-oriented starting point for building and selling Kyzen:

- Next.js 16 + TypeScript application baseline
- Prisma data model for organizations, memberships, reports, billing, API keys, and audits
- Environment readiness checks and operational API endpoints
- Docker-ready standalone runtime configuration
- CI, CodeQL, Dependabot, and release automation scaffolding
- Commercialization docs for security, support, releases, and contribution workflows

## Product direction

Kyzen is optimized for the following rollout path:

1. **Hosted SaaS first** for commercial launch
2. **Developer platform second** via a public API and future SDK/CLI packages
3. **Enterprise distribution third** via Docker-based self-hosting

## Local development

### Requirements

- Node.js 22+
- npm 11+
- PostgreSQL 15+

### Setup

```bash
cp /home/runner/work/Kyzen/Kyzen/.env.example /home/runner/work/Kyzen/Kyzen/.env
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

See `/home/runner/work/Kyzen/Kyzen/.env.example` for the expected runtime contract.

Key integrations:

- `DATABASE_URL` for PostgreSQL
- `AUTH_SECRET` for production authentication/session security
- `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` for scoring workflows and the Telegram copilot connector
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` for the Telegram bot webhook
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for billing
- `SENTRY_DSN` for monitoring

## Commands

- `npm run dev` — start local development server
- `npm run build` — create production build
- `npm run start` — run production server
- `npm run lint` — run ESLint
- `npm run typecheck` — run TypeScript checks
- `npm run test` — run Jest tests
- `npm run prisma:validate` — validate Prisma schema
- `npm run check` — run lint, typecheck, test, and build

## HTTP endpoints

- `GET /api/health` — liveness/status metadata
- `GET /api/readiness` — environment and subsystem readiness report
- `POST /api/integrations/telegram` — Telegram webhook that relays chat requests to the configured copilot provider

## Telegram copilot connector

1. Create a Telegram bot with BotFather and capture the bot token.
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and either `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in `/home/runner/work/Kyzen/Kyzen/.env`.
3. Optionally set `TELEGRAM_ALLOWED_CHAT_IDS` to a comma-separated allowlist of Telegram chat IDs.
4. Point Telegram at `https://<your-domain>/api/integrations/telegram` and send the same secret value in the `X-Telegram-Bot-Api-Secret-Token` header when you register the webhook.
5. Message the bot with a plain-text task or `/help` to confirm the connector is online.

The connector is stateless and replies with the configured provider response, so it works best for task intake, drafting, and lightweight operational requests.

## Standalone marketplace repo seed

If you want to publish the Telegram connector as a completely separate public repository named `telepilot`, start from `/home/runner/work/Kyzen/Kyzen/telepilot`. That directory contains a standalo[...]

## Deployment target

The repository is configured for **hosted Next.js deployment with Docker-compatible standalone output**.

- For platform hosting, see `/home/runner/work/Kyzen/Kyzen/docs/runbooks/production.md`
- For container builds, see `/home/runner/work/Kyzen/Kyzen/Dockerfile`

## Release and governance

- Versioning is semver-based and managed with Release Please
- Changelog entries are maintained in `/home/runner/work/Kyzen/Kyzen/CHANGELOG.md`
- Security reporting guidance is in `/home/runner/work/Kyzen/Kyzen/SECURITY.md`
- Contribution rules are in `/home/runner/work/Kyzen/Kyzen/CONTRIBUTING.md`
- Code ownership is defined in `/home/runner/work/Kyzen/Kyzen/CODEOWNERS`

## Architecture references

- `/home/runner/work/Kyzen/Kyzen/docs/architecture.md`
- `/home/runner/work/Kyzen/Kyzen/docs/adr/0001-hosted-saas-first.md`
- `/home/runner/work/Kyzen/Kyzen/docs/privacy-data-processing.md`

## Commercial distribution notes

The root application remains private because it is a deployable SaaS product, not a library package. Future developer-platform distribution should be added as separate publishable packages (for exampl[...]
