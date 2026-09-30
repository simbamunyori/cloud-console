-- AlterTable
ALTER TABLE "CloudSubscription" ADD COLUMN     "budgetMinor" BIGINT;

-- CreateTable
CREATE TABLE "CloudUsageBill" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "invoiceId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "billedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CloudUsageBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAlert" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "level" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CloudUsageBill_organisationId_idx" ON "CloudUsageBill"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "CloudUsageBill_subscriptionId_month_key" ON "CloudUsageBill"("subscriptionId", "month");

-- CreateIndex
CREATE INDEX "BudgetAlert_organisationId_idx" ON "BudgetAlert"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAlert_subscriptionId_month_level_key" ON "BudgetAlert"("subscriptionId", "month", "level");

-- AddForeignKey
ALTER TABLE "CloudUsageBill" ADD CONSTRAINT "CloudUsageBill_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudUsageBill" ADD CONSTRAINT "CloudUsageBill_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CloudSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CloudSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

