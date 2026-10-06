-- STRATEGY_ROLLOUT U10: Thebe as a billable product. Adds one table and its enum; changes nothing existing.

-- CreateEnum
CREATE TYPE "ThebeAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED');

-- CreateTable
CREATE TABLE "ThebeAccount" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "users" INTEGER NOT NULL DEFAULT 1,
    "orderId" TEXT,
    "taskId" TEXT,
    "status" "ThebeAccountStatus" NOT NULL DEFAULT 'PENDING',
    "thebeId" TEXT,
    "url" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThebeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThebeAccount_organisationId_key" ON "ThebeAccount"("organisationId");

-- AddForeignKey
ALTER TABLE "ThebeAccount" ADD CONSTRAINT "ThebeAccount_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

