import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_partners_markets" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_partners_feature" AS ENUM('email');
  CREATE TYPE "cms"."enum_client_logos_markets" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_proof_numbers_markets" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_proof_numbers_calculated" AS ENUM('typed', 'medianFirstReply');
  CREATE TYPE "cms"."enum_team_members_markets" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_testimonials_markets" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_showcase_sites_markets" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_announcement_markets" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_announcement_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TABLE "cms"."pages_blocks_proof_strip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"numbers" boolean DEFAULT true,
  	"partners_heading" varchar,
  	"clients_heading" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_proof_strip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"numbers" boolean DEFAULT true,
  	"partners_heading" varchar,
  	"clients_heading" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."partners_markets" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum_partners_markets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."partners" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_order" varchar,
  	"name" varchar NOT NULL,
  	"badge" varchar NOT NULL,
  	"logo_id" integer,
  	"link" varchar,
  	"feature" "cms"."enum_partners_feature",
  	"evidence" varchar,
  	"approved" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."client_logos_markets" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum_client_logos_markets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."client_logos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_order" varchar,
  	"company" varchar NOT NULL,
  	"logo_id" integer,
  	"website" varchar,
  	"permission" boolean DEFAULT false,
  	"permission_date" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."proof_numbers_markets" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum_proof_numbers_markets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."proof_numbers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_order" varchar,
  	"calculated" "cms"."enum_proof_numbers_calculated" DEFAULT 'typed' NOT NULL,
  	"value" varchar,
  	"label" varchar NOT NULL,
  	"source" varchar,
  	"visible" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."team_members_markets" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum_team_members_markets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."team_members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_order" varchar,
  	"name" varchar NOT NULL,
  	"role" varchar NOT NULL,
  	"photo_id" integer,
  	"visible" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."testimonials_markets" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum_testimonials_markets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."testimonials" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_order" varchar,
  	"quote" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"role" varchar,
  	"company" varchar,
  	"logo_id" integer,
  	"result" varchar,
  	"permission" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."showcase_sites_markets" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum_showcase_sites_markets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."showcase_sites" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_order" varchar,
  	"client" varchar NOT NULL,
  	"screenshot_id" integer NOT NULL,
  	"industry" varchar,
  	"url" varchar,
  	"permission" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."announcement_markets" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum_announcement_markets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."announcement" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"link_label" varchar,
  	"link_to" "cms"."enum_announcement_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"starts_at" timestamp(3) with time zone,
  	"ends_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "cms"."pages_blocks_testimonials_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_logo_strip_logos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_testimonials_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_logo_strip_logos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."pages_blocks_testimonials_items" CASCADE;
  DROP TABLE "cms"."pages_blocks_logo_strip_logos" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_testimonials_items" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_logo_strip_logos" CASCADE;
  ALTER TABLE "cms"."pages_blocks_team_section" ADD COLUMN "reply_line" varchar;
  ALTER TABLE "cms"."_pages_v_blocks_team_section" ADD COLUMN "reply_line" varchar;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "partners_id" integer;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "client_logos_id" integer;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "proof_numbers_id" integer;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "team_members_id" integer;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "testimonials_id" integer;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "showcase_sites_id" integer;
  ALTER TABLE "cms"."pages_blocks_proof_strip" ADD CONSTRAINT "pages_blocks_proof_strip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_proof_strip" ADD CONSTRAINT "_pages_v_blocks_proof_strip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."partners_markets" ADD CONSTRAINT "partners_markets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."partners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."partners" ADD CONSTRAINT "partners_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."client_logos_markets" ADD CONSTRAINT "client_logos_markets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."client_logos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."client_logos" ADD CONSTRAINT "client_logos_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."proof_numbers_markets" ADD CONSTRAINT "proof_numbers_markets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."proof_numbers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."team_members_markets" ADD CONSTRAINT "team_members_markets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."team_members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."team_members" ADD CONSTRAINT "team_members_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."testimonials_markets" ADD CONSTRAINT "testimonials_markets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."testimonials" ADD CONSTRAINT "testimonials_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."showcase_sites_markets" ADD CONSTRAINT "showcase_sites_markets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."showcase_sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."showcase_sites" ADD CONSTRAINT "showcase_sites_screenshot_id_media_id_fk" FOREIGN KEY ("screenshot_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."announcement_markets" ADD CONSTRAINT "announcement_markets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."announcement"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_proof_strip_order_idx" ON "cms"."pages_blocks_proof_strip" USING btree ("_order");
  CREATE INDEX "pages_blocks_proof_strip_parent_id_idx" ON "cms"."pages_blocks_proof_strip" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_proof_strip_path_idx" ON "cms"."pages_blocks_proof_strip" USING btree ("_path");
  CREATE INDEX "pages_blocks_proof_strip_locale_idx" ON "cms"."pages_blocks_proof_strip" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_proof_strip_order_idx" ON "cms"."_pages_v_blocks_proof_strip" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_proof_strip_parent_id_idx" ON "cms"."_pages_v_blocks_proof_strip" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_proof_strip_path_idx" ON "cms"."_pages_v_blocks_proof_strip" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_proof_strip_locale_idx" ON "cms"."_pages_v_blocks_proof_strip" USING btree ("_locale");
  CREATE INDEX "partners_markets_order_idx" ON "cms"."partners_markets" USING btree ("order");
  CREATE INDEX "partners_markets_parent_idx" ON "cms"."partners_markets" USING btree ("parent_id");
  CREATE INDEX "partners__order_idx" ON "cms"."partners" USING btree ("_order");
  CREATE INDEX "partners_logo_idx" ON "cms"."partners" USING btree ("logo_id");
  CREATE INDEX "partners_updated_at_idx" ON "cms"."partners" USING btree ("updated_at");
  CREATE INDEX "partners_created_at_idx" ON "cms"."partners" USING btree ("created_at");
  CREATE INDEX "client_logos_markets_order_idx" ON "cms"."client_logos_markets" USING btree ("order");
  CREATE INDEX "client_logos_markets_parent_idx" ON "cms"."client_logos_markets" USING btree ("parent_id");
  CREATE INDEX "client_logos__order_idx" ON "cms"."client_logos" USING btree ("_order");
  CREATE INDEX "client_logos_logo_idx" ON "cms"."client_logos" USING btree ("logo_id");
  CREATE INDEX "client_logos_updated_at_idx" ON "cms"."client_logos" USING btree ("updated_at");
  CREATE INDEX "client_logos_created_at_idx" ON "cms"."client_logos" USING btree ("created_at");
  CREATE INDEX "proof_numbers_markets_order_idx" ON "cms"."proof_numbers_markets" USING btree ("order");
  CREATE INDEX "proof_numbers_markets_parent_idx" ON "cms"."proof_numbers_markets" USING btree ("parent_id");
  CREATE INDEX "proof_numbers__order_idx" ON "cms"."proof_numbers" USING btree ("_order");
  CREATE INDEX "proof_numbers_updated_at_idx" ON "cms"."proof_numbers" USING btree ("updated_at");
  CREATE INDEX "proof_numbers_created_at_idx" ON "cms"."proof_numbers" USING btree ("created_at");
  CREATE INDEX "team_members_markets_order_idx" ON "cms"."team_members_markets" USING btree ("order");
  CREATE INDEX "team_members_markets_parent_idx" ON "cms"."team_members_markets" USING btree ("parent_id");
  CREATE INDEX "team_members__order_idx" ON "cms"."team_members" USING btree ("_order");
  CREATE INDEX "team_members_photo_idx" ON "cms"."team_members" USING btree ("photo_id");
  CREATE INDEX "team_members_updated_at_idx" ON "cms"."team_members" USING btree ("updated_at");
  CREATE INDEX "team_members_created_at_idx" ON "cms"."team_members" USING btree ("created_at");
  CREATE INDEX "testimonials_markets_order_idx" ON "cms"."testimonials_markets" USING btree ("order");
  CREATE INDEX "testimonials_markets_parent_idx" ON "cms"."testimonials_markets" USING btree ("parent_id");
  CREATE INDEX "testimonials__order_idx" ON "cms"."testimonials" USING btree ("_order");
  CREATE INDEX "testimonials_logo_idx" ON "cms"."testimonials" USING btree ("logo_id");
  CREATE INDEX "testimonials_updated_at_idx" ON "cms"."testimonials" USING btree ("updated_at");
  CREATE INDEX "testimonials_created_at_idx" ON "cms"."testimonials" USING btree ("created_at");
  CREATE INDEX "showcase_sites_markets_order_idx" ON "cms"."showcase_sites_markets" USING btree ("order");
  CREATE INDEX "showcase_sites_markets_parent_idx" ON "cms"."showcase_sites_markets" USING btree ("parent_id");
  CREATE INDEX "showcase_sites__order_idx" ON "cms"."showcase_sites" USING btree ("_order");
  CREATE INDEX "showcase_sites_screenshot_idx" ON "cms"."showcase_sites" USING btree ("screenshot_id");
  CREATE INDEX "showcase_sites_updated_at_idx" ON "cms"."showcase_sites" USING btree ("updated_at");
  CREATE INDEX "showcase_sites_created_at_idx" ON "cms"."showcase_sites" USING btree ("created_at");
  CREATE INDEX "announcement_markets_order_idx" ON "cms"."announcement_markets" USING btree ("order");
  CREATE INDEX "announcement_markets_parent_idx" ON "cms"."announcement_markets" USING btree ("parent_id");
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_partners_fk" FOREIGN KEY ("partners_id") REFERENCES "cms"."partners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_client_logos_fk" FOREIGN KEY ("client_logos_id") REFERENCES "cms"."client_logos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_proof_numbers_fk" FOREIGN KEY ("proof_numbers_id") REFERENCES "cms"."proof_numbers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_team_members_fk" FOREIGN KEY ("team_members_id") REFERENCES "cms"."team_members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_testimonials_fk" FOREIGN KEY ("testimonials_id") REFERENCES "cms"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_showcase_sites_fk" FOREIGN KEY ("showcase_sites_id") REFERENCES "cms"."showcase_sites"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_partners_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("partners_id");
  CREATE INDEX "payload_locked_documents_rels_client_logos_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("client_logos_id");
  CREATE INDEX "payload_locked_documents_rels_proof_numbers_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("proof_numbers_id");
  CREATE INDEX "payload_locked_documents_rels_team_members_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("team_members_id");
  CREATE INDEX "payload_locked_documents_rels_testimonials_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("testimonials_id");
  CREATE INDEX "payload_locked_documents_rels_showcase_sites_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("showcase_sites_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "cms"."pages_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"name" varchar,
  	"role" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_logo_strip_logos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"image_id" integer
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"name" varchar,
  	"role" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_logo_strip_logos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"image_id" integer,
  	"_uuid" varchar
  );
  
  ALTER TABLE "cms"."pages_blocks_proof_strip" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_proof_strip" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."partners_markets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."partners" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."client_logos_markets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."client_logos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."proof_numbers_markets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."proof_numbers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."team_members_markets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."team_members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."testimonials_markets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."testimonials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."showcase_sites_markets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."showcase_sites" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."announcement_markets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."announcement" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."pages_blocks_proof_strip" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_proof_strip" CASCADE;
  DROP TABLE "cms"."partners_markets" CASCADE;
  DROP TABLE "cms"."partners" CASCADE;
  DROP TABLE "cms"."client_logos_markets" CASCADE;
  DROP TABLE "cms"."client_logos" CASCADE;
  DROP TABLE "cms"."proof_numbers_markets" CASCADE;
  DROP TABLE "cms"."proof_numbers" CASCADE;
  DROP TABLE "cms"."team_members_markets" CASCADE;
  DROP TABLE "cms"."team_members" CASCADE;
  DROP TABLE "cms"."testimonials_markets" CASCADE;
  DROP TABLE "cms"."testimonials" CASCADE;
  DROP TABLE "cms"."showcase_sites_markets" CASCADE;
  DROP TABLE "cms"."showcase_sites" CASCADE;
  DROP TABLE "cms"."announcement_markets" CASCADE;
  DROP TABLE "cms"."announcement" CASCADE;
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_partners_fk";
  
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_client_logos_fk";
  
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_proof_numbers_fk";
  
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_team_members_fk";
  
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_testimonials_fk";
  
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_showcase_sites_fk";
  
  DROP INDEX "cms"."payload_locked_documents_rels_partners_id_idx";
  DROP INDEX "cms"."payload_locked_documents_rels_client_logos_id_idx";
  DROP INDEX "cms"."payload_locked_documents_rels_proof_numbers_id_idx";
  DROP INDEX "cms"."payload_locked_documents_rels_team_members_id_idx";
  DROP INDEX "cms"."payload_locked_documents_rels_testimonials_id_idx";
  DROP INDEX "cms"."payload_locked_documents_rels_showcase_sites_id_idx";
  ALTER TABLE "cms"."pages_blocks_testimonials_items" ADD CONSTRAINT "pages_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_logo_strip_logos" ADD CONSTRAINT "pages_blocks_logo_strip_logos_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_logo_strip_logos" ADD CONSTRAINT "pages_blocks_logo_strip_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_logo_strip"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_testimonials_items" ADD CONSTRAINT "_pages_v_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_logo_strip_logos" ADD CONSTRAINT "_pages_v_blocks_logo_strip_logos_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_logo_strip_logos" ADD CONSTRAINT "_pages_v_blocks_logo_strip_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_logo_strip"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_testimonials_items_order_idx" ON "cms"."pages_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_testimonials_items_parent_id_idx" ON "cms"."pages_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_testimonials_items_locale_idx" ON "cms"."pages_blocks_testimonials_items" USING btree ("_locale");
  CREATE INDEX "pages_blocks_logo_strip_logos_order_idx" ON "cms"."pages_blocks_logo_strip_logos" USING btree ("_order");
  CREATE INDEX "pages_blocks_logo_strip_logos_parent_id_idx" ON "cms"."pages_blocks_logo_strip_logos" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_logo_strip_logos_locale_idx" ON "cms"."pages_blocks_logo_strip_logos" USING btree ("_locale");
  CREATE INDEX "pages_blocks_logo_strip_logos_image_idx" ON "cms"."pages_blocks_logo_strip_logos" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_testimonials_items_order_idx" ON "cms"."_pages_v_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_testimonials_items_parent_id_idx" ON "cms"."_pages_v_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_items_locale_idx" ON "cms"."_pages_v_blocks_testimonials_items" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_logo_strip_logos_order_idx" ON "cms"."_pages_v_blocks_logo_strip_logos" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_logo_strip_logos_parent_id_idx" ON "cms"."_pages_v_blocks_logo_strip_logos" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_logo_strip_logos_locale_idx" ON "cms"."_pages_v_blocks_logo_strip_logos" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_logo_strip_logos_image_idx" ON "cms"."_pages_v_blocks_logo_strip_logos" USING btree ("image_id");
  ALTER TABLE "cms"."pages_blocks_team_section" DROP COLUMN "reply_line";
  ALTER TABLE "cms"."_pages_v_blocks_team_section" DROP COLUMN "reply_line";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "partners_id";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "client_logos_id";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "proof_numbers_id";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "team_members_id";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "testimonials_id";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "showcase_sites_id";
  DROP TYPE "cms"."enum_partners_markets";
  DROP TYPE "cms"."enum_partners_feature";
  DROP TYPE "cms"."enum_client_logos_markets";
  DROP TYPE "cms"."enum_proof_numbers_markets";
  DROP TYPE "cms"."enum_proof_numbers_calculated";
  DROP TYPE "cms"."enum_team_members_markets";
  DROP TYPE "cms"."enum_testimonials_markets";
  DROP TYPE "cms"."enum_showcase_sites_markets";
  DROP TYPE "cms"."enum_announcement_markets";
  DROP TYPE "cms"."enum_announcement_link_to";`)
}
