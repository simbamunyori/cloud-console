import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "cms"."pages_blocks_who_we_help_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"body_phone" varchar
  );
  
  CREATE TABLE "cms"."pages_blocks_who_we_help" (
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
  	"approved" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_who_we_help_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"body_phone" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_pages_v_blocks_who_we_help" (
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
  	"approved" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "cms"."pages_blocks_home_hero" ADD COLUMN "supporting" varchar;
  ALTER TABLE "cms"."_pages_v_blocks_home_hero" ADD COLUMN "supporting" varchar;
  ALTER TABLE "cms"."pages_blocks_who_we_help_items" ADD CONSTRAINT "pages_blocks_who_we_help_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages_blocks_who_we_help"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."pages_blocks_who_we_help" ADD CONSTRAINT "pages_blocks_who_we_help_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_who_we_help_items" ADD CONSTRAINT "_pages_v_blocks_who_we_help_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v_blocks_who_we_help"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_pages_v_blocks_who_we_help" ADD CONSTRAINT "_pages_v_blocks_who_we_help_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_who_we_help_items_order_idx" ON "cms"."pages_blocks_who_we_help_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_who_we_help_items_parent_id_idx" ON "cms"."pages_blocks_who_we_help_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_who_we_help_items_locale_idx" ON "cms"."pages_blocks_who_we_help_items" USING btree ("_locale");
  CREATE INDEX "pages_blocks_who_we_help_order_idx" ON "cms"."pages_blocks_who_we_help" USING btree ("_order");
  CREATE INDEX "pages_blocks_who_we_help_parent_id_idx" ON "cms"."pages_blocks_who_we_help" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_who_we_help_path_idx" ON "cms"."pages_blocks_who_we_help" USING btree ("_path");
  CREATE INDEX "pages_blocks_who_we_help_locale_idx" ON "cms"."pages_blocks_who_we_help" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_who_we_help_items_order_idx" ON "cms"."_pages_v_blocks_who_we_help_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_who_we_help_items_parent_id_idx" ON "cms"."_pages_v_blocks_who_we_help_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_who_we_help_items_locale_idx" ON "cms"."_pages_v_blocks_who_we_help_items" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_who_we_help_order_idx" ON "cms"."_pages_v_blocks_who_we_help" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_who_we_help_parent_id_idx" ON "cms"."_pages_v_blocks_who_we_help" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_who_we_help_path_idx" ON "cms"."_pages_v_blocks_who_we_help" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_who_we_help_locale_idx" ON "cms"."_pages_v_blocks_who_we_help" USING btree ("_locale");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."pages_blocks_who_we_help_items" CASCADE;
  DROP TABLE "cms"."pages_blocks_who_we_help" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_who_we_help_items" CASCADE;
  DROP TABLE "cms"."_pages_v_blocks_who_we_help" CASCADE;
  ALTER TABLE "cms"."pages_blocks_home_hero" DROP COLUMN "supporting";
  ALTER TABLE "cms"."_pages_v_blocks_home_hero" DROP COLUMN "supporting";`);
}
