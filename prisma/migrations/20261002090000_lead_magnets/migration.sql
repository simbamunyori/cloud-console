-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadSource" ADD VALUE 'QUOTE';
ALTER TYPE "LeadSource" ADD VALUE 'NEWSLETTER';
ALTER TYPE "LeadSource" ADD VALUE 'EMAIL_CHECK';
ALTER TYPE "LeadSource" ADD VALUE 'COST_CALCULATOR';
ALTER TYPE "LeadSource" ADD VALUE 'DPA_CHECKLIST';
ALTER TYPE "LeadSource" ADD VALUE 'BOOKING';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "campaign" TEXT,
ADD COLUMN     "campaignMedium" TEXT,
ADD COLUMN     "campaignSource" TEXT,
ADD COLUMN     "followUp" TEXT,
ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "followUpStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "followUpStopped" TEXT,
ADD COLUMN     "followUpStoppedAt" TIMESTAMP(3),
ADD COLUMN     "tool" TEXT,
ADD COLUMN     "toolResult" JSONB,
ADD COLUMN     "unsubscribeToken" TEXT;

-- CreateTable
CREATE TABLE "LeadTouch" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL,
    "tool" TEXT,
    "campaign" TEXT,
    "campaignSource" TEXT,
    "campaignMedium" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadTouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresalesEngineer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "meetingUrl" TEXT,
    "hours" JSONB NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Africa/Gaborone',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresalesEngineer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresalesBooking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "engineerId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "topic" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "notes" TEXT NOT NULL,
    "leadId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "cancelTokenHash" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresalesBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessCheck" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "organisationId" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadinessCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadTouch_leadId_createdAt_idx" ON "LeadTouch"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PresalesEngineer_userId_key" ON "PresalesEngineer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PresalesBooking_reference_key" ON "PresalesBooking"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PresalesBooking_cancelTokenHash_key" ON "PresalesBooking"("cancelTokenHash");

-- CreateIndex
CREATE INDEX "PresalesBooking_engineerId_startsAt_idx" ON "PresalesBooking"("engineerId", "startsAt");

-- CreateIndex
CREATE INDEX "PresalesBooking_status_startsAt_idx" ON "PresalesBooking"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessCheck_token_key" ON "ReadinessCheck"("token");

-- CreateIndex
CREATE INDEX "ReadinessCheck_purgeAfter_idx" ON "ReadinessCheck"("purgeAfter");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_unsubscribeToken_key" ON "Lead"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_followUpAt_idx" ON "Lead"("followUpAt");

-- AddForeignKey
ALTER TABLE "LeadTouch" ADD CONSTRAINT "LeadTouch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesEngineer" ADD CONSTRAINT "PresalesEngineer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesBooking" ADD CONSTRAINT "PresalesBooking_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "PresalesEngineer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesBooking" ADD CONSTRAINT "PresalesBooking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

