import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(16).optional(),
  AUTH_TRUST_HOST: z.enum(["true", "false"]).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
  CLARION_API_BASE_URL: z.string().url().optional(),
  CLARION_ORCHESTRATOR_SECRET: z.string().min(32).optional(),
  CLARION_TELEPILOT_EVENT_SECRET: z.string().min(32).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  TELEGRAM_ALLOWED_CHAT_IDS: z.string().min(1).optional(),
  TELEGRAM_COPILOT_SYSTEM_PROMPT: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function readAppEnv() {
  return envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN,
    CLARION_API_BASE_URL: process.env.CLARION_API_BASE_URL,
    CLARION_ORCHESTRATOR_SECRET: process.env.CLARION_ORCHESTRATOR_SECRET,
    CLARION_TELEPILOT_EVENT_SECRET: process.env.CLARION_TELEPILOT_EVENT_SECRET,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    TELEGRAM_ALLOWED_CHAT_IDS: process.env.TELEGRAM_ALLOWED_CHAT_IDS,
    TELEGRAM_COPILOT_SYSTEM_PROMPT: process.env.TELEGRAM_COPILOT_SYSTEM_PROMPT,
  });
}
