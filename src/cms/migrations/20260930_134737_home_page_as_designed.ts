import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_pages_blocks_home_hero_primary_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum_pages_blocks_home_hero_secondary_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum_pages_blocks_numbered_services_items_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum_pages_blocks_websites_showcase_cards_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum_pages_blocks_team_section_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum_pages_blocks_closing_banner_primary_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum_pages_blocks_faq_more_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum__pages_v_blocks_home_hero_primary_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum__pages_v_blocks_home_hero_secondary_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum__pages_v_blocks_numbered_services_items_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum__pages_v_blocks_websites_showcase_cards_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum__pages_v_blocks_team_section_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum__pages_v_blocks_closing_banner_primary_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum__pages_v_blocks_faq_more_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum_help_section" AS ENUM('getting-started', 'domains', 'email', 'websites', 'security', 'hosting', 'billing', 'account');
  CREATE TYPE "cms"."enum_help_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__help_v_version_section" AS ENUM('getting-started', 'domains', 'email', 'websites', 'security', 'hosting', 'billing', 'account');
  CREATE TYPE "cms"."enum__help_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__help_v_published_locale" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_header_menus_columns_links_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum_header_menus_feature_kind" AS ENUM('domainSearch', 'partnerBadge', 'websitePreview', 'thebe', 'support', 'note');
  CREATE TYPE "cms"."enum_header_menus_feature_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum_header_links_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum__header_v_version_menus_columns_links_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum__header_v_version_menus_feature_kind" AS ENUM('domainSearch', 'partnerBadge', 'websitePreview', 'thebe', 'support', 'note');
  CREATE TYPE "cms"."enum__header_v_version_menus_feature_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  CREATE TYPE "cms"."enum__header_v_version_links_link_to" AS ENUM('market', 'site', 'email', 'thebe');
  ALTER TYPE "cms"."enum_pages_blocks_hero_primary_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum_pages_blocks_hero_secondary_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum_pages_blocks_services_grid_more_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum_pages_blocks_pricing_more_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum_pages_blocks_image_text_card_link_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum_pages_blocks_insights_strip_more_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum_pages_blocks_call_to_action_primary_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum_pages_blocks_call_to_action_secondary_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum__pages_v_blocks_hero_primary_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum__pages_v_blocks_hero_secondary_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum__pages_v_blocks_services_grid_more_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum__pages_v_blocks_pricing_more_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum__pages_v_blocks_image_text_card_link_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum__pages_v_blocks_insights_strip_more_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum__pages_v_blocks_call_to_action_primary_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum__pages_v_blocks_call_to_action_secondary_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum_footer_columns_links_link_to" ADD VALUE 'thebe';
  ALTER TYPE "cms"."enum__footer_v_version_columns_links_link_to" ADD VALUE 'thebe';
  CREATE TABLE "cms"."pages_blocks_home_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"sub" varchar,
  	"sub_phone" varchar,
  	"primary_label" varchar,
  	"primary_to" "cms"."enum_pages_blocks_home_hero_primary_to" DEFAULT 'market',
  	"primary_path" varchar,
  	"primary_subject" varchar,
  	"secondary_label" varchar,
  	"secondary_to" "cms"."enum_pages_blocks_home_hero_secondary_to" DEFAULT 'market',
  	"secondary_path" varchar,
  	"secondary_subject" varchar,
  	"show_console" boolean DEFAULT true,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_domain_store" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"example" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_numbered_services_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"body_phone" varchar,
  	"link_label" varchar,
  	"link_to" "cms"."enum_pages_blocks_numbered_services_items_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_numbered_services" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_email_showcase" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"caption" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_websites_showcase_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"body_phone" varchar,
  	"link_label" varchar,
  	"link_to" "cms"."enum_pages_blocks_websites_showcase_cards_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"products" jsonb
  );
  
  CREATE TABLE "cms"."pages_blocks_websites_showcase_industries" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_websites_showcase" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_security_panel" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_thebe_section_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"accounting" boolean DEFAULT false
  );
  
  CREATE TABLE "cms"."pages_blocks_thebe_section" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"kicker_phone" varchar,
  	"show_accounting" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_plans_table_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"label_phone" varchar,
  	"start" varchar,
  	"start_phone" varchar,
  	"start_included" boolean DEFAULT false,
  	"grow" varchar,
  	"grow_phone" varchar,
  	"grow_included" boolean DEFAULT false,
  	"protect" varchar,
  	"protect_phone" varchar,
  	"protect_included" boolean DEFAULT false
  );
  
  CREATE TABLE "cms"."pages_blocks_plans_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"footnote" varchar,
  	"users" numeric DEFAULT 8,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_compare_table_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"free" varchar,
  	"us" varchar,
  	"label_phone" varchar,
  	"free_phone" varchar,
  	"us_phone" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_compare_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"free_heading" varchar,
  	"us_heading" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_team_section" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"link_label" varchar,
  	"link_to" "cms"."enum_pages_blocks_team_section_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"nsmc_lead" varchar,
  	"nsmc_text" varchar,
  	"nsmc_lead_phone" varchar,
  	"nsmc_text_phone" varchar,
  	"nsmc_link_label" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_closing_banner" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"primary_label" varchar,
  	"primary_to" "cms"."enum_pages_blocks_closing_banner_primary_to" DEFAULT 'market',
  	"primary_path" varchar,
  	"primary_subject" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_home_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"sub" varchar,
  	"sub_phone" varchar,
  	"primary_label" varchar,
  	"primary_to" "cms"."enum__pages_v_blocks_home_hero_primary_to" DEFAULT 'market',
  	"primary_path" varchar,
  	"primary_subject" varchar,
  	"secondary_label" varchar,
  	"secondary_to" "cms"."enum__pages_v_blocks_home_hero_secondary_to" DEFAULT 'market',
  	"secondary_path" varchar,
  	"secondary_subject" varchar,
  	"show_console" boolean DEFAULT true,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_domain_store" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"example" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_numbered_services_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"body_phone" varchar,
  	"link_label" varchar,
  	"link_to" "cms"."enum__pages_v_blocks_numbered_services_items_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_numbered_services" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_email_showcase" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"caption" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_websites_showcase_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"body_phone" varchar,
  	"link_label" varchar,
  	"link_to" "cms"."enum__pages_v_blocks_websites_showcase_cards_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"products" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_websites_showcase_industries" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_websites_showcase" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_security_panel" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_thebe_section_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"accounting" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_thebe_section" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"kicker_phone" varchar,
  	"show_accounting" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_plans_table_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"label_phone" varchar,
  	"start" varchar,
  	"start_phone" varchar,
  	"start_included" boolean DEFAULT false,
  	"grow" varchar,
  	"grow_phone" varchar,
  	"grow_included" boolean DEFAULT false,
  	"protect" varchar,
  	"protect_phone" varchar,
  	"protect_included" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_plans_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"footnote" varchar,
  	"users" numeric DEFAULT 8,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_compare_table_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"free" varchar,
  	"us" varchar,
  	"label_phone" varchar,
  	"free_phone" varchar,
  	"us_phone" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_compare_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"free_heading" varchar,
  	"us_heading" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_team_section" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"anchor" varchar,
  	"kicker" varchar,
  	"heading" varchar,
  	"heading_phone" varchar,
  	"intro" varchar,
  	"intro_phone" varchar,
  	"link_label" varchar,
  	"link_to" "cms"."enum__pages_v_blocks_team_section_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"nsmc_lead" varchar,
  	"nsmc_text" varchar,
  	"nsmc_lead_phone" varchar,
  	"nsmc_text_phone" varchar,
  	"nsmc_link_label" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_closing_banner" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"primary_label" varchar,
  	"primary_to" "cms"."enum__pages_v_blocks_closing_banner_primary_to" DEFAULT 'market',
  	"primary_path" varchar,
  	"primary_subject" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."help" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"section" "cms"."enum_help_section",
  	"order" numeric DEFAULT 100,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "cms"."enum_help_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "cms"."help_locales" (
  	"title" varchar,
  	"summary" varchar,
  	"body" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "cms"."_help_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_section" "cms"."enum__help_v_version_section",
  	"version_order" numeric DEFAULT 100,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "cms"."enum__help_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "cms"."enum__help_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "cms"."_help_v_locales" (
  	"version_title" varchar,
  	"version_summary" varchar,
  	"version_body" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "cms"."header_menus_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_label" varchar,
  	"link_to" "cms"."enum_header_menus_columns_links_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"description" varchar,
  	"products" jsonb
  );
  
  CREATE TABLE "cms"."header_menus_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar
  );
  
  CREATE TABLE "cms"."header_menus" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"right" boolean DEFAULT false,
  	"feature_kind" "cms"."enum_header_menus_feature_kind",
  	"feature_heading" varchar,
  	"feature_text" varchar,
  	"feature_link_label" varchar,
  	"feature_link_to" "cms"."enum_header_menus_feature_link_to" DEFAULT 'market',
  	"feature_link_path" varchar,
  	"feature_link_subject" varchar
  );
  
  CREATE TABLE "cms"."header_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_label" varchar,
  	"link_to" "cms"."enum_header_links_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"description" varchar,
  	"products" jsonb
  );
  
  CREATE TABLE "cms"."_header_v_version_menus_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"link_label" varchar,
  	"link_to" "cms"."enum__header_v_version_menus_columns_links_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"description" varchar,
  	"products" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_header_v_version_menus_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_header_v_version_menus" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"right" boolean DEFAULT false,
  	"feature_kind" "cms"."enum__header_v_version_menus_feature_kind",
  	"feature_heading" varchar,
  	"feature_text" varchar,
  	"feature_link_label" varchar,
  	"feature_link_to" "cms"."enum__header_v_version_menus_feature_link_to" DEFAULT 'market',
  	"feature_link_path" varchar,
  	"feature_link_subject" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_header_v_version_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"link_label" varchar,
  	"link_to" "cms"."enum__header_v_version_links_link_to" DEFAULT 'market',
  	"link_path" varchar,
  	"link_subject" varchar,
  	"description" varchar,
  	"products" jsonb,
  	"_uuid" varchar
  );
  
  ALTER TABLE "cms"."header_groups_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_groups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_version_groups_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_version_groups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_version_pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."header_groups_links" CASCADE;
  DROP TABLE "cms"."header_groups" CASCADE;
  DROP TABLE "cms"."header_pages" CASCADE;
  DROP TABLE "cms"."header_locales" CASCADE;
  DROP TABLE "cms"."_header_v_version_groups_links" CASCADE;
  DROP TABLE "cms"."_header_v_version_groups" CASCADE;
  DROP TABLE "cms"."_header_v_version_pages" CASCADE;
  DROP TABLE "cms"."_header_v_locales" CASCADE;
  ALTER TABLE "cms"."pages_blocks_faq_items" ADD COLUMN "show_on_phone" boolean DEFAULT true;
  ALTER TABLE "cms"."pages_blocks_faq" ADD COLUMN "heading_phone" varchar;
  ALTER TABLE "cms"."pages_blocks_faq" ADD COLUMN "more_label" varchar;
  ALTER TABLE "cms"."pages_blocks_faq" ADD COLUMN "more_to" "cms"."enum_pages_blocks_faq_more_to" DEFAULT 'market';
  ALTER TABLE "cms"."pages_blocks_faq" ADD COLUMN "more_path" varchar;
  ALTER TABLE "cms"."pages_blocks_faq" ADD COLUMN "more_subject" varchar;
  ALTER TABLE "cms"."pages_blocks_insights_strip" ADD COLUMN "heading_phone" varchar;
  ALTER TABLE "cms"."pages_blocks_insights_strip" ADD COLUMN "anchor" varchar;
  ALTER TABLE "cms"."_pages_v_blocks_faq_items" ADD COLUMN "show_on_phone" boolean DEFAULT true;
  ALTER TABLE "cms"."_pages_v_blocks_faq" ADD COLUMN "heading_phone" varchar;
  ALTER TABLE "cms"."_pages_v_blocks_faq" ADD COLUMN "more_label" varchar;
  ALTER TABLE "cms"."_pages_v_blocks_faq" ADD COLUMN "more_to" "cms"."enum__pages_v_blocks_faq_more_to" DEFAULT 'market';
  ALTER TABLE "cms"."_pages_v_blocks_faq" ADD COLUMN "more_path" varchar;
  ALTER TABLE "cms"."_pages_v_blocks_faq" ADD COLUMN "more_subject" varchar;
  ALTER TABLE "cms"."_pages_v_blocks_insights_strip" ADD COLUMN "heading_phone" varchar;
  ALTER TABLE "cms"."_pages_v_blocks_insights_strip" ADD COLUMN "anchor" varchar;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "help_id" integer;
  ALTER TABLE "cms"."footer_locales" ADD COLUMN "newsletter_heading" varchar;
  ALTER TABLE "cms"."footer_locales" ADD COLUMN "newsletter_text" varchar;
  ALTER TABLE "cms"."_footer_v_locales" ADD COLUMN "version_newsletter_heading" varchar;
  ALTER TABLE "cms"."_footer_v_locales" ADD COLUMN "version_newsletter_text" varchar;
  ALTER TABLE "cms"."pages_blocks_home_hero" ADD CONSTRAINT "pages_blocks_home_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_domain_store" ADD CONSTRAINT "pages_blocks_domain_store_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_numbered_services_items" ADD CONSTRAINT "pages_blocks_numbered_services_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_numbered_services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_numbered_services" ADD CONSTRAINT "pages_blocks_numbered_services_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_email_showcase" ADD CONSTRAINT "pages_blocks_email_showcase_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_websites_showcase_cards" ADD CONSTRAINT "pages_blocks_websites_showcase_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_websites_showcase"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_websites_showcase_industries" ADD CONSTRAINT "pages_blocks_websites_showcase_industries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_websites_showcase"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_websites_showcase" ADD CONSTRAINT "pages_blocks_websites_showcase_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_security_panel" ADD CONSTRAINT "pages_blocks_security_panel_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_thebe_section_features" ADD CONSTRAINT "pages_blocks_thebe_section_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_thebe_section"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_thebe_section" ADD CONSTRAINT "pages_blocks_thebe_section_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_plans_table_rows" ADD CONSTRAINT "pages_blocks_plans_table_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_plans_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_plans_table" ADD CONSTRAINT "pages_blocks_plans_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_compare_table_rows" ADD CONSTRAINT "pages_blocks_compare_table_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_compare_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_compare_table" ADD CONSTRAINT "pages_blocks_compare_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_team_section" ADD CONSTRAINT "pages_blocks_team_section_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_closing_banner" ADD CONSTRAINT "pages_blocks_closing_banner_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_home_hero" ADD CONSTRAINT "_pages_v_blocks_home_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_domain_store" ADD CONSTRAINT "_pages_v_blocks_domain_store_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_numbered_services_items" ADD CONSTRAINT "_pages_v_blocks_numbered_services_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_numbered_services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_numbered_services" ADD CONSTRAINT "_pages_v_blocks_numbered_services_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_email_showcase" ADD CONSTRAINT "_pages_v_blocks_email_showcase_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_websites_showcase_cards" ADD CONSTRAINT "_pages_v_blocks_websites_showcase_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_websites_showcase"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_websites_showcase_industries" ADD CONSTRAINT "_pages_v_blocks_websites_showcase_industries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_websites_showcase"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_websites_showcase" ADD CONSTRAINT "_pages_v_blocks_websites_showcase_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_security_panel" ADD CONSTRAINT "_pages_v_blocks_security_panel_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_thebe_section_features" ADD CONSTRAINT "_pages_v_blocks_thebe_section_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_thebe_section"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_thebe_section" ADD CONSTRAINT "_pages_v_blocks_thebe_section_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_plans_table_rows" ADD CONSTRAINT "_pages_v_blocks_plans_table_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_plans_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_plans_table" ADD CONSTRAINT "_pages_v_blocks_plans_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_compare_table_rows" ADD CONSTRAINT "_pages_v_blocks_compare_table_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_compare_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_compare_table" ADD CONSTRAINT "_pages_v_blocks_compare_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_team_section" ADD CONSTRAINT "_pages_v_blocks_team_section_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_closing_banner" ADD CONSTRAINT "_pages_v_blocks_closing_banner_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."help_locales" ADD CONSTRAINT "help_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."help"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_help_v" ADD CONSTRAINT "_help_v_parent_id_help_id_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."help"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_help_v_locales" ADD CONSTRAINT "_help_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_help_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_menus_columns_links" ADD CONSTRAINT "header_menus_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header_menus_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_menus_columns" ADD CONSTRAINT "header_menus_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header_menus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_menus" ADD CONSTRAINT "header_menus_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_links" ADD CONSTRAINT "header_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_version_menus_columns_links" ADD CONSTRAINT "_header_v_version_menus_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v_version_menus_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_version_menus_columns" ADD CONSTRAINT "_header_v_version_menus_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v_version_menus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_version_menus" ADD CONSTRAINT "_header_v_version_menus_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_version_links" ADD CONSTRAINT "_header_v_version_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_home_hero_order_idx" ON "cms"."pages_blocks_home_hero" USING btree ("_order");
  CREATE INDEX "pages_blocks_home_hero_parent_id_idx" ON "cms"."pages_blocks_home_hero" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_home_hero_path_idx" ON "cms"."pages_blocks_home_hero" USING btree ("_path");
  CREATE INDEX "pages_blocks_home_hero_locale_idx" ON "cms"."pages_blocks_home_hero" USING btree ("_locale");
  CREATE INDEX "pages_blocks_domain_store_order_idx" ON "cms"."pages_blocks_domain_store" USING btree ("_order");
  CREATE INDEX "pages_blocks_domain_store_parent_id_idx" ON "cms"."pages_blocks_domain_store" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_domain_store_path_idx" ON "cms"."pages_blocks_domain_store" USING btree ("_path");
  CREATE INDEX "pages_blocks_domain_store_locale_idx" ON "cms"."pages_blocks_domain_store" USING btree ("_locale");
  CREATE INDEX "pages_blocks_numbered_services_items_order_idx" ON "cms"."pages_blocks_numbered_services_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_numbered_services_items_parent_id_idx" ON "cms"."pages_blocks_numbered_services_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_numbered_services_items_locale_idx" ON "cms"."pages_blocks_numbered_services_items" USING btree ("_locale");
  CREATE INDEX "pages_blocks_numbered_services_order_idx" ON "cms"."pages_blocks_numbered_services" USING btree ("_order");
  CREATE INDEX "pages_blocks_numbered_services_parent_id_idx" ON "cms"."pages_blocks_numbered_services" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_numbered_services_path_idx" ON "cms"."pages_blocks_numbered_services" USING btree ("_path");
  CREATE INDEX "pages_blocks_numbered_services_locale_idx" ON "cms"."pages_blocks_numbered_services" USING btree ("_locale");
  CREATE INDEX "pages_blocks_email_showcase_order_idx" ON "cms"."pages_blocks_email_showcase" USING btree ("_order");
  CREATE INDEX "pages_blocks_email_showcase_parent_id_idx" ON "cms"."pages_blocks_email_showcase" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_email_showcase_path_idx" ON "cms"."pages_blocks_email_showcase" USING btree ("_path");
  CREATE INDEX "pages_blocks_email_showcase_locale_idx" ON "cms"."pages_blocks_email_showcase" USING btree ("_locale");
  CREATE INDEX "pages_blocks_websites_showcase_cards_order_idx" ON "cms"."pages_blocks_websites_showcase_cards" USING btree ("_order");
  CREATE INDEX "pages_blocks_websites_showcase_cards_parent_id_idx" ON "cms"."pages_blocks_websites_showcase_cards" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_websites_showcase_cards_locale_idx" ON "cms"."pages_blocks_websites_showcase_cards" USING btree ("_locale");
  CREATE INDEX "pages_blocks_websites_showcase_industries_order_idx" ON "cms"."pages_blocks_websites_showcase_industries" USING btree ("_order");
  CREATE INDEX "pages_blocks_websites_showcase_industries_parent_id_idx" ON "cms"."pages_blocks_websites_showcase_industries" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_websites_showcase_industries_locale_idx" ON "cms"."pages_blocks_websites_showcase_industries" USING btree ("_locale");
  CREATE INDEX "pages_blocks_websites_showcase_order_idx" ON "cms"."pages_blocks_websites_showcase" USING btree ("_order");
  CREATE INDEX "pages_blocks_websites_showcase_parent_id_idx" ON "cms"."pages_blocks_websites_showcase" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_websites_showcase_path_idx" ON "cms"."pages_blocks_websites_showcase" USING btree ("_path");
  CREATE INDEX "pages_blocks_websites_showcase_locale_idx" ON "cms"."pages_blocks_websites_showcase" USING btree ("_locale");
  CREATE INDEX "pages_blocks_security_panel_order_idx" ON "cms"."pages_blocks_security_panel" USING btree ("_order");
  CREATE INDEX "pages_blocks_security_panel_parent_id_idx" ON "cms"."pages_blocks_security_panel" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_security_panel_path_idx" ON "cms"."pages_blocks_security_panel" USING btree ("_path");
  CREATE INDEX "pages_blocks_security_panel_locale_idx" ON "cms"."pages_blocks_security_panel" USING btree ("_locale");
  CREATE INDEX "pages_blocks_thebe_section_features_order_idx" ON "cms"."pages_blocks_thebe_section_features" USING btree ("_order");
  CREATE INDEX "pages_blocks_thebe_section_features_parent_id_idx" ON "cms"."pages_blocks_thebe_section_features" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_thebe_section_features_locale_idx" ON "cms"."pages_blocks_thebe_section_features" USING btree ("_locale");
  CREATE INDEX "pages_blocks_thebe_section_order_idx" ON "cms"."pages_blocks_thebe_section" USING btree ("_order");
  CREATE INDEX "pages_blocks_thebe_section_parent_id_idx" ON "cms"."pages_blocks_thebe_section" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_thebe_section_path_idx" ON "cms"."pages_blocks_thebe_section" USING btree ("_path");
  CREATE INDEX "pages_blocks_thebe_section_locale_idx" ON "cms"."pages_blocks_thebe_section" USING btree ("_locale");
  CREATE INDEX "pages_blocks_plans_table_rows_order_idx" ON "cms"."pages_blocks_plans_table_rows" USING btree ("_order");
  CREATE INDEX "pages_blocks_plans_table_rows_parent_id_idx" ON "cms"."pages_blocks_plans_table_rows" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_plans_table_rows_locale_idx" ON "cms"."pages_blocks_plans_table_rows" USING btree ("_locale");
  CREATE INDEX "pages_blocks_plans_table_order_idx" ON "cms"."pages_blocks_plans_table" USING btree ("_order");
  CREATE INDEX "pages_blocks_plans_table_parent_id_idx" ON "cms"."pages_blocks_plans_table" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_plans_table_path_idx" ON "cms"."pages_blocks_plans_table" USING btree ("_path");
  CREATE INDEX "pages_blocks_plans_table_locale_idx" ON "cms"."pages_blocks_plans_table" USING btree ("_locale");
  CREATE INDEX "pages_blocks_compare_table_rows_order_idx" ON "cms"."pages_blocks_compare_table_rows" USING btree ("_order");
  CREATE INDEX "pages_blocks_compare_table_rows_parent_id_idx" ON "cms"."pages_blocks_compare_table_rows" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_compare_table_rows_locale_idx" ON "cms"."pages_blocks_compare_table_rows" USING btree ("_locale");
  CREATE INDEX "pages_blocks_compare_table_order_idx" ON "cms"."pages_blocks_compare_table" USING btree ("_order");
  CREATE INDEX "pages_blocks_compare_table_parent_id_idx" ON "cms"."pages_blocks_compare_table" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_compare_table_path_idx" ON "cms"."pages_blocks_compare_table" USING btree ("_path");
  CREATE INDEX "pages_blocks_compare_table_locale_idx" ON "cms"."pages_blocks_compare_table" USING btree ("_locale");
  CREATE INDEX "pages_blocks_team_section_order_idx" ON "cms"."pages_blocks_team_section" USING btree ("_order");
  CREATE INDEX "pages_blocks_team_section_parent_id_idx" ON "cms"."pages_blocks_team_section" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_team_section_path_idx" ON "cms"."pages_blocks_team_section" USING btree ("_path");
  CREATE INDEX "pages_blocks_team_section_locale_idx" ON "cms"."pages_blocks_team_section" USING btree ("_locale");
  CREATE INDEX "pages_blocks_closing_banner_order_idx" ON "cms"."pages_blocks_closing_banner" USING btree ("_order");
  CREATE INDEX "pages_blocks_closing_banner_parent_id_idx" ON "cms"."pages_blocks_closing_banner" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_closing_banner_path_idx" ON "cms"."pages_blocks_closing_banner" USING btree ("_path");
  CREATE INDEX "pages_blocks_closing_banner_locale_idx" ON "cms"."pages_blocks_closing_banner" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_home_hero_order_idx" ON "cms"."_pages_v_blocks_home_hero" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_home_hero_parent_id_idx" ON "cms"."_pages_v_blocks_home_hero" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_home_hero_path_idx" ON "cms"."_pages_v_blocks_home_hero" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_home_hero_locale_idx" ON "cms"."_pages_v_blocks_home_hero" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_domain_store_order_idx" ON "cms"."_pages_v_blocks_domain_store" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_domain_store_parent_id_idx" ON "cms"."_pages_v_blocks_domain_store" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_domain_store_path_idx" ON "cms"."_pages_v_blocks_domain_store" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_domain_store_locale_idx" ON "cms"."_pages_v_blocks_domain_store" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_numbered_services_items_order_idx" ON "cms"."_pages_v_blocks_numbered_services_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_numbered_services_items_parent_id_idx" ON "cms"."_pages_v_blocks_numbered_services_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_numbered_services_items_locale_idx" ON "cms"."_pages_v_blocks_numbered_services_items" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_numbered_services_order_idx" ON "cms"."_pages_v_blocks_numbered_services" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_numbered_services_parent_id_idx" ON "cms"."_pages_v_blocks_numbered_services" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_numbered_services_path_idx" ON "cms"."_pages_v_blocks_numbered_services" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_numbered_services_locale_idx" ON "cms"."_pages_v_blocks_numbered_services" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_email_showcase_order_idx" ON "cms"."_pages_v_blocks_email_showcase" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_email_showcase_parent_id_idx" ON "cms"."_pages_v_blocks_email_showcase" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_email_showcase_path_idx" ON "cms"."_pages_v_blocks_email_showcase" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_email_showcase_locale_idx" ON "cms"."_pages_v_blocks_email_showcase" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_websites_showcase_cards_order_idx" ON "cms"."_pages_v_blocks_websites_showcase_cards" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_websites_showcase_cards_parent_id_idx" ON "cms"."_pages_v_blocks_websites_showcase_cards" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_websites_showcase_cards_locale_idx" ON "cms"."_pages_v_blocks_websites_showcase_cards" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_websites_showcase_industries_order_idx" ON "cms"."_pages_v_blocks_websites_showcase_industries" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_websites_showcase_industries_parent_id_idx" ON "cms"."_pages_v_blocks_websites_showcase_industries" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_websites_showcase_industries_locale_idx" ON "cms"."_pages_v_blocks_websites_showcase_industries" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_websites_showcase_order_idx" ON "cms"."_pages_v_blocks_websites_showcase" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_websites_showcase_parent_id_idx" ON "cms"."_pages_v_blocks_websites_showcase" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_websites_showcase_path_idx" ON "cms"."_pages_v_blocks_websites_showcase" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_websites_showcase_locale_idx" ON "cms"."_pages_v_blocks_websites_showcase" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_security_panel_order_idx" ON "cms"."_pages_v_blocks_security_panel" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_security_panel_parent_id_idx" ON "cms"."_pages_v_blocks_security_panel" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_security_panel_path_idx" ON "cms"."_pages_v_blocks_security_panel" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_security_panel_locale_idx" ON "cms"."_pages_v_blocks_security_panel" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_thebe_section_features_order_idx" ON "cms"."_pages_v_blocks_thebe_section_features" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_thebe_section_features_parent_id_idx" ON "cms"."_pages_v_blocks_thebe_section_features" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_thebe_section_features_locale_idx" ON "cms"."_pages_v_blocks_thebe_section_features" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_thebe_section_order_idx" ON "cms"."_pages_v_blocks_thebe_section" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_thebe_section_parent_id_idx" ON "cms"."_pages_v_blocks_thebe_section" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_thebe_section_path_idx" ON "cms"."_pages_v_blocks_thebe_section" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_thebe_section_locale_idx" ON "cms"."_pages_v_blocks_thebe_section" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_plans_table_rows_order_idx" ON "cms"."_pages_v_blocks_plans_table_rows" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_plans_table_rows_parent_id_idx" ON "cms"."_pages_v_blocks_plans_table_rows" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_plans_table_rows_locale_idx" ON "cms"."_pages_v_blocks_plans_table_rows" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_plans_table_order_idx" ON "cms"."_pages_v_blocks_plans_table" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_plans_table_parent_id_idx" ON "cms"."_pages_v_blocks_plans_table" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_plans_table_path_idx" ON "cms"."_pages_v_blocks_plans_table" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_plans_table_locale_idx" ON "cms"."_pages_v_blocks_plans_table" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_compare_table_rows_order_idx" ON "cms"."_pages_v_blocks_compare_table_rows" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_compare_table_rows_parent_id_idx" ON "cms"."_pages_v_blocks_compare_table_rows" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_compare_table_rows_locale_idx" ON "cms"."_pages_v_blocks_compare_table_rows" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_compare_table_order_idx" ON "cms"."_pages_v_blocks_compare_table" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_compare_table_parent_id_idx" ON "cms"."_pages_v_blocks_compare_table" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_compare_table_path_idx" ON "cms"."_pages_v_blocks_compare_table" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_compare_table_locale_idx" ON "cms"."_pages_v_blocks_compare_table" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_team_section_order_idx" ON "cms"."_pages_v_blocks_team_section" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_team_section_parent_id_idx" ON "cms"."_pages_v_blocks_team_section" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_team_section_path_idx" ON "cms"."_pages_v_blocks_team_section" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_team_section_locale_idx" ON "cms"."_pages_v_blocks_team_section" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_closing_banner_order_idx" ON "cms"."_pages_v_blocks_closing_banner" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_closing_banner_parent_id_idx" ON "cms"."_pages_v_blocks_closing_banner" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_closing_banner_path_idx" ON "cms"."_pages_v_blocks_closing_banner" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_closing_banner_locale_idx" ON "cms"."_pages_v_blocks_closing_banner" USING btree ("_locale");
  CREATE UNIQUE INDEX "help_slug_idx" ON "cms"."help" USING btree ("slug");
  CREATE INDEX "help_updated_at_idx" ON "cms"."help" USING btree ("updated_at");
  CREATE INDEX "help_created_at_idx" ON "cms"."help" USING btree ("created_at");
  CREATE INDEX "help__status_idx" ON "cms"."help" USING btree ("_status");
  CREATE UNIQUE INDEX "help_locales_locale_parent_id_unique" ON "cms"."help_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_help_v_parent_idx" ON "cms"."_help_v" USING btree ("parent_id");
  CREATE INDEX "_help_v_version_version_slug_idx" ON "cms"."_help_v" USING btree ("version_slug");
  CREATE INDEX "_help_v_version_version_updated_at_idx" ON "cms"."_help_v" USING btree ("version_updated_at");
  CREATE INDEX "_help_v_version_version_created_at_idx" ON "cms"."_help_v" USING btree ("version_created_at");
  CREATE INDEX "_help_v_version_version__status_idx" ON "cms"."_help_v" USING btree ("version__status");
  CREATE INDEX "_help_v_created_at_idx" ON "cms"."_help_v" USING btree ("created_at");
  CREATE INDEX "_help_v_updated_at_idx" ON "cms"."_help_v" USING btree ("updated_at");
  CREATE INDEX "_help_v_snapshot_idx" ON "cms"."_help_v" USING btree ("snapshot");
  CREATE INDEX "_help_v_published_locale_idx" ON "cms"."_help_v" USING btree ("published_locale");
  CREATE INDEX "_help_v_latest_idx" ON "cms"."_help_v" USING btree ("latest");
  CREATE INDEX "_help_v_autosave_idx" ON "cms"."_help_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "_help_v_locales_locale_parent_id_unique" ON "cms"."_help_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "header_menus_columns_links_order_idx" ON "cms"."header_menus_columns_links" USING btree ("_order");
  CREATE INDEX "header_menus_columns_links_parent_id_idx" ON "cms"."header_menus_columns_links" USING btree ("_parent_id");
  CREATE INDEX "header_menus_columns_links_locale_idx" ON "cms"."header_menus_columns_links" USING btree ("_locale");
  CREATE INDEX "header_menus_columns_order_idx" ON "cms"."header_menus_columns" USING btree ("_order");
  CREATE INDEX "header_menus_columns_parent_id_idx" ON "cms"."header_menus_columns" USING btree ("_parent_id");
  CREATE INDEX "header_menus_columns_locale_idx" ON "cms"."header_menus_columns" USING btree ("_locale");
  CREATE INDEX "header_menus_order_idx" ON "cms"."header_menus" USING btree ("_order");
  CREATE INDEX "header_menus_parent_id_idx" ON "cms"."header_menus" USING btree ("_parent_id");
  CREATE INDEX "header_menus_locale_idx" ON "cms"."header_menus" USING btree ("_locale");
  CREATE INDEX "header_links_order_idx" ON "cms"."header_links" USING btree ("_order");
  CREATE INDEX "header_links_parent_id_idx" ON "cms"."header_links" USING btree ("_parent_id");
  CREATE INDEX "header_links_locale_idx" ON "cms"."header_links" USING btree ("_locale");
  CREATE INDEX "_header_v_version_menus_columns_links_order_idx" ON "cms"."_header_v_version_menus_columns_links" USING btree ("_order");
  CREATE INDEX "_header_v_version_menus_columns_links_parent_id_idx" ON "cms"."_header_v_version_menus_columns_links" USING btree ("_parent_id");
  CREATE INDEX "_header_v_version_menus_columns_links_locale_idx" ON "cms"."_header_v_version_menus_columns_links" USING btree ("_locale");
  CREATE INDEX "_header_v_version_menus_columns_order_idx" ON "cms"."_header_v_version_menus_columns" USING btree ("_order");
  CREATE INDEX "_header_v_version_menus_columns_parent_id_idx" ON "cms"."_header_v_version_menus_columns" USING btree ("_parent_id");
  CREATE INDEX "_header_v_version_menus_columns_locale_idx" ON "cms"."_header_v_version_menus_columns" USING btree ("_locale");
  CREATE INDEX "_header_v_version_menus_order_idx" ON "cms"."_header_v_version_menus" USING btree ("_order");
  CREATE INDEX "_header_v_version_menus_parent_id_idx" ON "cms"."_header_v_version_menus" USING btree ("_parent_id");
  CREATE INDEX "_header_v_version_menus_locale_idx" ON "cms"."_header_v_version_menus" USING btree ("_locale");
  CREATE INDEX "_header_v_version_links_order_idx" ON "cms"."_header_v_version_links" USING btree ("_order");
  CREATE INDEX "_header_v_version_links_parent_id_idx" ON "cms"."_header_v_version_links" USING btree ("_parent_id");
  CREATE INDEX "_header_v_version_links_locale_idx" ON "cms"."_header_v_version_links" USING btree ("_locale");
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_help_fk" FOREIGN KEY ("help_id") REFERENCES "cms"."help"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_help_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("help_id");
  ALTER TABLE "cms"."footer_locales" DROP COLUMN "contact_heading";
  ALTER TABLE "cms"."_footer_v_locales" DROP COLUMN "version_contact_heading";
  DROP TYPE "cms"."enum_header_groups_links_link_to";
  DROP TYPE "cms"."enum_header_groups_icon";
  DROP TYPE "cms"."enum_header_pages_link_to";
  DROP TYPE "cms"."enum_header_menu_link_to";
  DROP TYPE "cms"."enum__header_v_version_groups_links_link_to";
  DROP TYPE "cms"."enum__header_v_version_groups_icon";
  DROP TYPE "cms"."enum__header_v_version_pages_link_to";
  DROP TYPE "cms"."enum__header_v_version_menu_link_to";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_header_groups_links_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_header_groups_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'earth', 'check', 'receipt');
  CREATE TYPE "cms"."enum_header_pages_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_header_menu_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__header_v_version_groups_links_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__header_v_version_groups_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'earth', 'check', 'receipt');
  CREATE TYPE "cms"."enum__header_v_version_pages_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__header_v_version_menu_link_to" AS ENUM('market', 'site', 'email');
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
  
  ALTER TABLE "cms"."pages_blocks_home_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_domain_store" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_numbered_services_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_numbered_services" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_email_showcase" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_websites_showcase_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_websites_showcase_industries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_websites_showcase" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_security_panel" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_thebe_section_features" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_thebe_section" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_plans_table_rows" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_plans_table" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_compare_table_rows" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_compare_table" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_team_section" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_closing_banner" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_home_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_domain_store" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_numbered_services_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_numbered_services" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_email_showcase" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_websites_showcase_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_websites_showcase_industries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_websites_showcase" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_security_panel" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_thebe_section_features" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_thebe_section" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_plans_table_rows" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_plans_table" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_compare_table_rows" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_compare_table" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_team_section" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_closing_banner" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."help" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."help_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_help_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_help_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_menus_columns_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_menus_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_menus" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."header_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_version_menus_columns_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_version_menus_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_version_menus" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_header_v_version_links" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."pages_blocks_home_hero" CASCADE;
  DROP TABLE "cms"."pages_blocks_domain_store" CASCADE;
  DROP TABLE "cms"."pages_blocks_numbered_services_items" CASCADE;
  DROP TABLE "cms"."pages_blocks_numbered_services" CASCADE;
  DROP TABLE "cms"."pages_blocks_email_showcase" CASCADE;
  DROP TABLE "cms"."pages_blocks_websites_showcase_cards" CASCADE;
  DROP TABLE "cms"."pages_blocks_websites_showcase_industries" CASCADE;
  DROP TABLE "cms"."pages_blocks_websites_showcase" CASCADE;
  DROP TABLE "cms"."pages_blocks_security_panel" CASCADE;
  DROP TABLE "cms"."pages_blocks_thebe_section_features" CASCADE;
  DROP TABLE "cms"."pages_blocks_thebe_section" CASCADE;
  DROP TABLE "cms"."pages_blocks_plans_table_rows" CASCADE;
  DROP TABLE "cms"."pages_blocks_plans_table" CASCADE;
  DROP TABLE "cms"."pages_blocks_compare_table_rows" CASCADE;
  DROP TABLE "cms"."pages_blocks_compare_table" CASCADE;
  DROP TABLE "cms"."pages_blocks_team_section" CASCADE;
  DROP TABLE "cms"."pages_blocks_closing_banner" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_home_hero" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_domain_store" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_numbered_services_items" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_numbered_services" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_email_showcase" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_websites_showcase_cards" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_websites_showcase_industries" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_websites_showcase" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_security_panel" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_thebe_section_features" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_thebe_section" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_plans_table_rows" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_plans_table" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_compare_table_rows" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_compare_table" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_team_section" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_closing_banner" CASCADE;
  DROP TABLE "cms"."help" CASCADE;
  DROP TABLE "cms"."help_locales" CASCADE;
  DROP TABLE "cms"."_help_v" CASCADE;
  DROP TABLE "cms"."_help_v_locales" CASCADE;
  DROP TABLE "cms"."header_menus_columns_links" CASCADE;
  DROP TABLE "cms"."header_menus_columns" CASCADE;
  DROP TABLE "cms"."header_menus" CASCADE;
  DROP TABLE "cms"."header_links" CASCADE;
  DROP TABLE "cms"."_header_v_version_menus_columns_links" CASCADE;
  DROP TABLE "cms"."_header_v_version_menus_columns" CASCADE;
  DROP TABLE "cms"."_header_v_version_menus" CASCADE;
  DROP TABLE "cms"."_header_v_version_links" CASCADE;
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_help_fk";
  
  ALTER TABLE "cms"."pages_blocks_hero" ALTER COLUMN "primary_to" SET DATA TYPE text;
  ALTER TABLE "cms"."pages_blocks_hero" ALTER COLUMN "primary_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum_pages_blocks_hero_primary_to";
  CREATE TYPE "cms"."enum_pages_blocks_hero_primary_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."pages_blocks_hero" ALTER COLUMN "primary_to" SET DEFAULT 'market'::"cms"."enum_pages_blocks_hero_primary_to";
  ALTER TABLE "cms"."pages_blocks_hero" ALTER COLUMN "primary_to" SET DATA TYPE "cms"."enum_pages_blocks_hero_primary_to" USING "primary_to"::"cms"."enum_pages_blocks_hero_primary_to";
  ALTER TABLE "cms"."pages_blocks_hero" ALTER COLUMN "secondary_to" SET DATA TYPE text;
  ALTER TABLE "cms"."pages_blocks_hero" ALTER COLUMN "secondary_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum_pages_blocks_hero_secondary_to";
  CREATE TYPE "cms"."enum_pages_blocks_hero_secondary_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."pages_blocks_hero" ALTER COLUMN "secondary_to" SET DEFAULT 'market'::"cms"."enum_pages_blocks_hero_secondary_to";
  ALTER TABLE "cms"."pages_blocks_hero" ALTER COLUMN "secondary_to" SET DATA TYPE "cms"."enum_pages_blocks_hero_secondary_to" USING "secondary_to"::"cms"."enum_pages_blocks_hero_secondary_to";
  ALTER TABLE "cms"."pages_blocks_services_grid" ALTER COLUMN "more_to" SET DATA TYPE text;
  ALTER TABLE "cms"."pages_blocks_services_grid" ALTER COLUMN "more_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum_pages_blocks_services_grid_more_to";
  CREATE TYPE "cms"."enum_pages_blocks_services_grid_more_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."pages_blocks_services_grid" ALTER COLUMN "more_to" SET DEFAULT 'market'::"cms"."enum_pages_blocks_services_grid_more_to";
  ALTER TABLE "cms"."pages_blocks_services_grid" ALTER COLUMN "more_to" SET DATA TYPE "cms"."enum_pages_blocks_services_grid_more_to" USING "more_to"::"cms"."enum_pages_blocks_services_grid_more_to";
  ALTER TABLE "cms"."pages_blocks_pricing" ALTER COLUMN "more_to" SET DATA TYPE text;
  ALTER TABLE "cms"."pages_blocks_pricing" ALTER COLUMN "more_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum_pages_blocks_pricing_more_to";
  CREATE TYPE "cms"."enum_pages_blocks_pricing_more_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."pages_blocks_pricing" ALTER COLUMN "more_to" SET DEFAULT 'market'::"cms"."enum_pages_blocks_pricing_more_to";
  ALTER TABLE "cms"."pages_blocks_pricing" ALTER COLUMN "more_to" SET DATA TYPE "cms"."enum_pages_blocks_pricing_more_to" USING "more_to"::"cms"."enum_pages_blocks_pricing_more_to";
  ALTER TABLE "cms"."pages_blocks_image_text" ALTER COLUMN "card_link_to" SET DATA TYPE text;
  ALTER TABLE "cms"."pages_blocks_image_text" ALTER COLUMN "card_link_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum_pages_blocks_image_text_card_link_to";
  CREATE TYPE "cms"."enum_pages_blocks_image_text_card_link_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."pages_blocks_image_text" ALTER COLUMN "card_link_to" SET DEFAULT 'market'::"cms"."enum_pages_blocks_image_text_card_link_to";
  ALTER TABLE "cms"."pages_blocks_image_text" ALTER COLUMN "card_link_to" SET DATA TYPE "cms"."enum_pages_blocks_image_text_card_link_to" USING "card_link_to"::"cms"."enum_pages_blocks_image_text_card_link_to";
  ALTER TABLE "cms"."pages_blocks_insights_strip" ALTER COLUMN "more_to" SET DATA TYPE text;
  ALTER TABLE "cms"."pages_blocks_insights_strip" ALTER COLUMN "more_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum_pages_blocks_insights_strip_more_to";
  CREATE TYPE "cms"."enum_pages_blocks_insights_strip_more_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."pages_blocks_insights_strip" ALTER COLUMN "more_to" SET DEFAULT 'market'::"cms"."enum_pages_blocks_insights_strip_more_to";
  ALTER TABLE "cms"."pages_blocks_insights_strip" ALTER COLUMN "more_to" SET DATA TYPE "cms"."enum_pages_blocks_insights_strip_more_to" USING "more_to"::"cms"."enum_pages_blocks_insights_strip_more_to";
  ALTER TABLE "cms"."pages_blocks_call_to_action" ALTER COLUMN "primary_to" SET DATA TYPE text;
  ALTER TABLE "cms"."pages_blocks_call_to_action" ALTER COLUMN "primary_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum_pages_blocks_call_to_action_primary_to";
  CREATE TYPE "cms"."enum_pages_blocks_call_to_action_primary_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."pages_blocks_call_to_action" ALTER COLUMN "primary_to" SET DEFAULT 'market'::"cms"."enum_pages_blocks_call_to_action_primary_to";
  ALTER TABLE "cms"."pages_blocks_call_to_action" ALTER COLUMN "primary_to" SET DATA TYPE "cms"."enum_pages_blocks_call_to_action_primary_to" USING "primary_to"::"cms"."enum_pages_blocks_call_to_action_primary_to";
  ALTER TABLE "cms"."pages_blocks_call_to_action" ALTER COLUMN "secondary_to" SET DATA TYPE text;
  ALTER TABLE "cms"."pages_blocks_call_to_action" ALTER COLUMN "secondary_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum_pages_blocks_call_to_action_secondary_to";
  CREATE TYPE "cms"."enum_pages_blocks_call_to_action_secondary_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."pages_blocks_call_to_action" ALTER COLUMN "secondary_to" SET DEFAULT 'market'::"cms"."enum_pages_blocks_call_to_action_secondary_to";
  ALTER TABLE "cms"."pages_blocks_call_to_action" ALTER COLUMN "secondary_to" SET DATA TYPE "cms"."enum_pages_blocks_call_to_action_secondary_to" USING "secondary_to"::"cms"."enum_pages_blocks_call_to_action_secondary_to";
  ALTER TABLE "cms"."_pages_v_blocks_hero" ALTER COLUMN "primary_to" SET DATA TYPE text;
  ALTER TABLE "cms"."_pages_v_blocks_hero" ALTER COLUMN "primary_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum__pages_v_blocks_hero_primary_to";
  CREATE TYPE "cms"."enum__pages_v_blocks_hero_primary_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."_pages_v_blocks_hero" ALTER COLUMN "primary_to" SET DEFAULT 'market'::"cms"."enum__pages_v_blocks_hero_primary_to";
  ALTER TABLE "cms"."_pages_v_blocks_hero" ALTER COLUMN "primary_to" SET DATA TYPE "cms"."enum__pages_v_blocks_hero_primary_to" USING "primary_to"::"cms"."enum__pages_v_blocks_hero_primary_to";
  ALTER TABLE "cms"."_pages_v_blocks_hero" ALTER COLUMN "secondary_to" SET DATA TYPE text;
  ALTER TABLE "cms"."_pages_v_blocks_hero" ALTER COLUMN "secondary_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum__pages_v_blocks_hero_secondary_to";
  CREATE TYPE "cms"."enum__pages_v_blocks_hero_secondary_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."_pages_v_blocks_hero" ALTER COLUMN "secondary_to" SET DEFAULT 'market'::"cms"."enum__pages_v_blocks_hero_secondary_to";
  ALTER TABLE "cms"."_pages_v_blocks_hero" ALTER COLUMN "secondary_to" SET DATA TYPE "cms"."enum__pages_v_blocks_hero_secondary_to" USING "secondary_to"::"cms"."enum__pages_v_blocks_hero_secondary_to";
  ALTER TABLE "cms"."_pages_v_blocks_services_grid" ALTER COLUMN "more_to" SET DATA TYPE text;
  ALTER TABLE "cms"."_pages_v_blocks_services_grid" ALTER COLUMN "more_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum__pages_v_blocks_services_grid_more_to";
  CREATE TYPE "cms"."enum__pages_v_blocks_services_grid_more_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."_pages_v_blocks_services_grid" ALTER COLUMN "more_to" SET DEFAULT 'market'::"cms"."enum__pages_v_blocks_services_grid_more_to";
  ALTER TABLE "cms"."_pages_v_blocks_services_grid" ALTER COLUMN "more_to" SET DATA TYPE "cms"."enum__pages_v_blocks_services_grid_more_to" USING "more_to"::"cms"."enum__pages_v_blocks_services_grid_more_to";
  ALTER TABLE "cms"."_pages_v_blocks_pricing" ALTER COLUMN "more_to" SET DATA TYPE text;
  ALTER TABLE "cms"."_pages_v_blocks_pricing" ALTER COLUMN "more_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum__pages_v_blocks_pricing_more_to";
  CREATE TYPE "cms"."enum__pages_v_blocks_pricing_more_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."_pages_v_blocks_pricing" ALTER COLUMN "more_to" SET DEFAULT 'market'::"cms"."enum__pages_v_blocks_pricing_more_to";
  ALTER TABLE "cms"."_pages_v_blocks_pricing" ALTER COLUMN "more_to" SET DATA TYPE "cms"."enum__pages_v_blocks_pricing_more_to" USING "more_to"::"cms"."enum__pages_v_blocks_pricing_more_to";
  ALTER TABLE "cms"."_pages_v_blocks_image_text" ALTER COLUMN "card_link_to" SET DATA TYPE text;
  ALTER TABLE "cms"."_pages_v_blocks_image_text" ALTER COLUMN "card_link_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum__pages_v_blocks_image_text_card_link_to";
  CREATE TYPE "cms"."enum__pages_v_blocks_image_text_card_link_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."_pages_v_blocks_image_text" ALTER COLUMN "card_link_to" SET DEFAULT 'market'::"cms"."enum__pages_v_blocks_image_text_card_link_to";
  ALTER TABLE "cms"."_pages_v_blocks_image_text" ALTER COLUMN "card_link_to" SET DATA TYPE "cms"."enum__pages_v_blocks_image_text_card_link_to" USING "card_link_to"::"cms"."enum__pages_v_blocks_image_text_card_link_to";
  ALTER TABLE "cms"."_pages_v_blocks_insights_strip" ALTER COLUMN "more_to" SET DATA TYPE text;
  ALTER TABLE "cms"."_pages_v_blocks_insights_strip" ALTER COLUMN "more_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum__pages_v_blocks_insights_strip_more_to";
  CREATE TYPE "cms"."enum__pages_v_blocks_insights_strip_more_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."_pages_v_blocks_insights_strip" ALTER COLUMN "more_to" SET DEFAULT 'market'::"cms"."enum__pages_v_blocks_insights_strip_more_to";
  ALTER TABLE "cms"."_pages_v_blocks_insights_strip" ALTER COLUMN "more_to" SET DATA TYPE "cms"."enum__pages_v_blocks_insights_strip_more_to" USING "more_to"::"cms"."enum__pages_v_blocks_insights_strip_more_to";
  ALTER TABLE "cms"."_pages_v_blocks_call_to_action" ALTER COLUMN "primary_to" SET DATA TYPE text;
  ALTER TABLE "cms"."_pages_v_blocks_call_to_action" ALTER COLUMN "primary_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum__pages_v_blocks_call_to_action_primary_to";
  CREATE TYPE "cms"."enum__pages_v_blocks_call_to_action_primary_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."_pages_v_blocks_call_to_action" ALTER COLUMN "primary_to" SET DEFAULT 'market'::"cms"."enum__pages_v_blocks_call_to_action_primary_to";
  ALTER TABLE "cms"."_pages_v_blocks_call_to_action" ALTER COLUMN "primary_to" SET DATA TYPE "cms"."enum__pages_v_blocks_call_to_action_primary_to" USING "primary_to"::"cms"."enum__pages_v_blocks_call_to_action_primary_to";
  ALTER TABLE "cms"."_pages_v_blocks_call_to_action" ALTER COLUMN "secondary_to" SET DATA TYPE text;
  ALTER TABLE "cms"."_pages_v_blocks_call_to_action" ALTER COLUMN "secondary_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum__pages_v_blocks_call_to_action_secondary_to";
  CREATE TYPE "cms"."enum__pages_v_blocks_call_to_action_secondary_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."_pages_v_blocks_call_to_action" ALTER COLUMN "secondary_to" SET DEFAULT 'market'::"cms"."enum__pages_v_blocks_call_to_action_secondary_to";
  ALTER TABLE "cms"."_pages_v_blocks_call_to_action" ALTER COLUMN "secondary_to" SET DATA TYPE "cms"."enum__pages_v_blocks_call_to_action_secondary_to" USING "secondary_to"::"cms"."enum__pages_v_blocks_call_to_action_secondary_to";
  ALTER TABLE "cms"."footer_columns_links" ALTER COLUMN "link_to" SET DATA TYPE text;
  ALTER TABLE "cms"."footer_columns_links" ALTER COLUMN "link_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum_footer_columns_links_link_to";
  CREATE TYPE "cms"."enum_footer_columns_links_link_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."footer_columns_links" ALTER COLUMN "link_to" SET DEFAULT 'market'::"cms"."enum_footer_columns_links_link_to";
  ALTER TABLE "cms"."footer_columns_links" ALTER COLUMN "link_to" SET DATA TYPE "cms"."enum_footer_columns_links_link_to" USING "link_to"::"cms"."enum_footer_columns_links_link_to";
  ALTER TABLE "cms"."_footer_v_version_columns_links" ALTER COLUMN "link_to" SET DATA TYPE text;
  ALTER TABLE "cms"."_footer_v_version_columns_links" ALTER COLUMN "link_to" SET DEFAULT 'market'::text;
  DROP TYPE "cms"."enum__footer_v_version_columns_links_link_to";
  CREATE TYPE "cms"."enum__footer_v_version_columns_links_link_to" AS ENUM('market', 'site', 'email');
  ALTER TABLE "cms"."_footer_v_version_columns_links" ALTER COLUMN "link_to" SET DEFAULT 'market'::"cms"."enum__footer_v_version_columns_links_link_to";
  ALTER TABLE "cms"."_footer_v_version_columns_links" ALTER COLUMN "link_to" SET DATA TYPE "cms"."enum__footer_v_version_columns_links_link_to" USING "link_to"::"cms"."enum__footer_v_version_columns_links_link_to";
  DROP INDEX "cms"."payload_locked_documents_rels_help_id_idx";
  ALTER TABLE "cms"."footer_locales" ADD COLUMN "contact_heading" varchar;
  ALTER TABLE "cms"."_footer_v_locales" ADD COLUMN "version_contact_heading" varchar;
  ALTER TABLE "cms"."header_groups_links" ADD CONSTRAINT "header_groups_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_groups" ADD CONSTRAINT "header_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_pages" ADD CONSTRAINT "header_pages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."header_locales" ADD CONSTRAINT "header_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_version_groups_links" ADD CONSTRAINT "_header_v_version_groups_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v_version_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_version_groups" ADD CONSTRAINT "_header_v_version_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_version_pages" ADD CONSTRAINT "_header_v_version_pages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_header_v_locales" ADD CONSTRAINT "_header_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_header_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "header_groups_links_order_idx" ON "cms"."header_groups_links" USING btree ("_order");
  CREATE INDEX "header_groups_links_parent_id_idx" ON "cms"."header_groups_links" USING btree ("_parent_id");
  CREATE INDEX "header_groups_links_locale_idx" ON "cms"."header_groups_links" USING btree ("_locale");
  CREATE INDEX "header_groups_order_idx" ON "cms"."header_groups" USING btree ("_order");
  CREATE INDEX "header_groups_parent_id_idx" ON "cms"."header_groups" USING btree ("_parent_id");
  CREATE INDEX "header_groups_locale_idx" ON "cms"."header_groups" USING btree ("_locale");
  CREATE INDEX "header_pages_order_idx" ON "cms"."header_pages" USING btree ("_order");
  CREATE INDEX "header_pages_parent_id_idx" ON "cms"."header_pages" USING btree ("_parent_id");
  CREATE INDEX "header_pages_locale_idx" ON "cms"."header_pages" USING btree ("_locale");
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
  CREATE UNIQUE INDEX "_header_v_locales_locale_parent_id_unique" ON "cms"."_header_v_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "cms"."pages_blocks_faq_items" DROP COLUMN "show_on_phone";
  ALTER TABLE "cms"."pages_blocks_faq" DROP COLUMN "heading_phone";
  ALTER TABLE "cms"."pages_blocks_faq" DROP COLUMN "more_label";
  ALTER TABLE "cms"."pages_blocks_faq" DROP COLUMN "more_to";
  ALTER TABLE "cms"."pages_blocks_faq" DROP COLUMN "more_path";
  ALTER TABLE "cms"."pages_blocks_faq" DROP COLUMN "more_subject";
  ALTER TABLE "cms"."pages_blocks_insights_strip" DROP COLUMN "heading_phone";
  ALTER TABLE "cms"."pages_blocks_insights_strip" DROP COLUMN "anchor";
  ALTER TABLE "cms"."_pages_v_blocks_faq_items" DROP COLUMN "show_on_phone";
  ALTER TABLE "cms"."_pages_v_blocks_faq" DROP COLUMN "heading_phone";
  ALTER TABLE "cms"."_pages_v_blocks_faq" DROP COLUMN "more_label";
  ALTER TABLE "cms"."_pages_v_blocks_faq" DROP COLUMN "more_to";
  ALTER TABLE "cms"."_pages_v_blocks_faq" DROP COLUMN "more_path";
  ALTER TABLE "cms"."_pages_v_blocks_faq" DROP COLUMN "more_subject";
  ALTER TABLE "cms"."_pages_v_blocks_insights_strip" DROP COLUMN "heading_phone";
  ALTER TABLE "cms"."_pages_v_blocks_insights_strip" DROP COLUMN "anchor";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "help_id";
  ALTER TABLE "cms"."footer_locales" DROP COLUMN "newsletter_heading";
  ALTER TABLE "cms"."footer_locales" DROP COLUMN "newsletter_text";
  ALTER TABLE "cms"."_footer_v_locales" DROP COLUMN "version_newsletter_heading";
  ALTER TABLE "cms"."_footer_v_locales" DROP COLUMN "version_newsletter_text";
  DROP TYPE "cms"."enum_pages_blocks_home_hero_primary_to";
  DROP TYPE "cms"."enum_pages_blocks_home_hero_secondary_to";
  DROP TYPE "cms"."enum_pages_blocks_numbered_services_items_link_to";
  DROP TYPE "cms"."enum_pages_blocks_websites_showcase_cards_link_to";
  DROP TYPE "cms"."enum_pages_blocks_team_section_link_to";
  DROP TYPE "cms"."enum_pages_blocks_closing_banner_primary_to";
  DROP TYPE "cms"."enum_pages_blocks_faq_more_to";
  DROP TYPE "cms"."enum__pages_v_blocks_home_hero_primary_to";
  DROP TYPE "cms"."enum__pages_v_blocks_home_hero_secondary_to";
  DROP TYPE "cms"."enum__pages_v_blocks_numbered_services_items_link_to";
  DROP TYPE "cms"."enum__pages_v_blocks_websites_showcase_cards_link_to";
  DROP TYPE "cms"."enum__pages_v_blocks_team_section_link_to";
  DROP TYPE "cms"."enum__pages_v_blocks_closing_banner_primary_to";
  DROP TYPE "cms"."enum__pages_v_blocks_faq_more_to";
  DROP TYPE "cms"."enum_help_section";
  DROP TYPE "cms"."enum_help_status";
  DROP TYPE "cms"."enum__help_v_version_section";
  DROP TYPE "cms"."enum__help_v_version_status";
  DROP TYPE "cms"."enum__help_v_published_locale";
  DROP TYPE "cms"."enum_header_menus_columns_links_link_to";
  DROP TYPE "cms"."enum_header_menus_feature_kind";
  DROP TYPE "cms"."enum_header_menus_feature_link_to";
  DROP TYPE "cms"."enum_header_links_link_to";
  DROP TYPE "cms"."enum__header_v_version_menus_columns_links_link_to";
  DROP TYPE "cms"."enum__header_v_version_menus_feature_kind";
  DROP TYPE "cms"."enum__header_v_version_menus_feature_link_to";
  DROP TYPE "cms"."enum__header_v_version_links_link_to";`)
}
