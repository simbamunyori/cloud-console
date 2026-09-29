import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."_locales" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_pages_blocks_hero_primary_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_pages_blocks_hero_secondary_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_pages_blocks_hero_picture_source" AS ENUM('upload', 'console-home', 'console-invoice', 'thebe-approvals');
  CREATE TYPE "cms"."enum_pages_blocks_feature_cards_items_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  CREATE TYPE "cms"."enum_pages_blocks_feature_cards_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum_pages_blocks_feature_cards_style" AS ENUM('raised', 'flat');
  CREATE TYPE "cms"."enum_pages_blocks_services_grid_cards_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  CREATE TYPE "cms"."enum_pages_blocks_services_grid_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum_pages_blocks_services_grid_more_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_pages_blocks_pricing_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum_pages_blocks_pricing_more_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_pages_blocks_text_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum_pages_blocks_image_text_points_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  CREATE TYPE "cms"."enum_pages_blocks_image_text_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum_pages_blocks_image_text_picture_source" AS ENUM('upload', 'console-home', 'console-invoice', 'thebe-approvals');
  CREATE TYPE "cms"."enum_pages_blocks_image_text_picture_side" AS ENUM('right', 'left');
  CREATE TYPE "cms"."enum_pages_blocks_image_text_card_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_pages_blocks_faq_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum_pages_blocks_testimonials_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum_pages_blocks_logo_strip_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum_pages_blocks_call_to_action_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum_pages_blocks_call_to_action_primary_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_pages_blocks_call_to_action_secondary_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__pages_v_blocks_hero_primary_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__pages_v_blocks_hero_secondary_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__pages_v_blocks_hero_picture_source" AS ENUM('upload', 'console-home', 'console-invoice', 'thebe-approvals');
  CREATE TYPE "cms"."enum__pages_v_blocks_feature_cards_items_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  CREATE TYPE "cms"."enum__pages_v_blocks_feature_cards_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_feature_cards_style" AS ENUM('raised', 'flat');
  CREATE TYPE "cms"."enum__pages_v_blocks_services_grid_cards_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  CREATE TYPE "cms"."enum__pages_v_blocks_services_grid_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_services_grid_more_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__pages_v_blocks_pricing_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_pricing_more_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__pages_v_blocks_text_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_image_text_points_icon" AS ENUM('users', 'credit-card', 'life-buoy', 'shield-check', 'mail', 'server', 'lock', 'hard-drive', 'layout-grid', 'boxes', 'sparkles', 'graduation-cap', 'building', 'trending-up', 'handshake', 'globe', 'check', 'receipt');
  CREATE TYPE "cms"."enum__pages_v_blocks_image_text_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_image_text_picture_source" AS ENUM('upload', 'console-home', 'console-invoice', 'thebe-approvals');
  CREATE TYPE "cms"."enum__pages_v_blocks_image_text_picture_side" AS ENUM('right', 'left');
  CREATE TYPE "cms"."enum__pages_v_blocks_image_text_card_link_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__pages_v_blocks_faq_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_testimonials_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_logo_strip_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_call_to_action_tone" AS ENUM('plain', 'light', 'dark');
  CREATE TYPE "cms"."enum__pages_v_blocks_call_to_action_primary_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__pages_v_blocks_call_to_action_secondary_to" AS ENUM('market', 'site', 'email');
  CREATE TYPE "cms"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__pages_v_published_locale" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TYPE "cms"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "cms"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "cms"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TABLE "cms"."pages_blocks_hero_supporting" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"sub" varchar,
  	"primary_label" varchar,
  	"primary_to" "cms"."enum_pages_blocks_hero_primary_to" DEFAULT 'market',
  	"primary_path" varchar,
  	"primary_subject" varchar,
  	"secondary_label" varchar,
  	"secondary_to" "cms"."enum_pages_blocks_hero_secondary_to" DEFAULT 'market',
  	"secondary_path" varchar,
  	"secondary_subject" varchar,
  	"picture_source" "cms"."enum_pages_blocks_hero_picture_source" DEFAULT 'upload',
  	"picture_image_id" integer,
  	"picture_caption" varchar,
  	"domain_search" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_domain_search" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"intro" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_feature_cards_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "cms"."enum_pages_blocks_feature_cards_items_icon",
  	"title" varchar,
  	"body" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_feature_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum_pages_blocks_feature_cards_tone" DEFAULT 'plain',
  	"style" "cms"."enum_pages_blocks_feature_cards_style" DEFAULT 'raised',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_services_grid_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "cms"."enum_pages_blocks_services_grid_cards_icon",
  	"title" varchar,
  	"body" varchar,
  	"note" varchar,
  	"data_centre" boolean DEFAULT false,
  	"products" jsonb
  );
  
  CREATE TABLE "cms"."pages_blocks_services_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum_pages_blocks_services_grid_tone" DEFAULT 'plain',
  	"anchor" varchar,
  	"show_tax_note" boolean DEFAULT true,
  	"more_label" varchar,
  	"more_to" "cms"."enum_pages_blocks_services_grid_more_to" DEFAULT 'market',
  	"more_path" varchar,
  	"more_subject" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_pricing" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum_pages_blocks_pricing_tone" DEFAULT 'plain',
  	"products" jsonb,
  	"more_label" varchar,
  	"more_to" "cms"."enum_pages_blocks_pricing_more_to" DEFAULT 'market',
  	"more_path" varchar,
  	"more_subject" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"body" jsonb,
  	"tone" "cms"."enum_pages_blocks_text_tone" DEFAULT 'plain',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_image_text_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "cms"."enum_pages_blocks_image_text_points_icon",
  	"title" varchar,
  	"body" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_image_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum_pages_blocks_image_text_tone" DEFAULT 'plain',
  	"picture_source" "cms"."enum_pages_blocks_image_text_picture_source" DEFAULT 'upload',
  	"picture_image_id" integer,
  	"picture_caption" varchar,
  	"picture_side" "cms"."enum_pages_blocks_image_text_picture_side" DEFAULT 'right',
  	"card_kicker" varchar,
  	"card_title" varchar,
  	"card_body" varchar,
  	"card_link_label" varchar,
  	"card_link_to" "cms"."enum_pages_blocks_image_text_card_link_to" DEFAULT 'market',
  	"card_link_path" varchar,
  	"card_link_subject" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb
  );
  
  CREATE TABLE "cms"."pages_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum_pages_blocks_faq_tone" DEFAULT 'plain',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"name" varchar,
  	"role" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"tone" "cms"."enum_pages_blocks_testimonials_tone" DEFAULT 'plain',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_logo_strip_logos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"image_id" integer
  );
  
  CREATE TABLE "cms"."pages_blocks_logo_strip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"tone" "cms"."enum_pages_blocks_logo_strip_tone" DEFAULT 'plain',
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_call_to_action" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"body" varchar,
  	"tone" "cms"."enum_pages_blocks_call_to_action_tone" DEFAULT 'plain',
  	"primary_label" varchar,
  	"primary_to" "cms"."enum_pages_blocks_call_to_action_primary_to" DEFAULT 'market',
  	"primary_path" varchar,
  	"primary_subject" varchar,
  	"secondary_label" varchar,
  	"secondary_to" "cms"."enum_pages_blocks_call_to_action_secondary_to" DEFAULT 'market',
  	"secondary_path" varchar,
  	"secondary_subject" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "cms"."enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "cms"."pages_locales" (
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_hero_supporting" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"sub" varchar,
  	"primary_label" varchar,
  	"primary_to" "cms"."enum__pages_v_blocks_hero_primary_to" DEFAULT 'market',
  	"primary_path" varchar,
  	"primary_subject" varchar,
  	"secondary_label" varchar,
  	"secondary_to" "cms"."enum__pages_v_blocks_hero_secondary_to" DEFAULT 'market',
  	"secondary_path" varchar,
  	"secondary_subject" varchar,
  	"picture_source" "cms"."enum__pages_v_blocks_hero_picture_source" DEFAULT 'upload',
  	"picture_image_id" integer,
  	"picture_caption" varchar,
  	"domain_search" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_domain_search" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"intro" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_feature_cards_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "cms"."enum__pages_v_blocks_feature_cards_items_icon",
  	"title" varchar,
  	"body" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_feature_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum__pages_v_blocks_feature_cards_tone" DEFAULT 'plain',
  	"style" "cms"."enum__pages_v_blocks_feature_cards_style" DEFAULT 'raised',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_services_grid_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "cms"."enum__pages_v_blocks_services_grid_cards_icon",
  	"title" varchar,
  	"body" varchar,
  	"note" varchar,
  	"data_centre" boolean DEFAULT false,
  	"products" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_services_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum__pages_v_blocks_services_grid_tone" DEFAULT 'plain',
  	"anchor" varchar,
  	"show_tax_note" boolean DEFAULT true,
  	"more_label" varchar,
  	"more_to" "cms"."enum__pages_v_blocks_services_grid_more_to" DEFAULT 'market',
  	"more_path" varchar,
  	"more_subject" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_pricing" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum__pages_v_blocks_pricing_tone" DEFAULT 'plain',
  	"products" jsonb,
  	"more_label" varchar,
  	"more_to" "cms"."enum__pages_v_blocks_pricing_more_to" DEFAULT 'market',
  	"more_path" varchar,
  	"more_subject" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"body" jsonb,
  	"tone" "cms"."enum__pages_v_blocks_text_tone" DEFAULT 'plain',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_image_text_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" "cms"."enum__pages_v_blocks_image_text_points_icon",
  	"title" varchar,
  	"body" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_image_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum__pages_v_blocks_image_text_tone" DEFAULT 'plain',
  	"picture_source" "cms"."enum__pages_v_blocks_image_text_picture_source" DEFAULT 'upload',
  	"picture_image_id" integer,
  	"picture_caption" varchar,
  	"picture_side" "cms"."enum__pages_v_blocks_image_text_picture_side" DEFAULT 'right',
  	"card_kicker" varchar,
  	"card_title" varchar,
  	"card_body" varchar,
  	"card_link_label" varchar,
  	"card_link_to" "cms"."enum__pages_v_blocks_image_text_card_link_to" DEFAULT 'market',
  	"card_link_path" varchar,
  	"card_link_subject" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"tone" "cms"."enum__pages_v_blocks_faq_tone" DEFAULT 'plain',
  	"_uuid" varchar,
  	"block_name" varchar
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
  
  CREATE TABLE "cms"."_pages_v_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"tone" "cms"."enum__pages_v_blocks_testimonials_tone" DEFAULT 'plain',
  	"_uuid" varchar,
  	"block_name" varchar
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
  
  CREATE TABLE "cms"."_pages_v_blocks_logo_strip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"tone" "cms"."enum__pages_v_blocks_logo_strip_tone" DEFAULT 'plain',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_call_to_action" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"body" varchar,
  	"tone" "cms"."enum__pages_v_blocks_call_to_action_tone" DEFAULT 'plain',
  	"primary_label" varchar,
  	"primary_to" "cms"."enum__pages_v_blocks_call_to_action_primary_to" DEFAULT 'market',
  	"primary_path" varchar,
  	"primary_subject" varchar,
  	"secondary_label" varchar,
  	"secondary_to" "cms"."enum__pages_v_blocks_call_to_action_secondary_to" DEFAULT 'market',
  	"secondary_path" varchar,
  	"secondary_subject" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "cms"."enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "cms"."enum__pages_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "cms"."_pages_v_locales" (
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "cms"."payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "cms"."enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "cms"."enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "cms"."payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "cms"."enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "cms"."pages_blocks_hero_supporting" ADD CONSTRAINT "pages_blocks_hero_supporting_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_picture_image_id_media_id_fk" FOREIGN KEY ("picture_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_domain_search" ADD CONSTRAINT "pages_blocks_domain_search_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_feature_cards_items" ADD CONSTRAINT "pages_blocks_feature_cards_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_feature_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_feature_cards" ADD CONSTRAINT "pages_blocks_feature_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_services_grid_cards" ADD CONSTRAINT "pages_blocks_services_grid_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_services_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_services_grid" ADD CONSTRAINT "pages_blocks_services_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_pricing" ADD CONSTRAINT "pages_blocks_pricing_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_text" ADD CONSTRAINT "pages_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_image_text_points" ADD CONSTRAINT "pages_blocks_image_text_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_image_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_image_text" ADD CONSTRAINT "pages_blocks_image_text_picture_image_id_media_id_fk" FOREIGN KEY ("picture_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_image_text" ADD CONSTRAINT "pages_blocks_image_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_faq_items" ADD CONSTRAINT "pages_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_faq" ADD CONSTRAINT "pages_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_testimonials_items" ADD CONSTRAINT "pages_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_testimonials" ADD CONSTRAINT "pages_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_logo_strip_logos" ADD CONSTRAINT "pages_blocks_logo_strip_logos_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_logo_strip_logos" ADD CONSTRAINT "pages_blocks_logo_strip_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_logo_strip"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_logo_strip" ADD CONSTRAINT "pages_blocks_logo_strip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_call_to_action" ADD CONSTRAINT "pages_blocks_call_to_action_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_locales" ADD CONSTRAINT "pages_locales_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_hero_supporting" ADD CONSTRAINT "_pages_v_blocks_hero_supporting_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_picture_image_id_media_id_fk" FOREIGN KEY ("picture_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_domain_search" ADD CONSTRAINT "_pages_v_blocks_domain_search_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_feature_cards_items" ADD CONSTRAINT "_pages_v_blocks_feature_cards_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_feature_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_feature_cards" ADD CONSTRAINT "_pages_v_blocks_feature_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_services_grid_cards" ADD CONSTRAINT "_pages_v_blocks_services_grid_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_services_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_services_grid" ADD CONSTRAINT "_pages_v_blocks_services_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_pricing" ADD CONSTRAINT "_pages_v_blocks_pricing_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_text" ADD CONSTRAINT "_pages_v_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_image_text_points" ADD CONSTRAINT "_pages_v_blocks_image_text_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_image_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_image_text" ADD CONSTRAINT "_pages_v_blocks_image_text_picture_image_id_media_id_fk" FOREIGN KEY ("picture_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_image_text" ADD CONSTRAINT "_pages_v_blocks_image_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_faq_items" ADD CONSTRAINT "_pages_v_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_faq" ADD CONSTRAINT "_pages_v_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_testimonials_items" ADD CONSTRAINT "_pages_v_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_testimonials" ADD CONSTRAINT "_pages_v_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_logo_strip_logos" ADD CONSTRAINT "_pages_v_blocks_logo_strip_logos_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_logo_strip_logos" ADD CONSTRAINT "_pages_v_blocks_logo_strip_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_logo_strip"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_logo_strip" ADD CONSTRAINT "_pages_v_blocks_logo_strip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_call_to_action" ADD CONSTRAINT "_pages_v_blocks_call_to_action_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_hero_supporting_order_idx" ON "cms"."pages_blocks_hero_supporting" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_supporting_parent_id_idx" ON "cms"."pages_blocks_hero_supporting" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_supporting_locale_idx" ON "cms"."pages_blocks_hero_supporting" USING btree ("_locale");
  CREATE INDEX "pages_blocks_hero_order_idx" ON "cms"."pages_blocks_hero" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_parent_id_idx" ON "cms"."pages_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_path_idx" ON "cms"."pages_blocks_hero" USING btree ("_path");
  CREATE INDEX "pages_blocks_hero_locale_idx" ON "cms"."pages_blocks_hero" USING btree ("_locale");
  CREATE INDEX "pages_blocks_hero_picture_picture_image_idx" ON "cms"."pages_blocks_hero" USING btree ("picture_image_id");
  CREATE INDEX "pages_blocks_domain_search_order_idx" ON "cms"."pages_blocks_domain_search" USING btree ("_order");
  CREATE INDEX "pages_blocks_domain_search_parent_id_idx" ON "cms"."pages_blocks_domain_search" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_domain_search_path_idx" ON "cms"."pages_blocks_domain_search" USING btree ("_path");
  CREATE INDEX "pages_blocks_domain_search_locale_idx" ON "cms"."pages_blocks_domain_search" USING btree ("_locale");
  CREATE INDEX "pages_blocks_feature_cards_items_order_idx" ON "cms"."pages_blocks_feature_cards_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_cards_items_parent_id_idx" ON "cms"."pages_blocks_feature_cards_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_feature_cards_items_locale_idx" ON "cms"."pages_blocks_feature_cards_items" USING btree ("_locale");
  CREATE INDEX "pages_blocks_feature_cards_order_idx" ON "cms"."pages_blocks_feature_cards" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_cards_parent_id_idx" ON "cms"."pages_blocks_feature_cards" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_feature_cards_path_idx" ON "cms"."pages_blocks_feature_cards" USING btree ("_path");
  CREATE INDEX "pages_blocks_feature_cards_locale_idx" ON "cms"."pages_blocks_feature_cards" USING btree ("_locale");
  CREATE INDEX "pages_blocks_services_grid_cards_order_idx" ON "cms"."pages_blocks_services_grid_cards" USING btree ("_order");
  CREATE INDEX "pages_blocks_services_grid_cards_parent_id_idx" ON "cms"."pages_blocks_services_grid_cards" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_services_grid_cards_locale_idx" ON "cms"."pages_blocks_services_grid_cards" USING btree ("_locale");
  CREATE INDEX "pages_blocks_services_grid_order_idx" ON "cms"."pages_blocks_services_grid" USING btree ("_order");
  CREATE INDEX "pages_blocks_services_grid_parent_id_idx" ON "cms"."pages_blocks_services_grid" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_services_grid_path_idx" ON "cms"."pages_blocks_services_grid" USING btree ("_path");
  CREATE INDEX "pages_blocks_services_grid_locale_idx" ON "cms"."pages_blocks_services_grid" USING btree ("_locale");
  CREATE INDEX "pages_blocks_pricing_order_idx" ON "cms"."pages_blocks_pricing" USING btree ("_order");
  CREATE INDEX "pages_blocks_pricing_parent_id_idx" ON "cms"."pages_blocks_pricing" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_pricing_path_idx" ON "cms"."pages_blocks_pricing" USING btree ("_path");
  CREATE INDEX "pages_blocks_pricing_locale_idx" ON "cms"."pages_blocks_pricing" USING btree ("_locale");
  CREATE INDEX "pages_blocks_text_order_idx" ON "cms"."pages_blocks_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_text_parent_id_idx" ON "cms"."pages_blocks_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_text_path_idx" ON "cms"."pages_blocks_text" USING btree ("_path");
  CREATE INDEX "pages_blocks_text_locale_idx" ON "cms"."pages_blocks_text" USING btree ("_locale");
  CREATE INDEX "pages_blocks_image_text_points_order_idx" ON "cms"."pages_blocks_image_text_points" USING btree ("_order");
  CREATE INDEX "pages_blocks_image_text_points_parent_id_idx" ON "cms"."pages_blocks_image_text_points" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_image_text_points_locale_idx" ON "cms"."pages_blocks_image_text_points" USING btree ("_locale");
  CREATE INDEX "pages_blocks_image_text_order_idx" ON "cms"."pages_blocks_image_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_image_text_parent_id_idx" ON "cms"."pages_blocks_image_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_image_text_path_idx" ON "cms"."pages_blocks_image_text" USING btree ("_path");
  CREATE INDEX "pages_blocks_image_text_locale_idx" ON "cms"."pages_blocks_image_text" USING btree ("_locale");
  CREATE INDEX "pages_blocks_image_text_picture_picture_image_idx" ON "cms"."pages_blocks_image_text" USING btree ("picture_image_id");
  CREATE INDEX "pages_blocks_faq_items_order_idx" ON "cms"."pages_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_faq_items_parent_id_idx" ON "cms"."pages_blocks_faq_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_faq_items_locale_idx" ON "cms"."pages_blocks_faq_items" USING btree ("_locale");
  CREATE INDEX "pages_blocks_faq_order_idx" ON "cms"."pages_blocks_faq" USING btree ("_order");
  CREATE INDEX "pages_blocks_faq_parent_id_idx" ON "cms"."pages_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_faq_path_idx" ON "cms"."pages_blocks_faq" USING btree ("_path");
  CREATE INDEX "pages_blocks_faq_locale_idx" ON "cms"."pages_blocks_faq" USING btree ("_locale");
  CREATE INDEX "pages_blocks_testimonials_items_order_idx" ON "cms"."pages_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_testimonials_items_parent_id_idx" ON "cms"."pages_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_testimonials_items_locale_idx" ON "cms"."pages_blocks_testimonials_items" USING btree ("_locale");
  CREATE INDEX "pages_blocks_testimonials_order_idx" ON "cms"."pages_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "pages_blocks_testimonials_parent_id_idx" ON "cms"."pages_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_testimonials_path_idx" ON "cms"."pages_blocks_testimonials" USING btree ("_path");
  CREATE INDEX "pages_blocks_testimonials_locale_idx" ON "cms"."pages_blocks_testimonials" USING btree ("_locale");
  CREATE INDEX "pages_blocks_logo_strip_logos_order_idx" ON "cms"."pages_blocks_logo_strip_logos" USING btree ("_order");
  CREATE INDEX "pages_blocks_logo_strip_logos_parent_id_idx" ON "cms"."pages_blocks_logo_strip_logos" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_logo_strip_logos_locale_idx" ON "cms"."pages_blocks_logo_strip_logos" USING btree ("_locale");
  CREATE INDEX "pages_blocks_logo_strip_logos_image_idx" ON "cms"."pages_blocks_logo_strip_logos" USING btree ("image_id");
  CREATE INDEX "pages_blocks_logo_strip_order_idx" ON "cms"."pages_blocks_logo_strip" USING btree ("_order");
  CREATE INDEX "pages_blocks_logo_strip_parent_id_idx" ON "cms"."pages_blocks_logo_strip" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_logo_strip_path_idx" ON "cms"."pages_blocks_logo_strip" USING btree ("_path");
  CREATE INDEX "pages_blocks_logo_strip_locale_idx" ON "cms"."pages_blocks_logo_strip" USING btree ("_locale");
  CREATE INDEX "pages_blocks_call_to_action_order_idx" ON "cms"."pages_blocks_call_to_action" USING btree ("_order");
  CREATE INDEX "pages_blocks_call_to_action_parent_id_idx" ON "cms"."pages_blocks_call_to_action" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_call_to_action_path_idx" ON "cms"."pages_blocks_call_to_action" USING btree ("_path");
  CREATE INDEX "pages_blocks_call_to_action_locale_idx" ON "cms"."pages_blocks_call_to_action" USING btree ("_locale");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "cms"."pages" USING btree ("slug");
  CREATE INDEX "pages_updated_at_idx" ON "cms"."pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "cms"."pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "cms"."pages" USING btree ("_status");
  CREATE INDEX "pages_seo_seo_image_idx" ON "cms"."pages_locales" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "cms"."pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_supporting_order_idx" ON "cms"."_pages_v_blocks_hero_supporting" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_supporting_parent_id_idx" ON "cms"."_pages_v_blocks_hero_supporting" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_supporting_locale_idx" ON "cms"."_pages_v_blocks_hero_supporting" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_hero_order_idx" ON "cms"."_pages_v_blocks_hero" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_parent_id_idx" ON "cms"."_pages_v_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_path_idx" ON "cms"."_pages_v_blocks_hero" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_hero_locale_idx" ON "cms"."_pages_v_blocks_hero" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_hero_picture_picture_image_idx" ON "cms"."_pages_v_blocks_hero" USING btree ("picture_image_id");
  CREATE INDEX "_pages_v_blocks_domain_search_order_idx" ON "cms"."_pages_v_blocks_domain_search" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_domain_search_parent_id_idx" ON "cms"."_pages_v_blocks_domain_search" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_domain_search_path_idx" ON "cms"."_pages_v_blocks_domain_search" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_domain_search_locale_idx" ON "cms"."_pages_v_blocks_domain_search" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_feature_cards_items_order_idx" ON "cms"."_pages_v_blocks_feature_cards_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_cards_items_parent_id_idx" ON "cms"."_pages_v_blocks_feature_cards_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_cards_items_locale_idx" ON "cms"."_pages_v_blocks_feature_cards_items" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_feature_cards_order_idx" ON "cms"."_pages_v_blocks_feature_cards" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_cards_parent_id_idx" ON "cms"."_pages_v_blocks_feature_cards" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_cards_path_idx" ON "cms"."_pages_v_blocks_feature_cards" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_feature_cards_locale_idx" ON "cms"."_pages_v_blocks_feature_cards" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_services_grid_cards_order_idx" ON "cms"."_pages_v_blocks_services_grid_cards" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_services_grid_cards_parent_id_idx" ON "cms"."_pages_v_blocks_services_grid_cards" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_services_grid_cards_locale_idx" ON "cms"."_pages_v_blocks_services_grid_cards" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_services_grid_order_idx" ON "cms"."_pages_v_blocks_services_grid" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_services_grid_parent_id_idx" ON "cms"."_pages_v_blocks_services_grid" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_services_grid_path_idx" ON "cms"."_pages_v_blocks_services_grid" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_services_grid_locale_idx" ON "cms"."_pages_v_blocks_services_grid" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_pricing_order_idx" ON "cms"."_pages_v_blocks_pricing" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_pricing_parent_id_idx" ON "cms"."_pages_v_blocks_pricing" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_pricing_path_idx" ON "cms"."_pages_v_blocks_pricing" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_pricing_locale_idx" ON "cms"."_pages_v_blocks_pricing" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_text_order_idx" ON "cms"."_pages_v_blocks_text" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_text_parent_id_idx" ON "cms"."_pages_v_blocks_text" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_text_path_idx" ON "cms"."_pages_v_blocks_text" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_text_locale_idx" ON "cms"."_pages_v_blocks_text" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_image_text_points_order_idx" ON "cms"."_pages_v_blocks_image_text_points" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_image_text_points_parent_id_idx" ON "cms"."_pages_v_blocks_image_text_points" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_image_text_points_locale_idx" ON "cms"."_pages_v_blocks_image_text_points" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_image_text_order_idx" ON "cms"."_pages_v_blocks_image_text" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_image_text_parent_id_idx" ON "cms"."_pages_v_blocks_image_text" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_image_text_path_idx" ON "cms"."_pages_v_blocks_image_text" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_image_text_locale_idx" ON "cms"."_pages_v_blocks_image_text" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_image_text_picture_picture_image_idx" ON "cms"."_pages_v_blocks_image_text" USING btree ("picture_image_id");
  CREATE INDEX "_pages_v_blocks_faq_items_order_idx" ON "cms"."_pages_v_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_faq_items_parent_id_idx" ON "cms"."_pages_v_blocks_faq_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_faq_items_locale_idx" ON "cms"."_pages_v_blocks_faq_items" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_faq_order_idx" ON "cms"."_pages_v_blocks_faq" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_faq_parent_id_idx" ON "cms"."_pages_v_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_faq_path_idx" ON "cms"."_pages_v_blocks_faq" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_faq_locale_idx" ON "cms"."_pages_v_blocks_faq" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_testimonials_items_order_idx" ON "cms"."_pages_v_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_testimonials_items_parent_id_idx" ON "cms"."_pages_v_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_items_locale_idx" ON "cms"."_pages_v_blocks_testimonials_items" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_testimonials_order_idx" ON "cms"."_pages_v_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_testimonials_parent_id_idx" ON "cms"."_pages_v_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_path_idx" ON "cms"."_pages_v_blocks_testimonials" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_testimonials_locale_idx" ON "cms"."_pages_v_blocks_testimonials" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_logo_strip_logos_order_idx" ON "cms"."_pages_v_blocks_logo_strip_logos" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_logo_strip_logos_parent_id_idx" ON "cms"."_pages_v_blocks_logo_strip_logos" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_logo_strip_logos_locale_idx" ON "cms"."_pages_v_blocks_logo_strip_logos" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_logo_strip_logos_image_idx" ON "cms"."_pages_v_blocks_logo_strip_logos" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_logo_strip_order_idx" ON "cms"."_pages_v_blocks_logo_strip" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_logo_strip_parent_id_idx" ON "cms"."_pages_v_blocks_logo_strip" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_logo_strip_path_idx" ON "cms"."_pages_v_blocks_logo_strip" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_logo_strip_locale_idx" ON "cms"."_pages_v_blocks_logo_strip" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_call_to_action_order_idx" ON "cms"."_pages_v_blocks_call_to_action" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_call_to_action_parent_id_idx" ON "cms"."_pages_v_blocks_call_to_action" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_call_to_action_path_idx" ON "cms"."_pages_v_blocks_call_to_action" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_call_to_action_locale_idx" ON "cms"."_pages_v_blocks_call_to_action" USING btree ("_locale");
  CREATE INDEX "_pages_v_parent_idx" ON "cms"."_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "cms"."_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "cms"."_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "cms"."_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "cms"."_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "cms"."_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "cms"."_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_snapshot_idx" ON "cms"."_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "cms"."_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "cms"."_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_autosave_idx" ON "cms"."_pages_v" USING btree ("autosave");
  CREATE INDEX "_pages_v_version_seo_version_seo_image_idx" ON "cms"."_pages_v_locales" USING btree ("version_seo_image_id");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "cms"."_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "payload_jobs_log_order_idx" ON "cms"."payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "cms"."payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "cms"."payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "cms"."payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "cms"."payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "cms"."payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "cms"."payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "cms"."payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "cms"."payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "cms"."payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "cms"."payload_jobs" USING btree ("created_at");
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("pages_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."pages_blocks_hero_supporting" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_domain_search" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_feature_cards_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_feature_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_services_grid_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_services_grid" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_pricing" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_image_text_points" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_image_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_faq_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_testimonials_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_testimonials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_logo_strip_logos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_logo_strip" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_blocks_call_to_action" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."pages_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_hero_supporting" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_domain_search" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_feature_cards_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_feature_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_services_grid_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_services_grid" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_pricing" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_image_text_points" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_image_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_faq_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_testimonials_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_testimonials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_logo_strip_logos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_logo_strip" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_blocks_call_to_action" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_pages_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."payload_jobs_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."payload_jobs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."pages_blocks_hero_supporting" CASCADE;
  DROP TABLE "cms"."pages_blocks_hero" CASCADE;
  DROP TABLE "cms"."pages_blocks_domain_search" CASCADE;
  DROP TABLE "cms"."pages_blocks_feature_cards_items" CASCADE;
  DROP TABLE "cms"."pages_blocks_feature_cards" CASCADE;
  DROP TABLE "cms"."pages_blocks_services_grid_cards" CASCADE;
  DROP TABLE "cms"."pages_blocks_services_grid" CASCADE;
  DROP TABLE "cms"."pages_blocks_pricing" CASCADE;
  DROP TABLE "cms"."pages_blocks_text" CASCADE;
  DROP TABLE "cms"."pages_blocks_image_text_points" CASCADE;
  DROP TABLE "cms"."pages_blocks_image_text" CASCADE;
  DROP TABLE "cms"."pages_blocks_faq_items" CASCADE;
  DROP TABLE "cms"."pages_blocks_faq" CASCADE;
  DROP TABLE "cms"."pages_blocks_testimonials_items" CASCADE;
  DROP TABLE "cms"."pages_blocks_testimonials" CASCADE;
  DROP TABLE "cms"."pages_blocks_logo_strip_logos" CASCADE;
  DROP TABLE "cms"."pages_blocks_logo_strip" CASCADE;
  DROP TABLE "cms"."pages_blocks_call_to_action" CASCADE;
  DROP TABLE "cms"."pages" CASCADE;
  DROP TABLE "cms"."pages_locales" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_hero_supporting" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_hero" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_domain_search" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_feature_cards_items" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_feature_cards" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_services_grid_cards" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_services_grid" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_pricing" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_text" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_image_text_points" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_image_text" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_faq_items" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_faq" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_testimonials_items" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_testimonials" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_logo_strip_logos" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_logo_strip" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_call_to_action" CASCADE;
  DROP TABLE "cms"."_pages_v" CASCADE;
  DROP TABLE "cms"."_pages_v_locales" CASCADE;
  DROP TABLE "cms"."payload_jobs_log" CASCADE;
  DROP TABLE "cms"."payload_jobs" CASCADE;
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pages_fk";
  
  DROP INDEX "cms"."payload_locked_documents_rels_pages_id_idx";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "pages_id";
  DROP TYPE "cms"."_locales";
  DROP TYPE "cms"."enum_pages_blocks_hero_primary_to";
  DROP TYPE "cms"."enum_pages_blocks_hero_secondary_to";
  DROP TYPE "cms"."enum_pages_blocks_hero_picture_source";
  DROP TYPE "cms"."enum_pages_blocks_feature_cards_items_icon";
  DROP TYPE "cms"."enum_pages_blocks_feature_cards_tone";
  DROP TYPE "cms"."enum_pages_blocks_feature_cards_style";
  DROP TYPE "cms"."enum_pages_blocks_services_grid_cards_icon";
  DROP TYPE "cms"."enum_pages_blocks_services_grid_tone";
  DROP TYPE "cms"."enum_pages_blocks_services_grid_more_to";
  DROP TYPE "cms"."enum_pages_blocks_pricing_tone";
  DROP TYPE "cms"."enum_pages_blocks_pricing_more_to";
  DROP TYPE "cms"."enum_pages_blocks_text_tone";
  DROP TYPE "cms"."enum_pages_blocks_image_text_points_icon";
  DROP TYPE "cms"."enum_pages_blocks_image_text_tone";
  DROP TYPE "cms"."enum_pages_blocks_image_text_picture_source";
  DROP TYPE "cms"."enum_pages_blocks_image_text_picture_side";
  DROP TYPE "cms"."enum_pages_blocks_image_text_card_link_to";
  DROP TYPE "cms"."enum_pages_blocks_faq_tone";
  DROP TYPE "cms"."enum_pages_blocks_testimonials_tone";
  DROP TYPE "cms"."enum_pages_blocks_logo_strip_tone";
  DROP TYPE "cms"."enum_pages_blocks_call_to_action_tone";
  DROP TYPE "cms"."enum_pages_blocks_call_to_action_primary_to";
  DROP TYPE "cms"."enum_pages_blocks_call_to_action_secondary_to";
  DROP TYPE "cms"."enum_pages_status";
  DROP TYPE "cms"."enum__pages_v_blocks_hero_primary_to";
  DROP TYPE "cms"."enum__pages_v_blocks_hero_secondary_to";
  DROP TYPE "cms"."enum__pages_v_blocks_hero_picture_source";
  DROP TYPE "cms"."enum__pages_v_blocks_feature_cards_items_icon";
  DROP TYPE "cms"."enum__pages_v_blocks_feature_cards_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_feature_cards_style";
  DROP TYPE "cms"."enum__pages_v_blocks_services_grid_cards_icon";
  DROP TYPE "cms"."enum__pages_v_blocks_services_grid_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_services_grid_more_to";
  DROP TYPE "cms"."enum__pages_v_blocks_pricing_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_pricing_more_to";
  DROP TYPE "cms"."enum__pages_v_blocks_text_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_image_text_points_icon";
  DROP TYPE "cms"."enum__pages_v_blocks_image_text_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_image_text_picture_source";
  DROP TYPE "cms"."enum__pages_v_blocks_image_text_picture_side";
  DROP TYPE "cms"."enum__pages_v_blocks_image_text_card_link_to";
  DROP TYPE "cms"."enum__pages_v_blocks_faq_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_testimonials_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_logo_strip_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_call_to_action_tone";
  DROP TYPE "cms"."enum__pages_v_blocks_call_to_action_primary_to";
  DROP TYPE "cms"."enum__pages_v_blocks_call_to_action_secondary_to";
  DROP TYPE "cms"."enum__pages_v_version_status";
  DROP TYPE "cms"."enum__pages_v_published_locale";
  DROP TYPE "cms"."enum_payload_jobs_log_task_slug";
  DROP TYPE "cms"."enum_payload_jobs_log_state";
  DROP TYPE "cms"."enum_payload_jobs_task_slug";`)
}
