-- AlterTable
ALTER TABLE "CardPayment" ADD COLUMN     "gatewayToken" TEXT;

-- CreateIndex
CREATE INDEX "CardPayment_status_createdAt_idx" ON "CardPayment"("status", "createdAt");

