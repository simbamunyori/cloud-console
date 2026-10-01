import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_pages_blocks_insights_strip_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum_pages_blocks_insights_strip_topic" AS ENUM('resilience', 'compliance', 'email-security', 'productivity', 'security', 'websites');
  CREATE TYPE "cms"."enum_pages_blocks_insights_strip_more_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__pages_v_blocks_insights_strip_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_insights_strip_topic" AS ENUM('resilience', 'compliance', 'email-security', 'productivity', 'security', 'websites');
  CREATE TYPE "cms"."enum__pages_v_blocks_insights_strip_more_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_insights_topic" AS ENUM('resilience', 'compliance', 'email-security', 'productivity', 'security', 'websites');
  CREATE TYPE "cms"."enum_insights_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__insights_v_version_topic" AS ENUM('resilience', 'compliance', 'email-security', 'productivity', 'security', 'websites');
  CREATE TYPE "cms"."enum__insights_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__insights_v_published_locale" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TABLE "cms"."pages_blocks_price_tables" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"domains_heading" varchar,
  	"domains_intro" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_insights_strip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum_pages_blocks_insights_strip_tone" DEFAULT 'plain',
  	"topic" "cms"."enum_pages_blocks_insights_strip_topic",
  	"more_label" varchar,
  	"more_to" "cms"."enum_pages_blocks_insights_strip_more_to" DEFAULT 'market',
  	"more_path" varchar,
  	"more_subject" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_price_tables" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"domains_heading" varchar,
  	"domains_intro" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_insights_strip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum__pages_v_blocks_insights_strip_tone" DEFAULT 'plain',
  	"topic" "cms"."enum__pages_v_blocks_insights_strip_topic",
  	"more_label" varchar,
  	"more_to" "cms"."enum__pages_v_blocks_insights_strip_more_to" DEFAULT 'market',
  	"more_path" varchar,
  	"more_subject" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."insights" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"topic" "cms"."enum_insights_topic",
  	"published_at" timestamp(3) with time zone,
  	"reading_minutes" numeric,
  	"image_id" integer,
  	"related" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "cms"."enum_insights_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "cms"."insights_locales" (
  	"title" varchar,
  	"summary" varchar,
  	"body" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "cms"."_insights_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_topic" "cms"."enum__insights_v_version_topic",
  	"version_published_at" timestamp(3) with time zone,
  	"version_reading_minutes" numeric,
  	"version_image_id" integer,
  	"version_related" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "cms"."enum__insights_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "cms"."enum__insights_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "cms"."_insights_v_locales" (
  	"version_title" varchar,
  	"version_summary" varchar,
  	"version_body" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "insights_id" integer;
  ALTER TABLE "cms"."footer_locales" ADD COLUMN "contact_email" varchar;
  ALTER TABLE "cms"."footer_locales" ADD COLUMN "contact_phone" varchar;
  ALTER TABLE "cms"."footer_locales" ADD COLUMN "contact_whatsapp" varchar;
  ALTER TABLE "cms"."footer_locales" ADD COLUMN "contact_hours" varchar;
  ALTER TABLE "cms"."footer_locales" ADD COLUMN "contact_address" varchar;
  ALTER TABLE "cms"."footer_locales" ADD COLUMN "social_linkedin" varchar;
  ALTER TABLE "cms"."footer_locales" ADD COLUMN "social_facebook" varchar;
  ALTER TABLE "cms"."_footer_v_locales" ADD COLUMN "version_contact_email" varchar;
  ALTER TABLE "cms"."_footer_v_locales" ADD COLUMN "version_contact_phone" varchar;
  ALTER TABLE "cms"."_footer_v_locales" ADD COLUMN "version_contact_whatsapp" varchar;
  ALTER TABLE "cms"."_footer_v_locales" ADD COLUMN "version_contact_hours" varchar;
  ALTER TABLE "cms"."_footer_v_locales" ADD COLUMN "version_contact_address" varchar;
  ALTER TABLE "cms"."_footer_v_locales" ADD COLUMN "version_social_linkedin" varchar;
  ALTER TABLE "cms"."_footer_v_locales" ADD COLUMN "version_social_facebook" varchar;
  ALTER TABLE "cms"."pages_blocks_price_tables" ADD CONSTRAINT "pages_blocks_price_tables_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_insights_strip" ADD CONSTRAINT "pages_blocks_insights_strip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_price_tables" ADD CONSTRAINT "_pages_v_blocks_price_tables_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_insights_strip" ADD CONSTRAINT "_pages_v_blocks_insights_strip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."insights" ADD CONSTRAINT "insights_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."insights_locales" ADD CONSTRAINT "insights_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."insights"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_insights_v" ADD CONSTRAINT "_insights_v_parent_id_insights_id_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."insights"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_insights_v" ADD CONSTRAINT "_insights_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_insights_v_locales" ADD CONSTRAINT "_insights_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_insights_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_price_tables_order_idx" ON "cms"."pages_blocks_price_tables" USING btree ("_order");
  CREATE INDEX "pages_blocks_price_tables_parent_id_idx" ON "cms"."pages_blocks_price_tables" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_price_tables_path_idx" ON "cms"."pages_blocks_price_tables" USING btree ("_path");
  CREATE INDEX "pages_blocks_price_tables_locale_idx" ON "cms"."pages_blocks_price_tables" USING btree ("_locale");
  CREATE INDEX "pages_blocks_insights_strip_order_idx" ON "cms"."pages_blocks_insights_strip" USING btree ("_order");
  CREATE INDEX "pages_blocks_insights_strip_parent_id_idx" ON "cms"."pages_blocks_insights_strip" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_insights_strip_path_idx" ON "cms"."pages_blocks_insights_strip" USING btree ("_path");
  CREATE INDEX "pages_blocks_insights_strip_locale_idx" ON "cms"."pages_blocks_insights_strip" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_price_tables_order_idx" ON "cms"."_pages_v_blocks_price_tables" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_price_tables_parent_id_idx" ON "cms"."_pages_v_blocks_price_tables" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_price_tables_path_idx" ON "cms"."_pages_v_blocks_price_tables" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_price_tables_locale_idx" ON "cms"."_pages_v_blocks_price_tables" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_insights_strip_order_idx" ON "cms"."_pages_v_blocks_insights_strip" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_insights_strip_parent_id_idx" ON "cms"."_pages_v_blocks_insights_strip" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_insights_strip_path_idx" ON "cms"."_pages_v_blocks_insights_strip" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_insights_strip_locale_idx" ON "cms"."_pages_v_blocks_insights_strip" USING btree ("_locale");
  CREATE UNIQUE INDEX "insights_slug_idx" ON "cms"."insights" USING btree ("slug");
  CREATE INDEX "insights_published_at_idx" ON "cms"."insights" USING btree ("published_at");
  CREATE INDEX "insights_image_idx" ON "cms"."insights" USING btree ("image_id");
  CREATE INDEX "insights_updated_at_idx" ON "cms"."insights" USING btree ("updated_at");
  CREATE INDEX "insights_created_at_idx" ON "cms"."insights" USING btree ("created_at");
  CREATE INDEX "insights__status_idx" ON "cms"."insights" USING btree ("_status");
  CREATE UNIQUE INDEX "insights_locales_locale_parent_id_unique" ON "cms"."insights_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_insights_v_parent_idx" ON "cms"."_insights_v" USING btree ("parent_id");
  CREATE INDEX "_insights_v_version_version_slug_idx" ON "cms"."_insights_v" USING btree ("version_slug");
  CREATE INDEX "_insights_v_version_version_published_at_idx" ON "cms"."_insights_v" USING btree ("version_published_at");
  CREATE INDEX "_insights_v_version_version_image_idx" ON "cms"."_insights_v" USING btree ("version_image_id");
  CREATE INDEX "_insights_v_version_version_updated_at_idx" ON "cms"."_insights_v" USING btree ("version_updated_at");
  CREATE INDEX "_insights_v_version_version_created_at_idx" ON "cms"."_insights_v" USING btree ("version_created_at");
  CREATE INDEX "_insights_v_version_version__status_idx" ON "cms"."_insights_v" USING btree ("version__status");
  CREATE INDEX "_insights_v_created_at_idx" ON "cms"."_insights_v" USING btree ("created_at");
  CREATE INDEX "_insights_v_updated_at_idx" ON "cms"."_insights_v" USING btree ("updated_at");
  CREATE INDEX "_insights_v_snapshot_idx" ON "cms"."_insights_v" USING btree ("snapshot");
  CREATE INDEX "_insights_v_published_locale_idx" ON "cms"."_insights_v" USING btree ("published_locale");
  CREATE INDEX "_insights_v_latest_idx" ON "cms"."_insights_v" USING btree ("latest");
  CREATE INDEX "_insights_v_autosave_idx" ON "cms"."_insights_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "_insights_v_locales_locale_parent_id_unique" ON "cms"."_insights_v_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_insights_fk" FOREIGN KEY ("insights_id") REFERENCES "cms"."insights"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_insights_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("insights_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."pages_blocks_price_tables" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_insights_strip" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_price_tables" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_insights_strip" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."insights" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."insights_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_insights_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_insights_v_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."pages_blocks_price_tables" CASCADE;
  DROP TABLE "cms"."pages_blocks_insights_strip" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_price_tables" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_insights_strip" CASCADE;
  DROP TABLE "cms"."insights" CASCADE;
  DROP TABLE "cms"."insights_locales" CASCADE;
  DROP TABLE "cms"."_insights_v" CASCADE;
  DROP TABLE "cms"."_insights_v_locales" CASCADE;
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_insights_fk";
  
  DROP INDEX "cms"."payload_locked_documents_rels_insights_id_idx";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "insights_id";
  ALTER TABLE "cms"."footer_locales" DROP COLUMN "contact_email";
  ALTER TABLE "cms"."footer_locales" DROP COLUMN "contact_phone";
  ALTER TABLE "cms"."footer_locales" DROP COLUMN "contact_whatsapp";
  ALTER TABLE "cms"."footer_locales" DROP COLUMN "contact_hours";
  ALTER TABLE "cms"."footer_locales" DROP COLUMN "contact_address";
  ALTER TABLE "cms"."footer_locales" DROP COLUMN "social_linkedin";
  ALTER TABLE "cms"."footer_locales" DROP COLUMN "social_facebook";
  ALTER TABLE "cms"."_footer_v_locales" DROP COLUMN "version_contact_email";
  ALTER TABLE "cms"."_footer_v_locales" DROP COLUMN "version_contact_phone";
  ALTER TABLE "cms"."_footer_v_locales" DROP COLUMN "version_contact_whatsapp";
  ALTER TABLE "cms"."_footer_v_locales" DROP COLUMN "version_contact_hours";
  ALTER TABLE "cms"."_footer_v_locales" DROP COLUMN "version_contact_address";
  ALTER TABLE "cms"."_footer_v_locales" DROP COLUMN "version_social_linkedin";
  ALTER TABLE "cms"."_footer_v_locales" DROP COLUMN "version_social_facebook";
  DROP TYPE "cms"."enum_pages_blocks_insights_strip_tone";
  DROP TYPE "cms"."enum_pages_blocks_insights_strip_topic";
  DROP TYPE "cms"."enum_pages_blocks_insights_strip_more_to";
  DROP TYPE "cms"."enum__pages_v_blocks_insights_strip_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_insights_strip_topic";
  DROP TYPE "cms"."enum__pages_v_blocks_insights_strip_more_to";
  DROP TYPE "cms"."enum_insights_topic";
  DROP TYPE "cms"."enum_insights_status";
  DROP TYPE "cms"."enum__insights_v_version_topic";
  DROP TYPE "cms"."enum__insights_v_version_status";
  DROP TYPE "cms"."enum__insights_v_published_locale";`)
}
