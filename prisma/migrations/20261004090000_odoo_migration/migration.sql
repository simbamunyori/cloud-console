-- CreateEnum
CREATE TYPE "HostLocation" AS ENUM ('OURS', 'CONTABO', 'SITEGROUND', 'OTHER');

-- CreateEnum
CREATE TYPE "MigrationStatus" AS ENUM ('REVIEW', 'APPROVED', 'IMPORTING', 'IMPORTED', 'FAILED', 'DISCARDED');

-- AlterTable
ALTER TABLE "ProvisioningTask" ADD COLUMN     "billingServiceId" TEXT,
ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ServiceProfile" (
    "billingServiceId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "legacyRecurringMinor" BIGINT,
    "legacyQuantity" INTEGER,
    "legacyCurrency" TEXT,
    "legacyReviewOn" DATE,
    "hostedAt" "HostLocation" NOT NULL DEFAULT 'OURS',
    "hostServer" TEXT,
    "hostNotes" TEXT,
    "lastStatus" TEXT,
    "movedAt" TIMESTAMP(3),
    "movedByName" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceProfile_pkey" PRIMARY KEY ("billingServiceId")
);

-- CreateTable
CREATE TABLE "MigrationBatch" (
    "id" TEXT NOT NULL,
    "status" "MigrationStatus" NOT NULL DEFAULT 'REVIEW',
    "source" JSONB NOT NULL,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "report" JSONB NOT NULL,
    "reportHash" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "approvedHash" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "cutoverOn" DATE,
    "cutoverSetByName" TEXT,
    "welcomeSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "organisationId" TEXT,
    "targetId" TEXT,
    "welcomedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceProfile_organisationId_idx" ON "ServiceProfile"("organisationId");

-- CreateIndex
CREATE INDEX "ServiceProfile_hostedAt_idx" ON "ServiceProfile"("hostedAt");

-- CreateIndex
CREATE INDEX "MigrationBatch_status_idx" ON "MigrationBatch"("status");

-- CreateIndex
CREATE INDEX "MigrationRecord_batchId_kind_idx" ON "MigrationRecord"("batchId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationRecord_kind_sourceRef_key" ON "MigrationRecord"("kind", "sourceRef");

-- AddForeignKey
ALTER TABLE "ServiceProfile" ADD CONSTRAINT "ServiceProfile_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationRecord" ADD CONSTRAINT "MigrationRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MigrationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

