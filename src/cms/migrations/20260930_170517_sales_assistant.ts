import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_sales_assistant_off" AS ENUM('bw', 'za', 'zw', 'global');
  CREATE TABLE "cms"."sales_assistant_off" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum_sales_assistant_off",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."sales_assistant_quick_replies" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "cms"."sales_assistant" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "cms"."sales_assistant_locales" (
  	"greeting" varchar,
  	"knowledge" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "cms"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "cms"."sales_assistant_off" ADD CONSTRAINT "sales_assistant_off_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."sales_assistant"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."sales_assistant_quick_replies" ADD CONSTRAINT "sales_assistant_quick_replies_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."sales_assistant"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."sales_assistant_locales" ADD CONSTRAINT "sales_assistant_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."sales_assistant"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sales_assistant_off_order_idx" ON "cms"."sales_assistant_off" USING btree ("order");
  CREATE INDEX "sales_assistant_off_parent_idx" ON "cms"."sales_assistant_off" USING btree ("parent_id");
  CREATE INDEX "sales_assistant_quick_replies_order_idx" ON "cms"."sales_assistant_quick_replies" USING btree ("_order");
  CREATE INDEX "sales_assistant_quick_replies_parent_id_idx" ON "cms"."sales_assistant_quick_replies" USING btree ("_parent_id");
  CREATE INDEX "sales_assistant_quick_replies_locale_idx" ON "cms"."sales_assistant_quick_replies" USING btree ("_locale");
  CREATE UNIQUE INDEX "sales_assistant_locales_locale_parent_id_unique" ON "cms"."sales_assistant_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."sales_assistant_off" CASCADE;
  DROP TABLE "cms"."sales_assistant_quick_replies" CASCADE;
  DROP TABLE "cms"."sales_assistant" CASCADE;
  DROP TABLE "cms"."sales_assistant_locales" CASCADE;
  DROP TYPE "cms"."enum_sales_assistant_off";`)
}
