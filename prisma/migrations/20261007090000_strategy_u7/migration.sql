-- STRATEGY_ROLLOUT U7: the business structure. Only adds.

CREATE TYPE "BusinessUnit" AS ENUM ('SALES', 'DELIVERY', 'SUPPORT', 'OPERATIONS', 'PARTNERSHIPS', 'FINANCE', 'MARKETING', 'PRODUCT');
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "PartnerStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'PAUSED', 'ENDED');

ALTER TABLE "User" ADD COLUMN "units" "BusinessUnit"[] DEFAULT ARRAY[]::"BusinessUnit"[];

ALTER TABLE "Ticket" ADD COLUMN "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "unit" "BusinessUnit" NOT NULL DEFAULT 'SUPPORT',
ADD COLUMN "firstResponseAt" TIMESTAMP(3),
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "rating" INTEGER,
ADD COLUMN "ratingComment" TEXT,
ADD COLUMN "ratedAt" TIMESTAMP(3),
ADD COLUMN "ratingToken" TEXT;

CREATE UNIQUE INDEX "Ticket_ratingToken_key" ON "Ticket"("ratingToken");

CREATE TABLE "UnitRoute" (
    "queue" TEXT NOT NULL,
    "unit" "BusinessUnit" NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitRoute_pkey" PRIMARY KEY ("queue")
);

CREATE TABLE "UnitTarget" (
    "unit" "BusinessUnit" NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "firstResponseMinutes" INTEGER NOT NULL,
    "resolveMinutes" INTEGER NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitTarget_pkey" PRIMARY KEY ("unit","priority")
);

CREATE TABLE "ResponseReport" (
    "month" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "tickets" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResponseReport_pkey" PRIMARY KEY ("month")
);

CREATE TABLE "PartnerRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "contacts" TEXT,
    "agreementRef" TEXT,
    "agreementUrl" TEXT,
    "startsOn" TIMESTAMP(3),
    "renewsOn" TIMESTAMP(3),
    "noticeDays" INTEGER NOT NULL DEFAULT 60,
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "remindedFor" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerRecord_pkey" PRIMARY KEY ("id")
);
