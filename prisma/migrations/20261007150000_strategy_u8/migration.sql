-- STRATEGY_ROLLOUT U8: the success dashboard. Adds two tables; changes nothing existing.

-- CreateTable
CREATE TABLE "SuccessSnapshot" (
    "month" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuccessSnapshot_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "SuccessSettings" (
    "id" TEXT NOT NULL DEFAULT 'success',
    "directorEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targets" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuccessSettings_pkey" PRIMARY KEY ("id")
);
