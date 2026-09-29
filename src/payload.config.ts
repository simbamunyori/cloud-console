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
import { buildConfig } from "payload";
import sharp from "sharp";
import { Media } from "./cms/collections/media";
import { Staff } from "./cms/collections/staff";
import { migrations } from "./cms/migrations";
import { mediaStorage } from "./cms/storage";

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
  collections: [Media, Staff],
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
