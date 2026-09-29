-- Change Request 02: catalogue admin. Families become a table, products get
-- a status (draft, internal, live) in place of the on/off switch, and a
-- fulfilment type.

CREATE TYPE "CatalogueStatus" AS ENUM ('DRAFT', 'INTERNAL', 'LIVE');
CREATE TYPE "Fulfilment" AS ENUM ('AUTOMATIC', 'MANUAL', 'QUOTE');

CREATE TABLE "ProductFamily" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "connector" "ConnectorFamily" NOT NULL,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFamily_pkey" PRIMARY KEY ("key")
);

-- One live family per connector, as before.
INSERT INTO "ProductFamily" ("key", "name", "description", "connector", "status", "sortOrder", "updatedAt") VALUES
  ('productivity', 'Productivity', 'Microsoft 365 and Google Workspace.', 'PRODUCTIVITY', 'LIVE', 1, CURRENT_TIMESTAMP),
  ('servers', 'Servers', 'Managed servers.', 'SERVERS', 'LIVE', 2, CURRENT_TIMESTAMP),
  ('web-and-domains', 'Web and domains', 'Hosting, business email and domain names.', 'WEB_AND_DOMAINS', 'LIVE', 3, CURRENT_TIMESTAMP),
  ('protection', 'Protection', 'Backups, recovery and security monitoring.', 'PROTECTION', 'LIVE', 4, CURRENT_TIMESTAMP),
  ('public-cloud', 'Public cloud', 'Microsoft Azure.', 'PUBLIC_CLOUD', 'LIVE', 5, CURRENT_TIMESTAMP),
  ('our-software', 'Our software', 'Software we build and run.', 'OUR_SOFTWARE', 'LIVE', 6, CURRENT_TIMESTAMP),
  ('services', 'Services', 'Help from our team.', 'SERVICES', 'LIVE', 7, CURRENT_TIMESTAMP);

ALTER TABLE "ProductCategory" ADD COLUMN "familyKey" TEXT;
UPDATE "ProductCategory" c SET "familyKey" = f."key" FROM "ProductFamily" f WHERE f."connector" = c."family";
ALTER TABLE "ProductCategory" ALTER COLUMN "familyKey" SET NOT NULL;
ALTER TABLE "ProductCategory" DROP COLUMN "family";
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_familyKey_fkey" FOREIGN KEY ("familyKey") REFERENCES "ProductFamily"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN "status" "CatalogueStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Product" ADD COLUMN "fulfilment" "Fulfilment" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Product" ADD COLUMN "minTermMonths" INTEGER NOT NULL DEFAULT 1;
-- On sale stays on sale; switched off (Local data copy) becomes a draft.
UPDATE "Product" SET "status" = CASE WHEN "active" THEN 'LIVE'::"CatalogueStatus" ELSE 'DRAFT'::"CatalogueStatus" END;
ALTER TABLE "Product" DROP COLUMN "active";
ALTER TABLE "Product" ALTER COLUMN "billingProductId" DROP NOT NULL;

ALTER TABLE "Organisation" ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false;
