-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('ASSISTANT', 'PERSON');

-- CreateTable
CREATE TABLE "SalesChat" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "startedOn" TEXT,
    "handedOverAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" "AssistantRole" NOT NULL,
    "text" TEXT NOT NULL,
    "toolTrace" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "need" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "chatId" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesChat_tokenHash_key" ON "SalesChat"("tokenHash");

-- CreateIndex
CREATE INDEX "SalesChat_purgeAfter_idx" ON "SalesChat"("purgeAfter");

-- CreateIndex
CREATE INDEX "SalesChatMessage_chatId_createdAt_idx" ON "SalesChatMessage"("chatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_reference_key" ON "Lead"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_chatId_key" ON "Lead"("chatId");

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_purgeAfter_idx" ON "Lead"("purgeAfter");

-- AddForeignKey
ALTER TABLE "SalesChatMessage" ADD CONSTRAINT "SalesChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "SalesChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "SalesChat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
