-- CreateEnum
CREATE TYPE "CampaignEventKind" AS ENUM ('VISIT', 'LEAD', 'QUOTE', 'SIGN_UP');

-- CreateEnum
CREATE TYPE "NewsletterIssueStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateTable
CREATE TABLE "LaunchKit" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT '',
    "faq" JSONB NOT NULL DEFAULT '[]',
    "pageApprovedAt" TIMESTAMP(3),
    "pageApprovedById" TEXT,
    "insightId" TEXT,
    "linkedinText" TEXT NOT NULL DEFAULT '',
    "linkedinApprovedAt" TIMESTAMP(3),
    "linkedinApprovedById" TEXT,
    "draftedAt" TIMESTAMP(3),
    "draftError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaunchKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEvent" (
    "id" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "kind" "CampaignEventKind" NOT NULL,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterIssue" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "status" "NewsletterIssueStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LaunchKit_productId_key" ON "LaunchKit"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "LaunchKit_campaign_key" ON "LaunchKit"("campaign");

-- CreateIndex
CREATE INDEX "CampaignEvent_campaign_kind_idx" ON "CampaignEvent"("campaign", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterIssue_market_month_key" ON "NewsletterIssue"("market", "month");

-- AddForeignKey
ALTER TABLE "LaunchKit" ADD CONSTRAINT "LaunchKit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
