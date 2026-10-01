import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import {
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnorderedListFeature,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";
import { APIError, buildConfig } from "payload";
import sharp from "sharp";
import { Media } from "./cms/collections/media";
import { Help } from "./cms/collections/help";
import { Insights } from "./cms/collections/insights";
import { Legal } from "./cms/collections/legal";
import { Pages } from "./cms/collections/pages";
import { PROOF_COLLECTIONS } from "./cms/collections/proof";
import { Staff } from "./cms/collections/staff";
import { Announcement } from "./cms/globals/announcement";
import { SalesAssistant } from "./cms/globals/sales-assistant";
import { Footer, Header } from "./cms/globals/site-frame";
import { DEFAULT_LOCALE, MARKET_LOCALES } from "./cms/locales";
import { migrations } from "./cms/migrations";
import { mediaStorage } from "./cms/storage";
import { canPublishWebsite } from "./server/staff/access";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The website editor (Payload), inside the staff admin area at
 * /admin/content. Its content lives in the console's database, in its own
 * "cms" schema with its own migrations (src/cms/migrations); Prisma keeps
 * the "public" schema. Staff sign in with their console session.
 */
export default buildConfig({
  serverURL: process.env.APP_URL,
  // SECRET. Payload signs its own tokens with this; staff never get a Payload password.
  secret: process.env.PAYLOAD_SECRET ?? "",
  routes: { admin: "/admin/content", api: "/admin/content-api" },
  admin: {
    user: Staff.slug,
    // No Gravatar: it would send a hash of each staff email address to a third party.
    avatar: "default",
    importMap: { baseDir: dirname },
    meta: { titleSuffix: " · Website editor", robots: "noindex, nofollow" },
    components: {
      graphics: { Logo: "@/cms/components/brand#EditorLogo", Icon: "@/cms/components/brand#EditorIcon" },
      logout: { Button: "@/cms/components/brand#BackToConsole" },
    },
  },
  collections: [Pages, Insights, Help, Legal, ...PROOF_COLLECTIONS, Media, Staff],
  globals: [Header, Footer, Announcement, SalesAssistant],
  // Each market is a locale; a market without its own words shows Botswana's.
  localization: {
    locales: MARKET_LOCALES.map((l) => ({ code: l.code, label: l.label })),
    defaultLocale: DEFAULT_LOCALE,
    fallback: true,
  },
  jobs: {
    // Scheduled publishing. The console's background jobs switch (CONSOLE_JOBS=off) stops these too.
    autoRun: [{ cron: "* * * * *", queue: "default" }],
    shouldAutoRun: () => process.env.CONSOLE_JOBS !== "off",
    // Runs the hook below, which checks who scheduled a publish.
    runHooks: true,
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      hooks: {
        ...defaultJobsCollection.hooks,
        beforeChange: [
          ...(defaultJobsCollection.hooks?.beforeChange ?? []),
          // Only Publishers may schedule a publish or unpublish. The job carries who scheduled it.
          async ({ data, operation, req }) => {
            if (operation !== "create" || data?.taskSlug !== "schedulePublish") return data;
            const by = data.input?.user as { relationTo?: string; value?: string | number } | undefined;
            const staff = by?.relationTo === "staff" && by.value != null ? await req.payload.findByID({ collection: "staff", id: by.value, depth: 0, overrideAccess: true, disableErrors: true }) : null;
            if (!canPublishWebsite(staff?.websiteRole)) throw new APIError("Only Publishers can schedule a publish.", 403);
            return data;
          },
        ],
      },
    }),
  },
  // Rich text is words only: headings, bold, italic, links and lists. No colours, fonts or code.
  editor: lexicalEditor({
    features: () => [
      ParagraphFeature(),
      HeadingFeature({ enabledHeadingSizes: ["h2", "h3"] }),
      BoldFeature(),
      ItalicFeature(),
      LinkFeature({ enabledCollections: [] }),
      UnorderedListFeature(),
      OrderedListFeature(),
      FixedToolbarFeature(),
      InlineToolbarFeature(),
    ],
  }),
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    schemaName: "cms",
    push: false,
    migrationDir: path.join(dirname, "cms", "migrations"),
    // A production server applies pending editor migrations when it starts (src/instrumentation.ts).
    prodMigrations: migrations,
  }),
  sharp,
  plugins: [...mediaStorage().plugins],
  graphQL: { disable: true },
  telemetry: false,
  upload: { limits: { fileSize: 10 * 1024 * 1024 } },
  typescript: { outputFile: path.join(dirname, "cms", "payload-types.ts") },
});
