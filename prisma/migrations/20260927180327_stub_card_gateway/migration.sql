-- CreateTable
CREATE TABLE "StubCardCharge" (
    "id" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "returnUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastFour" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StubCardCharge_pkey" PRIMARY KEY ("id")
);
