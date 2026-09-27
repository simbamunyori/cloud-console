-- Price books per market replace the one BWP monthly price list.

-- Where each product is offered. Everything is offered everywhere except
-- Local data copy, which is kept in Botswana.
ALTER TABLE "Product" ADD COLUMN     "markets" TEXT[];
UPDATE "Product" SET "markets" = ARRAY(SELECT "code" FROM "Market" ORDER BY "sortOrder");
UPDATE "Product" SET "markets" = ARRAY['bw'] WHERE "slug" = 'local-data-copy';

-- CreateTable
CREATE TABLE "Tld" (
    "tld" TEXT NOT NULL,
    "costRegisterMinor" BIGINT NOT NULL,
    "costRenewMinor" BIGINT NOT NULL,
    "costCurrency" TEXT NOT NULL,
    "markets" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Tld_pkey" PRIMARY KEY ("tld")
);

-- CreateTable
CREATE TABLE "PriceBookEntry" (
    "id" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "renewMinor" BIGINT,
    "suggestedMinor" BIGINT,
    "breakdown" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceBookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceBookEntry_marketCode_item_month_key" ON "PriceBookEntry"("marketCode", "item", "month");

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_marketCode_fkey" FOREIGN KEY ("marketCode") REFERENCES "Market"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The BWP prices already fixed become the approved Botswana book, each
-- from its own month, so what customers pay doesn't change.
INSERT INTO "PriceBookEntry" ("id", "marketCode", "item", "month", "currency", "amountMinor", "suggestedMinor", "breakdown", "approvedAt")
SELECT 'mp_' || mp."id", 'bw', 'product:' || p."slug", mp."month", mp."currency", mp."amountMinor", mp."amountMinor", mp."breakdown", mp."createdAt"
FROM "MonthlyPrice" mp JOIN "Product" p ON p."id" = mp."productId"
WHERE mp."currency" = 'BWP';

-- DropForeignKey
ALTER TABLE "MonthlyPrice" DROP CONSTRAINT "MonthlyPrice_productId_fkey";

-- DropTable
DROP TABLE "MonthlyPrice";
