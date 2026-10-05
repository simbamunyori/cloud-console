-- CreateEnum
CREATE TYPE "PriceBookRunStatus" AS ENUM ('NO_CHANGES', 'AWAITING_APPROVAL', 'APPLIED');

-- AlterTable
ALTER TABLE "FxRate" ADD COLUMN     "source" TEXT,
ADD COLUMN     "sourceDate" DATE;

-- AlterTable
ALTER TABLE "PriceBookEntry" ADD COLUMN     "runId" TEXT;

-- AlterTable
ALTER TABLE "PricingSettings" ADD COLUMN     "autoApproveBps" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "ratesCheckedAt" TIMESTAMP(3),
ADD COLUMN     "ratesError" TEXT;

-- CreateTable
CREATE TABLE "OfficialRateTable" (
    "id" TEXT NOT NULL,
    "publishedOn" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heldBack" TEXT,
    "acceptedById" TEXT,

    CONSTRAINT "OfficialRateTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialRate" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "OfficialRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookRun" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PriceBookRunStatus" NOT NULL,
    "tableId" TEXT NOT NULL,
    "rates" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "maxChangeBps" INTEGER NOT NULL,
    "thresholdBps" INTEGER NOT NULL,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceBookRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingAlert" (
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingAlert_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfficialRateTable_publishedOn_key" ON "OfficialRateTable"("publishedOn");

-- CreateIndex
CREATE UNIQUE INDEX "OfficialRate_tableId_base_quote_key" ON "OfficialRate"("tableId", "base", "quote");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBookRun_month_key" ON "PriceBookRun"("month");

-- AddForeignKey
ALTER TABLE "OfficialRate" ADD CONSTRAINT "OfficialRate_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "OfficialRateTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookRun" ADD CONSTRAINT "PriceBookRun_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "OfficialRateTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PriceBookRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

