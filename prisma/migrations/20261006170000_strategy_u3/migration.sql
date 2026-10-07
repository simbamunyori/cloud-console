-- CreateEnum
CREATE TYPE "BackupHealth" AS ENUM ('PENDING', 'OK', 'WARNING', 'FAILED');

-- CreateEnum
CREATE TYPE "RestoreStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "marginFloorBps" INTEGER NOT NULL DEFAULT 1500;

-- CreateTable
CREATE TABLE "ProductInclusion" (
    "planId" TEXT NOT NULL,
    "includedId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductInclusion_pkey" PRIMARY KEY ("planId","includedId")
);

-- CreateTable
CREATE TABLE "BackupProtection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "billingServiceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "health" "BackupHealth" NOT NULL DEFAULT 'PENDING',
    "lastSuccessAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "retentionDays" INTEGER,
    "coverage" TEXT,
    "providerRef" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupProtection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRestoreRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "protectionId" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "fromDay" DATE NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "RestoreStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "taskId" TEXT,
    "providerRef" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupRestoreRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupProtection_health_idx" ON "BackupProtection"("health");

-- CreateIndex
CREATE UNIQUE INDEX "BackupProtection_organisationId_billingServiceId_key" ON "BackupProtection"("organisationId", "billingServiceId");

-- CreateIndex
CREATE INDEX "BackupRestoreRequest_organisationId_status_idx" ON "BackupRestoreRequest"("organisationId", "status");

-- AddForeignKey
ALTER TABLE "ProductInclusion" ADD CONSTRAINT "ProductInclusion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInclusion" ADD CONSTRAINT "ProductInclusion_includedId_fkey" FOREIGN KEY ("includedId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupProtection" ADD CONSTRAINT "BackupProtection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRestoreRequest" ADD CONSTRAINT "BackupRestoreRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRestoreRequest" ADD CONSTRAINT "BackupRestoreRequest_protectionId_fkey" FOREIGN KEY ("protectionId") REFERENCES "BackupProtection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- STRATEGY_ROLLOUT U3: email security as a catalogue product of its own, off
-- sale and without a cost until staff set it in the catalogue. Only on a server
-- that already has the catalogue; a new one gets it from the launch catalogue.
INSERT INTO "Product" ("id", "slug", "categoryKey", "name", "summary", "includes", "excludes", "unitLabel", "quantityAllowed", "costMinor", "costCurrency", "setupHours", "status", "fulfilment", "markets", "options", "sortOrder", "updatedAt")
SELECT 'u3-email-security', 'email-security', 'protection', 'Email security',
       'Spam, phishing and malware filtering for every mailbox, with links checked when clicked.',
       ARRAY['Spam, phishing and malware filtering', 'Links and attachments checked before they open', 'Quarantine you can review in the console'],
       ARRAY['Advanced threat hunting (see Managed detection and response)'],
       'per user', true, 0, 'USD', 4, 'DRAFT', 'MANUAL', ARRAY(SELECT "code" FROM "Market" ORDER BY "sortOrder"), '[]'::jsonb,
       (SELECT COALESCE(MAX("sortOrder"), 0) + 1 FROM "Product"), CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "ProductCategory" WHERE "key" = 'protection')
  AND NOT EXISTS (SELECT 1 FROM "Product" WHERE "slug" = 'email-security');

-- The baseline each plan includes, which staff change in the catalogue. Nothing
-- shows to customers or changes a price until Admin > Features > "Security and
-- backup included in plans" is on.
INSERT INTO "ProductInclusion" ("planId", "includedId", "quantity", "sortOrder")
SELECT plan."id", inc."id", 1, pairs.n
FROM (VALUES
  ('microsoft-365-business-basic', 'email-security', 0), ('microsoft-365-business-basic', 'backup-microsoft-365', 1),
  ('microsoft-365-business-standard', 'email-security', 0), ('microsoft-365-business-standard', 'backup-microsoft-365', 1),
  ('microsoft-365-business-premium', 'email-security', 0), ('microsoft-365-business-premium', 'backup-microsoft-365', 1),
  ('google-workspace-business-starter', 'email-security', 0), ('google-workspace-business-starter', 'backup-google-workspace', 1),
  ('google-workspace-business-standard', 'email-security', 0), ('google-workspace-business-standard', 'backup-google-workspace', 1),
  ('google-workspace-business-plus', 'email-security', 0), ('google-workspace-business-plus', 'backup-google-workspace', 1),
  ('business-email', 'email-security', 0),
  ('web-hosting', 'server-backup', 0), ('wordpress-hosting', 'server-backup', 0),
  ('managed-vps-small', 'server-backup', 0), ('managed-vps-medium', 'server-backup', 0), ('managed-vps-large', 'server-backup', 0)
) AS pairs(plan_slug, included_slug, n)
JOIN "Product" plan ON plan."slug" = pairs.plan_slug
JOIN "Product" inc ON inc."slug" = pairs.included_slug
ON CONFLICT DO NOTHING;
