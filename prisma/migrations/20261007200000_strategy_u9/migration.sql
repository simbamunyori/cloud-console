-- STRATEGY_ROLLOUT U9: free tools and referral partners. Adds tables, enums and one nullable column; changes nothing existing.

-- CreateEnum
CREATE TYPE "ReferralPartnerKind" AS ENUM ('ACCOUNTANT', 'CONSULTANT', 'IT_RESELLER', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferralPartnerStatus" AS ENUM ('APPLIED', 'ACTIVE', 'PAUSED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ReferralStatementStatus" AS ENUM ('NIL', 'DUE', 'PAID');

-- AlterTable
ALTER TABLE "SecurityProfile" ADD COLUMN     "startedFrom" TEXT;

-- CreateTable
CREATE TABLE "SharedResult" (
    "token" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "consentText" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedResult_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "ReferralPartner" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "kind" "ReferralPartnerKind" NOT NULL,
    "market" TEXT NOT NULL,
    "status" "ReferralPartnerStatus" NOT NULL DEFAULT 'APPLIED',
    "commissionBps" INTEGER,
    "dashboardToken" TEXT,
    "payoutDetails" TEXT,
    "consentText" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralStatement" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "paidInMinor" BIGINT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "commissionMinor" BIGINT NOT NULL,
    "lines" JSONB NOT NULL,
    "status" "ReferralStatementStatus" NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralSettings" (
    "id" TEXT NOT NULL DEFAULT 'referrals',
    "commissionBps" INTEGER NOT NULL DEFAULT 1000,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedResult_expiresAt_idx" ON "SharedResult"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralPartner_code_key" ON "ReferralPartner"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralPartner_dashboardToken_key" ON "ReferralPartner"("dashboardToken");

-- CreateIndex
CREATE INDEX "ReferralPartner_status_idx" ON "ReferralPartner"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_organisationId_key" ON "Referral"("organisationId");

-- CreateIndex
CREATE INDEX "Referral_partnerId_idx" ON "Referral"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralStatement_partnerId_month_key" ON "ReferralStatement"("partnerId", "month");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ReferralPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralStatement" ADD CONSTRAINT "ReferralStatement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ReferralPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

