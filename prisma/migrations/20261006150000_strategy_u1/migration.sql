-- CreateEnum
CREATE TYPE "DomainOperationKind" AS ENUM ('REGISTER', 'TRANSFER', 'RENEW');

-- CreateEnum
CREATE TYPE "DomainOperationStatus" AS ENUM ('WAITING_PAYMENT', 'SUBMITTED', 'DONE', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Tld" ADD COLUMN     "costSource" TEXT,
ADD COLUMN     "costSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FeatureSwitch" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureSwitch_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PartnerSetting" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL DEFAULT 'company',
    "legalName" TEXT NOT NULL,
    "tradingName" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT NOT NULL,
    "website" TEXT,
    "invoiceFooter" TEXT,
    "paymentTerms" TEXT,
    "quoteTerms" TEXT,
    "logoLight" BYTEA,
    "logoDark" BYTEA,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchName" TEXT,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branchCode" TEXT,
    "swiftCode" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainOperation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" "DomainOperationKind" NOT NULL,
    "domain" TEXT NOT NULL,
    "years" INTEGER NOT NULL,
    "registrar" TEXT NOT NULL,
    "billingOrderId" TEXT,
    "billingInvoiceId" TEXT,
    "billingDomainId" TEXT,
    "status" "DomainOperationStatus" NOT NULL DEFAULT 'WAITING_PAYMENT',
    "authCodeSealed" TEXT,
    "previousExpiry" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceEmail" (
    "invoiceId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEmail_pkey" PRIMARY KEY ("invoiceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_marketCode_currency_key" ON "BankAccount"("marketCode", "currency");

-- CreateIndex
CREATE INDEX "DomainOperation_status_idx" ON "DomainOperation"("status");

-- CreateIndex
CREATE INDEX "DomainOperation_organisationId_idx" ON "DomainOperation"("organisationId");

-- AddForeignKey
ALTER TABLE "DomainOperation" ADD CONSTRAINT "DomainOperation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Company > Banking starts with each market's existing bank details, in
-- the market's own currency. Nothing existing is changed.
INSERT INTO "BankAccount" ("id", "marketCode", "currency", "bankName", "accountName", "accountNumber", "branchCode", "swiftCode", "updatedAt")
SELECT 'bank_' || "code", "code", "currency", "eftBankName", "eftAccountName", "eftAccountNumber", "eftBranchCode", "eftSwiftCode", CURRENT_TIMESTAMP
FROM "Market"
WHERE "eftBankName" IS NOT NULL AND "eftAccountName" IS NOT NULL AND "eftAccountNumber" IS NOT NULL
ON CONFLICT ("marketCode", "currency") DO NOTHING;
