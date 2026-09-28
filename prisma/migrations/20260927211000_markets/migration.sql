-- CreateEnum
CREATE TYPE "TaxDisplay" AS ENUM ('INCLUSIVE', 'EXCLUSIVE');

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "billingMarket" TEXT NOT NULL DEFAULT 'bw';

-- CreateTable
CREATE TABLE "Market" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countries" TEXT[],
    "currency" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "taxDisplay" "TaxDisplay" NOT NULL DEFAULT 'EXCLUSIVE',
    "taxLabel" TEXT NOT NULL DEFAULT 'VAT',
    "taxRegistrationNumber" TEXT,
    "paymentMethods" TEXT[],
    "eftBankName" TEXT,
    "eftAccountName" TEXT,
    "eftAccountNumber" TEXT,
    "eftBranchCode" TEXT,
    "eftSwiftCode" TEXT,
    "supportEmail" TEXT NOT NULL,
    "supportPhone" TEXT,
    "supportHours" TEXT NOT NULL,
    "highlightedTlds" TEXT[],
    "dataProtectionLaw" TEXT,
    "legalPages" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "MarketChange" (
    "id" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "country" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT,
    "contactedAt" TIMESTAMP(3),
    "contactedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubTaxRule" (
    "country" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "StubTaxRule_pkey" PRIMARY KEY ("country")
);

-- The four markets from Change Request 01. Only bw is switched on; staff
-- switch the others on in /admin/markets. Tax is off until registration
-- and rates are confirmed. Contact details are placeholders.
INSERT INTO "Market" ("code", "name", "countries", "currency", "locale", "timeZone", "enabled", "isDefault", "sortOrder", "taxLabel", "paymentMethods", "supportEmail", "supportHours", "highlightedTlds", "dataProtectionLaw", "updatedAt") VALUES
  ('bw', 'Botswana', ARRAY['BW'], 'BWP', 'en-BW', 'Africa/Gaborone', true, true, 1, 'VAT', ARRAY['card', 'eft'], 'support@localhost', 'Monday to Friday, 8:00 to 17:00', ARRAY['.bw', '.co.bw'], 'Data Protection Act, 2024', CURRENT_TIMESTAMP),
  ('za', 'South Africa', ARRAY['ZA'], 'ZAR', 'en-ZA', 'Africa/Johannesburg', false, false, 2, 'VAT', ARRAY['card', 'eft'], 'support@localhost', 'Monday to Friday, 8:00 to 17:00', ARRAY['.co.za'], 'Protection of Personal Information Act (POPIA)', CURRENT_TIMESTAMP),
  ('zw', 'Zimbabwe', ARRAY['ZW'], 'USD', 'en-ZW', 'Africa/Harare', false, false, 3, 'VAT', ARRAY['card', 'eft'], 'support@localhost', 'Monday to Friday, 8:00 to 17:00', ARRAY['.co.zw'], 'Cyber and Data Protection Act, 2021', CURRENT_TIMESTAMP),
  ('global', 'International', ARRAY[]::TEXT[], 'USD', 'en-US', 'UTC', false, false, 4, 'Tax', ARRAY['card'], 'support@localhost', 'Monday to Friday, 8:00 to 17:00 (UTC+2)', ARRAY['.com', '.net', '.org', '.io'], NULL, CURRENT_TIMESTAMP);

-- Existing organisations are Botswana customers billed in BWP.
UPDATE "Organisation" SET "billingMarket" = 'bw';

-- CreateIndex
CREATE INDEX "MarketChange_marketCode_createdAt_idx" ON "MarketChange"("marketCode", "createdAt");

-- CreateIndex
CREATE INDEX "WaitlistEntry_country_createdAt_idx" ON "WaitlistEntry"("country", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketChange" ADD CONSTRAINT "MarketChange_marketCode_fkey" FOREIGN KEY ("marketCode") REFERENCES "Market"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketChange" ADD CONSTRAINT "MarketChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_billingMarket_fkey" FOREIGN KEY ("billingMarket") REFERENCES "Market"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
