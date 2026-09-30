-- CreateEnum
CREATE TYPE "CloudVendor" AS ENUM ('AZURE');

-- CreateEnum
CREATE TYPE "SavingSource" AS ENUM ('AUTO', 'STAFF');

-- CreateEnum
CREATE TYPE "SavingStatus" AS ENUM ('OPEN', 'ASKED', 'DONE', 'DISMISSED');

-- CreateTable
CREATE TABLE "InvoiceSpend" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloudSubscription" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "vendor" "CloudVendor" NOT NULL DEFAULT 'AZURE',
    "subscriptionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marginBps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloudUsage" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "resourceGroup" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "costMinor" BIGINT NOT NULL,
    "costCurrency" TEXT NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "importId" TEXT NOT NULL,

    CONSTRAINT "CloudUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloudUsageImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowsRead" INTEGER NOT NULL,
    "rowsImported" INTEGER NOT NULL,
    "firstDay" DATE,
    "lastDay" DATE,
    "notes" JSONB NOT NULL DEFAULT '[]',
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CloudUsageImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingTip" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "source" "SavingSource" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "monthlyMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "SavingStatus" NOT NULL DEFAULT 'OPEN',
    "taskId" TEXT,
    "createdById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceSpend_organisationId_month_idx" ON "InvoiceSpend"("organisationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSpend_organisationId_invoiceId_key" ON "InvoiceSpend"("organisationId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CloudSubscription_subscriptionId_key" ON "CloudSubscription"("subscriptionId");

-- CreateIndex
CREATE INDEX "CloudSubscription_organisationId_idx" ON "CloudSubscription"("organisationId");

-- CreateIndex
CREATE INDEX "CloudUsage_organisationId_day_idx" ON "CloudUsage"("organisationId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "CloudUsage_subscriptionId_day_resourceGroup_resource_catego_key" ON "CloudUsage"("subscriptionId", "day", "resourceGroup", "resource", "category");

-- CreateIndex
CREATE UNIQUE INDEX "SavingTip_organisationId_key_key" ON "SavingTip"("organisationId", "key");

-- AddForeignKey
ALTER TABLE "InvoiceSpend" ADD CONSTRAINT "InvoiceSpend_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudSubscription" ADD CONSTRAINT "CloudSubscription_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudUsage" ADD CONSTRAINT "CloudUsage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudUsage" ADD CONSTRAINT "CloudUsage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CloudSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudUsage" ADD CONSTRAINT "CloudUsage_importId_fkey" FOREIGN KEY ("importId") REFERENCES "CloudUsageImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingTip" ADD CONSTRAINT "SavingTip_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

