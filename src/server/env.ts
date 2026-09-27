import { z } from "zod";

/**
 * Settings that change between deployments come from the environment;
 * see .env.example for the full list. Secrets (API keys, vendor
 * credentials) are read through src/server/secrets.ts instead, so a
 * vault can take over from the environment later.
 */
const optional = (s: z.ZodTypeAny) => z.preprocess((v) => (v === "" ? undefined : v), s.optional());

const schema = z.object({
  DATABASE_URL: z.string().url(),
  /** Public address of the console, used in email links. The domain is not decided yet. */
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** What customers see the console called. Not decided yet, so it lives here. */
  CONSOLE_NAME: z.string().min(1).default("Cloud Console"),
  /** Outgoing mail server, e.g. smtps://user:pass@smtp.example.com:465, or smtp://localhost:1025 for Mailpit. */
  SMTP_URL: optional(z.string().url()),
  MAIL_FROM: z.string().min(3).default("Fourth Generation Technologies <no-reply@localhost>"),
  /** Model for the support assistant. Change it here, never in code. */
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),
  /** Which billing engine the console talks to. */
  BILLING_ADAPTER: z.enum(["stub", "whmcs"]).default("stub"),
  /** Base URL of WHMCS, e.g. https://billing.internal.example/includes/api.php. */
  WHMCS_API_URL: optional(z.string().url()),
  /** Which card gateway takes card payments. Not chosen yet. */
  PAYMENT_ADAPTER: z.enum(["stub"]).default("stub"),
  /** Our bank account for EFT payments, shown on invoices and the pay page. */
  EFT_BANK_NAME: optional(z.string()),
  EFT_ACCOUNT_NAME: optional(z.string()),
  EFT_ACCOUNT_NUMBER: optional(z.string()),
  EFT_BRANCH_CODE: optional(z.string()),
  EFT_SWIFT_CODE: optional(z.string()),
  /** Comma-separated IPs or IPv4 ranges (CIDR) allowed to open /admin. Empty allows any address. */
  ADMIN_IP_ALLOWLIST: z.string().default(""),
  /** Set to "off" to stop background jobs on this server. */
  CONSOLE_JOBS: z.enum(["on", "off"]).default("on"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Missing or invalid environment variables:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** For tests that change the environment. */
export function resetEnvCache() {
  cached = undefined;
}
