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
  /**
   * The public website's address, e.g. https://fourthgeneration.technology,
   * when it has its own host apart from the console (APP_URL). Empty: one
   * host serves both, as in development and CI.
   */
  SITE_URL: optionalUrl(),
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
  /** Off-site backup storage (scripts/backup.sh). Read here only to warn staff while it is missing. */
  OFFSITE_S3_BUCKET: optionalText(),
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
  /**
   * Sign in with Microsoft: the console's app registration in Microsoft Entra ID
   * (docs/sign-in-setup.md). Its secret is MICROSOFT_CLIENT_SECRET. The buttons
   * hide while either is unset.
   */
  MICROSOFT_CLIENT_ID: optionalText(),
  /** Our own Microsoft 365 tenant's id. Staff sign in with Microsoft only from this tenant; unset hides staff Microsoft sign-in. */
  MICROSOFT_STAFF_TENANT_ID: optionalText(),
  /** Sign in with Google: the OAuth client's id (docs/sign-in-setup.md). Its secret is GOOGLE_CLIENT_SECRET. */
  GOOGLE_CLIENT_ID: optionalText(),
  /**
   * Once staff sign in with Microsoft, their passwords stop working unless this is "yes":
   * a way in if Microsoft is down. A code or passkey is still needed either way.
   */
  STAFF_PASSWORD_SIGN_IN: z.enum(["yes", "no"]).optional(),
  /** An outside service status page. While unset, the site's status links go to its own /status page. */
  STATUS_PAGE_URL: optionalUrl(),
  /** Thebe's sign-up or trial page ("Try Thebe"). The site editor's Thebe links come first; unset means Thebe's website. */
  THEBE_TRY_URL: optionalUrl(),
  /** Thebe's own website ("Learn more about Thebe"). Unset means https://www.thebe.africa. */
  THEBE_URL: optionalUrl(),
  /** Where to book a Thebe demo. Unset means our pre-sales booking page, hidden while nobody takes bookings. */
  THEBE_DEMO_URL: optionalUrl(),
  /** NSMC's website, for the on-site IT line. Unset means https://www.nsmc.africa. */
  NSMC_URL: optionalUrl(),
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
