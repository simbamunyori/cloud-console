import { z } from "zod";

/**
 * Settings that change between deployments come from the environment;
 * see .env.example for the full list. Secrets (API keys, vendor
 * credentials) are read through src/server/secrets.ts instead, so a
 * vault can take over from the environment later.
 */
/** Unset and empty both mean "not configured". */
const optionalText = () => z.string().optional().transform((v) => (v ? v : undefined));
const optionalUrl = () => z.union([z.literal(""), z.string().url()]).optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  DATABASE_URL: z.string().url(),
  /** Public address of the console, used in email links. The domain is not decided yet. */
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** What customers see the console called. Not decided yet, so it lives here. */
  CONSOLE_NAME: z.string().min(1).default("Cloud Console"),
  /** Outgoing mail server, e.g. smtps://user:pass@smtp.example.com:465, or smtp://localhost:1025 for Mailpit. */
  SMTP_URL: optionalUrl(),
  MAIL_FROM: z.string().min(3).default("Fourth Generation Technologies <no-reply@localhost>"),
  /** Model for the support assistant. Change it here, never in code. */
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),
  /** Which billing engine the console talks to. */
  BILLING_ADAPTER: z.enum(["stub", "whmcs"]).default("stub"),
  /** The WHMCS API, e.g. https://billing.fourthgeneration.technology/includes/api.php. */
  WHMCS_API_URL: optionalUrl(),
  /** The price sync addon's endpoint. Defaults to modules/addons/fourthgen_console/sync.php beside WHMCS_API_URL. */
  WHMCS_SYNC_URL: optionalUrl(),
  /** Which WHMCS this is. "production" makes the write tests refuse to run against it. */
  WHMCS_ENVIRONMENT: z.enum(["test", "production"]).optional(),
  /**
   * Who carries out changes in customers' Microsoft 365 and Google Workspace
   * tenants: "stub" applies them at once to demo data; "manual" hands each
   * one to staff as a task, until the vendor APIs are connected.
   */
  TENANT_PROVIDER: z.enum(["stub", "manual"]).default("stub"),
  /** Which card gateway takes card payments. Not chosen yet. */
  PAYMENT_ADAPTER: z.enum(["stub"]).default("stub"),
  /** Request header carrying the visitor's country, set by the CDN in front of the console. */
  GEO_COUNTRY_HEADER: z.string().min(1).default("cf-ipcountry"),
  /** Optional MaxMind GeoLite2 Country database, used when the header is missing. */
  GEOLITE2_DB_PATH: optionalText(),
  /** Comma-separated IPs or IPv4 ranges (CIDR) allowed to open /admin. Empty allows any address. */
  ADMIN_IP_ALLOWLIST: z.string().default(""),
  /** The service status page linked from the site footer. The link is hidden while this is unset. */
  STATUS_PAGE_URL: optionalUrl(),
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
