import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_pages_style" AS ENUM('landing', 'document');
  CREATE TYPE "cms"."enum__pages_v_version_style" AS ENUM('landing', 'document');
  CREATE TYPE "cms"."enum_legal_kind" AS ENUM('terms', 'privacy', 'refunds', 'service-providers', 'data-protection');
  CREATE TYPE "cms"."enum_legal_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__legal_v_version_kind" AS ENUM('terms', 'privacy', 'refunds', 'service-providers', 'data-protection');
  CREATE TYPE "cms"."enum__legal_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__legal_v_published_locale" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_header_groups_links_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_header_groups_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'earth', 'check', 'receipt');
  CREATE TYPE "cms"."enum_header_pages_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_header_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum_header_menu_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__header_v_version_groups_links_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__header_v_version_groups_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'earth', 'check', 'receipt');
  CREATE TYPE "cms"."enum__header_v_version_pages_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__header_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__header_v_published_locale" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum__header_v_version_menu_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_footer_columns_links_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_footer_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__footer_v_version_columns_links_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__footer_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__footer_v_published_locale" AS ENUM('bw', 'za', 'zw', 'global');
  ALTER TYPE "cms"."enum_pages_blocks_feature_cards_items_icon" ADD VALUE 'earth' BEFORE 'check';
  ALTER TYPE "cms"."enum_pages_blocks_services_grid_cards_icon" ADD VALUE 'earth' BEFORE 'check';
  ALTER TYPE "cms"."enum_pages_blocks_image_text_points_icon" ADD VALUE 'earth' BEFORE 'check';
  ALTER TYPE "cms"."enum__pages_v_blocks_feature_cards_items_icon" ADD VALUE 'earth' BEFORE 'check';
  ALTER TYPE "cms"."enum__pages_v_blocks_services_grid_cards_icon" ADD VALUE 'earth' BEFORE 'check';
  ALTER TYPE "cms"."enum__pages_v_blocks_image_text_points_icon" ADD VALUE 'earth' BEFORE 'check';
  CREATE TABLE "cms"."pages_blocks_page_intro" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"show_tax_note" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_assistant_notice" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_page_intro" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"show_tax_note" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_assistant_notice" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."legal" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "cms"."enum_legal_kind",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "cms"."enum_legal_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "cms"."legal_locales" (
  	"title" varchar,
  	"updated" varchar,
  	"draft_notice" varchar DEFAULT 'DRAFT FOR LEGAL REVIEW. Not in force until approved by an attorney.',
  	"approved_by_legal" boolean DEFAULT false,
  	"body" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "cms"."_legal_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_kind" "cms"."enum__legal_v_version_kind",
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "cms"."enum__legal_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "cms"."enum__legal_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "cms"."_legal_v_locales" (
  	"version_title" varchar,
  	"version_updated" varchar,
  	"version_draft_notice" varchar DEFAULT 'DRAFT FOR LEGAL REVIEW. Not in force until approved by an attorney.',
  	"version_approved_by_legal" boolean DEFAULT false,
  	"version_body" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "cms"."header_groups_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_label" varchar,
  	"link_to" "cms"."enum_header_groups_links_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar
  );
  
  CREATE TABLE "cms"."header_groups" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "cms"."enum_header_groups_icon",
  	"title" varchar,
  	"blurb" varchar
  );
  
  CREATE TABLE "cms"."header_pages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_label" varchar,
  	"link_to" "cms"."enum_header_pages_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar
  );
  
  CREATE TABLE "cms"."header" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_status" "cms"."enum_header_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "cms"."header_locales" (
  	"menu_note" varchar,
  	"menu_link_label" varchar,
  	"menu_link_to" "cms"."enum_header_menu_link_to" DEFAULT 'market',
  	"menu_link_path" varchar,
  	"menu_link_subject" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "cms"."_header_v_version_groups_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"link_label" varchar,
  	"link_to" "cms"."enum__header_v_version_groups_links_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_header_v_version_groups" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "cms"."enum__header_v_version_groups_icon",
  	"title" varchar,
  	"blurb" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_header_v_version_pages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"link_label" varchar,
  	"link_to" "cms"."enum__header_v_version_pages_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_header_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version__status" "cms"."enum__header_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "cms"."enum__header_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "cms"."_header_v_locales" (
  	"version_menu_note" varchar,
  	"version_menu_link_label" varchar,
  	"version_menu_link_to" "cms"."enum__header_v_version_menu_link_to" DEFAULT 'market',
  	"version_menu_link_path" varchar,
  	"version_menu_link_subject" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "cms"."footer_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_label" varchar,
  	"link_to" "cms"."enum_footer_columns_links_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar
  );
  
  CREATE TABLE "cms"."footer_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar
  );
  
  CREATE TABLE "cms"."footer" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_status" "cms"."enum_footer_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "cms"."footer_locales" (
  	"tagline" varchar,
  	"contact_heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "cms"."_footer_v_version_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"link_label" varchar,
  	"link_to" "cms"."enum__footer_v_version_columns_links_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_footer_v_version_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_footer_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version__status" "cms"."enum__footer_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "cms"."enum__footer_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "cms"."_footer_v_locales" (
  	"version_tagline" varchar,
  	"version_contact_heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "cms"."pages" ADD COLUMN "style" "cms"."enum_pages_style" DEFAULT 'landing';
  ALTER TABLE "cms"."_pages_v" ADD COLUMN "version_style" "cms"."enum__pages_v_version_style" DEFAULT 'landing';
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "legal_id" integer;
  ALTER TABLE "cms"."pages_blocks_page_intro" ADD CONSTRAINT "pages_blocks_page_intro_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_assistant_notice" ADD CONSTRAINT "pages_blocks_assistant_notice_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_page_intro" ADD CONSTRAINT "_pages_v_blocks_page_intro_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_assistant_notice" ADD CONSTRAINT "_pages_v_blocks_assistant_notice_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."legal_locales" ADD CONSTRAINT "legal_locales_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."legal_locales" ADD CONSTRAINT "legal_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."legal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_legal_v" ADD CONSTRAINT "_legal_v_parent_id_legal_id_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."legal"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_legal_v_locales" ADD CONSTRAINT "_legal_v_locales_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_legal_v_locales" ADD CONSTRAINT "_legal_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_legal_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_groups_links" ADD CONSTRAINT "header_groups_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_groups" ADD CONSTRAINT "header_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_pages" ADD CONSTRAINT "header_pages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_locales" ADD CONSTRAINT "header_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_version_groups_links" ADD CONSTRAINT "_header_v_version_groups_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v_version_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_version_groups" ADD CONSTRAINT "_header_v_version_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_version_pages" ADD CONSTRAINT "_header_v_version_pages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_locales" ADD CONSTRAINT "_header_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."footer_columns_links" ADD CONSTRAINT "footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."footer_columns" ADD CONSTRAINT "footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."footer_locales" ADD CONSTRAINT "footer_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_footer_v_version_columns_links" ADD CONSTRAINT "_footer_v_version_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_footer_v_version_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_footer_v_version_columns" ADD CONSTRAINT "_footer_v_version_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_footer_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_footer_v_locales" ADD CONSTRAINT "_footer_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_footer_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_page_intro_order_idx" ON "cms"."pages_blocks_page_intro" USING btree ("_order");
  CREATE INDEX "pages_blocks_page_intro_parent_id_idx" ON "cms"."pages_blocks_page_intro" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_page_intro_path_idx" ON "cms"."pages_blocks_page_intro" USING btree ("_path");
  CREATE INDEX "pages_blocks_page_intro_locale_idx" ON "cms"."pages_blocks_page_intro" USING btree ("_locale");
  CREATE INDEX "pages_blocks_assistant_notice_order_idx" ON "cms"."pages_blocks_assistant_notice" USING btree ("_order");
  CREATE INDEX "pages_blocks_assistant_notice_parent_id_idx" ON "cms"."pages_blocks_assistant_notice" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_assistant_notice_path_idx" ON "cms"."pages_blocks_assistant_notice" USING btree ("_path");
  CREATE INDEX "pages_blocks_assistant_notice_locale_idx" ON "cms"."pages_blocks_assistant_notice" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_page_intro_order_idx" ON "cms"."_pages_v_blocks_page_intro" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_page_intro_parent_id_idx" ON "cms"."_pages_v_blocks_page_intro" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_page_intro_path_idx" ON "cms"."_pages_v_blocks_page_intro" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_page_intro_locale_idx" ON "cms"."_pages_v_blocks_page_intro" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_assistant_notice_order_idx" ON "cms"."_pages_v_blocks_assistant_notice" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_assistant_notice_parent_id_idx" ON "cms"."_pages_v_blocks_assistant_notice" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_assistant_notice_path_idx" ON "cms"."_pages_v_blocks_assistant_notice" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_assistant_notice_locale_idx" ON "cms"."_pages_v_blocks_assistant_notice" USING btree ("_locale");
  CREATE UNIQUE INDEX "legal_kind_idx" ON "cms"."legal" USING btree ("kind");
  CREATE INDEX "legal_updated_at_idx" ON "cms"."legal" USING btree ("updated_at");
  CREATE INDEX "legal_created_at_idx" ON "cms"."legal" USING btree ("created_at");
  CREATE INDEX "legal__status_idx" ON "cms"."legal" USING btree ("_status");
  CREATE INDEX "legal_seo_seo_image_idx" ON "cms"."legal_locales" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "legal_locales_locale_parent_id_unique" ON "cms"."legal_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_legal_v_parent_idx" ON "cms"."_legal_v" USING btree ("parent_id");
  CREATE INDEX "_legal_v_version_version_kind_idx" ON "cms"."_legal_v" USING btree ("version_kind");
  CREATE INDEX "_legal_v_version_version_updated_at_idx" ON "cms"."_legal_v" USING btree ("version_updated_at");
  CREATE INDEX "_legal_v_version_version_created_at_idx" ON "cms"."_legal_v" USING btree ("version_created_at");
  CREATE INDEX "_legal_v_version_version__status_idx" ON "cms"."_legal_v" USING btree ("version__status");
  CREATE INDEX "_legal_v_created_at_idx" ON "cms"."_legal_v" USING btree ("created_at");
  CREATE INDEX "_legal_v_updated_at_idx" ON "cms"."_legal_v" USING btree ("updated_at");
  CREATE INDEX "_legal_v_snapshot_idx" ON "cms"."_legal_v" USING btree ("snapshot");
  CREATE INDEX "_legal_v_published_locale_idx" ON "cms"."_legal_v" USING btree ("published_locale");
  CREATE INDEX "_legal_v_latest_idx" ON "cms"."_legal_v" USING btree ("latest");
  CREATE INDEX "_legal_v_autosave_idx" ON "cms"."_legal_v" USING btree ("autosave");
  CREATE INDEX "_legal_v_version_seo_version_seo_image_idx" ON "cms"."_legal_v_locales" USING btree ("version_seo_image_id");
  CREATE UNIQUE INDEX "_legal_v_locales_locale_parent_id_unique" ON "cms"."_legal_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "header_groups_links_order_idx" ON "cms"."header_groups_links" USING btree ("_order");
  CREATE INDEX "header_groups_links_parent_id_idx" ON "cms"."header_groups_links" USING btree ("_parent_id");
  CREATE INDEX "header_groups_links_locale_idx" ON "cms"."header_groups_links" USING btree ("_locale");
  CREATE INDEX "header_groups_order_idx" ON "cms"."header_groups" USING btree ("_order");
  CREATE INDEX "header_groups_parent_id_idx" ON "cms"."header_groups" USING btree ("_parent_id");
  CREATE INDEX "header_groups_locale_idx" ON "cms"."header_groups" USING btree ("_locale");
  CREATE INDEX "header_pages_order_idx" ON "cms"."header_pages" USING btree ("_order");
  CREATE INDEX "header_pages_parent_id_idx" ON "cms"."header_pages" USING btree ("_parent_id");
  CREATE INDEX "header_pages_locale_idx" ON "cms"."header_pages" USING btree ("_locale");
  CREATE INDEX "header__status_idx" ON "cms"."header" USING btree ("_status");
  CREATE UNIQUE INDEX "header_locales_locale_parent_id_unique" ON "cms"."header_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_header_v_version_groups_links_order_idx" ON "cms"."_header_v_version_groups_links" USING btree ("_order");
  CREATE INDEX "_header_v_version_groups_links_parent_id_idx" ON "cms"."_header_v_version_groups_links" USING btree ("_parent_id");
  CREATE INDEX "_header_v_version_groups_links_locale_idx" ON "cms"."_header_v_version_groups_links" USING btree ("_locale");
  CREATE INDEX "_header_v_version_groups_order_idx" ON "cms"."_header_v_version_groups" USING btree ("_order");
  CREATE INDEX "_header_v_version_groups_parent_id_idx" ON "cms"."_header_v_version_groups" USING btree ("_parent_id");
  CREATE INDEX "_header_v_version_groups_locale_idx" ON "cms"."_header_v_version_groups" USING btree ("_locale");
  CREATE INDEX "_header_v_version_pages_order_idx" ON "cms"."_header_v_version_pages" USING btree ("_order");
  CREATE INDEX "_header_v_version_pages_parent_id_idx" ON "cms"."_header_v_version_pages" USING btree ("_parent_id");
  CREATE INDEX "_header_v_version_pages_locale_idx" ON "cms"."_header_v_version_pages" USING btree ("_locale");
  CREATE INDEX "_header_v_version_version__status_idx" ON "cms"."_header_v" USING btree ("version__status");
  CREATE INDEX "_header_v_created_at_idx" ON "cms"."_header_v" USING btree ("created_at");
  CREATE INDEX "_header_v_updated_at_idx" ON "cms"."_header_v" USING btree ("updated_at");
  CREATE INDEX "_header_v_snapshot_idx" ON "cms"."_header_v" USING btree ("snapshot");
  CREATE INDEX "_header_v_published_locale_idx" ON "cms"."_header_v" USING btree ("published_locale");
  CREATE INDEX "_header_v_latest_idx" ON "cms"."_header_v" USING btree ("latest");
  CREATE INDEX "_header_v_autosave_idx" ON "cms"."_header_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "_header_v_locales_locale_parent_id_unique" ON "cms"."_header_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "footer_columns_links_order_idx" ON "cms"."footer_columns_links" USING btree ("_order");
  CREATE INDEX "footer_columns_links_parent_id_idx" ON "cms"."footer_columns_links" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_links_locale_idx" ON "cms"."footer_columns_links" USING btree ("_locale");
  CREATE INDEX "footer_columns_order_idx" ON "cms"."footer_columns" USING btree ("_order");
  CREATE INDEX "footer_columns_parent_id_idx" ON "cms"."footer_columns" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_locale_idx" ON "cms"."footer_columns" USING btree ("_locale");
  CREATE INDEX "footer__status_idx" ON "cms"."footer" USING btree ("_status");
  CREATE UNIQUE INDEX "footer_locales_locale_parent_id_unique" ON "cms"."footer_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_footer_v_version_columns_links_order_idx" ON "cms"."_footer_v_version_columns_links" USING btree ("_order");
  CREATE INDEX "_footer_v_version_columns_links_parent_id_idx" ON "cms"."_footer_v_version_columns_links" USING btree ("_parent_id");
  CREATE INDEX "_footer_v_version_columns_links_locale_idx" ON "cms"."_footer_v_version_columns_links" USING btree ("_locale");
  CREATE INDEX "_footer_v_version_columns_order_idx" ON "cms"."_footer_v_version_columns" USING btree ("_order");
  CREATE INDEX "_footer_v_version_columns_parent_id_idx" ON "cms"."_footer_v_version_columns" USING btree ("_parent_id");
  CREATE INDEX "_footer_v_version_columns_locale_idx" ON "cms"."_footer_v_version_columns" USING btree ("_locale");
  CREATE INDEX "_footer_v_version_version__status_idx" ON "cms"."_footer_v" USING btree ("version__status");
  CREATE INDEX "_footer_v_created_at_idx" ON "cms"."_footer_v" USING btree ("created_at");
  CREATE INDEX "_footer_v_updated_at_idx" ON "cms"."_footer_v" USING btree ("updated_at");
  CREATE INDEX "_footer_v_snapshot_idx" ON "cms"."_footer_v" USING btree ("snapshot");
  CREATE INDEX "_footer_v_published_locale_idx" ON "cms"."_footer_v" USING btree ("published_locale");
  CREATE INDEX "_footer_v_latest_idx" ON "cms"."_footer_v" USING btree ("latest");
  CREATE INDEX "_footer_v_autosave_idx" ON "cms"."_footer_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "_footer_v_locales_locale_parent_id_unique" ON "cms"."_footer_v_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_legal_fk" FOREIGN KEY ("legal_id") REFERENCES "cms"."legal"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_legal_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("legal_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."pages_blocks_page_intro" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_assistant_notice" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_page_intro" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_assistant_notice" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."legal" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."legal_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_legal_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_legal_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_groups_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_groups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_version_groups_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_version_groups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_version_pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."footer_columns_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."footer_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."footer" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."footer_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_footer_v_version_columns_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_footer_v_version_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_footer_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_footer_v_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."pages_blocks_page_intro" CASCADE;
  DROP TABLE "cms"."pages_blocks_assistant_notice" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_page_intro" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_assistant_notice" CASCADE;
  DROP TABLE "cms"."legal" CASCADE;
  DROP TABLE "cms"."legal_locales" CASCADE;
  DROP TABLE "cms"."_legal_v" CASCADE;
  DROP TABLE "cms"."_legal_v_locales" CASCADE;
  DROP TABLE "cms"."header_groups_links" CASCADE;
  DROP TABLE "cms"."header_groups" CASCADE;
  DROP TABLE "cms"."header_pages" CASCADE;
  DROP TABLE "cms"."header" CASCADE;
  DROP TABLE "cms"."header_locales" CASCADE;
  DROP TABLE "cms"."_header_v_version_groups_links" CASCADE;
  DROP TABLE "cms"."_header_v_version_groups" CASCADE;
  DROP TABLE "cms"."_header_v_version_pages" CASCADE;
  DROP TABLE "cms"."_header_v" CASCADE;
  DROP TABLE "cms"."_header_v_locales" CASCADE;
  DROP TABLE "cms"."footer_columns_links" CASCADE;
  DROP TABLE "cms"."footer_columns" CASCADE;
  DROP TABLE "cms"."footer" CASCADE;
  DROP TABLE "cms"."footer_locales" CASCADE;
  DROP TABLE "cms"."_footer_v_version_columns_links" CASCADE;
  DROP TABLE "cms"."_footer_v_version_columns" CASCADE;
  DROP TABLE "cms"."_footer_v" CASCADE;
  DROP TABLE "cms"."_footer_v_locales" CASCADE;
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_legal_fk";
  
  ALTER TABLE "cms"."pages_blocks_feature_cards_items" ALTER COLUMN "icon" SET DATA TYPE text;
  DROP TYPE "cms"."enum_pages_blocks_feature_cards_items_icon";
  CREATE TYPE "cms"."enum_pages_blocks_feature_cards_items_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  ALTER TABLE "cms"."pages_blocks_feature_cards_items" ALTER COLUMN "icon" SET DATA TYPE "cms"."enum_pages_blocks_feature_cards_items_icon" USING "icon"::"cms"."enum_pages_blocks_feature_cards_items_icon";
  ALTER TABLE "cms"."pages_blocks_services_grid_cards" ALTER COLUMN "icon" SET DATA TYPE text;
  DROP TYPE "cms"."enum_pages_blocks_services_grid_cards_icon";
  CREATE TYPE "cms"."enum_pages_blocks_services_grid_cards_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  ALTER TABLE "cms"."pages_blocks_services_grid_cards" ALTER COLUMN "icon" SET DATA TYPE "cms"."enum_pages_blocks_services_grid_cards_icon" USING "icon"::"cms"."enum_pages_blocks_services_grid_cards_icon";
  ALTER TABLE "cms"."pages_blocks_image_text_points" ALTER COLUMN "icon" SET DATA TYPE text;
  DROP TYPE "cms"."enum_pages_blocks_image_text_points_icon";
  CREATE TYPE "cms"."enum_pages_blocks_image_text_points_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  ALTER TABLE "cms"."pages_blocks_image_text_points" ALTER COLUMN "icon" SET DATA TYPE "cms"."enum_pages_blocks_image_text_points_icon" USING "icon"::"cms"."enum_pages_blocks_image_text_points_icon";
  ALTER TABLE "cms"."_pages_v_blocks_feature_cards_items" ALTER COLUMN "icon" SET DATA TYPE text;
  DROP TYPE "cms"."enum__pages_v_blocks_feature_cards_items_icon";
  CREATE TYPE "cms"."enum__pages_v_blocks_feature_cards_items_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  ALTER TABLE "cms"."_pages_v_blocks_feature_cards_items" ALTER COLUMN "icon" SET DATA TYPE "cms"."enum__pages_v_blocks_feature_cards_items_icon" USING "icon"::"cms"."enum__pages_v_blocks_feature_cards_items_icon";
  ALTER TABLE "cms"."_pages_v_blocks_services_grid_cards" ALTER COLUMN "icon" SET DATA TYPE text;
  DROP TYPE "cms"."enum__pages_v_blocks_services_grid_cards_icon";
  CREATE TYPE "cms"."enum__pages_v_blocks_services_grid_cards_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  ALTER TABLE "cms"."_pages_v_blocks_services_grid_cards" ALTER COLUMN "icon" SET DATA TYPE "cms"."enum__pages_v_blocks_services_grid_cards_icon" USING "icon"::"cms"."enum__pages_v_blocks_services_grid_cards_icon";
  ALTER TABLE "cms"."_pages_v_blocks_image_text_points" ALTER COLUMN "icon" SET DATA TYPE text;
  DROP TYPE "cms"."enum__pages_v_blocks_image_text_points_icon";
  CREATE TYPE "cms"."enum__pages_v_blocks_image_text_points_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  ALTER TABLE "cms"."_pages_v_blocks_image_text_points" ALTER COLUMN "icon" SET DATA TYPE "cms"."enum__pages_v_blocks_image_text_points_icon" USING "icon"::"cms"."enum__pages_v_blocks_image_text_points_icon";
  DROP INDEX "cms"."payload_locked_documents_rels_legal_id_idx";
  ALTER TABLE "cms"."pages" DROP COLUMN "style";
  ALTER TABLE "cms"."_pages_v" DROP COLUMN "version_style";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "legal_id";
  DROP TYPE "cms"."enum_pages_style";
  DROP TYPE "cms"."enum__pages_v_version_style";
  DROP TYPE "cms"."enum_legal_kind";
  DROP TYPE "cms"."enum_legal_status";
  DROP TYPE "cms"."enum__legal_v_version_kind";
  DROP TYPE "cms"."enum__legal_v_version_status";
  DROP TYPE "cms"."enum__legal_v_published_locale";
  DROP TYPE "cms"."enum_header_groups_links_link_to";
  DROP TYPE "cms"."enum_header_groups_icon";
  DROP TYPE "cms"."enum_header_pages_link_to";
  DROP TYPE "cms"."enum_header_status";
  DROP TYPE "cms"."enum_header_menu_link_to";
  DROP TYPE "cms"."enum__header_v_version_groups_links_link_to";
  DROP TYPE "cms"."enum__header_v_version_groups_icon";
  DROP TYPE "cms"."enum__header_v_version_pages_link_to";
  DROP TYPE "cms"."enum__header_v_version_status";
  DROP TYPE "cms"."enum__header_v_published_locale";
  DROP TYPE "cms"."enum__header_v_version_menu_link_to";
  DROP TYPE "cms"."enum_footer_columns_links_link_to";
  DROP TYPE "cms"."enum_footer_status";
  DROP TYPE "cms"."enum__footer_v_version_columns_links_link_to";
  DROP TYPE "cms"."enum__footer_v_version_status";
  DROP TYPE "cms"."enum__footer_v_published_locale";`)
}
