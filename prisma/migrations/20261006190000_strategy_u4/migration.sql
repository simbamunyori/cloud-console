-- CreateTable
CREATE TABLE "SecurityProfile" (
    "organisationId" TEXT NOT NULL,
    "emailDomain" TEXT,
    "emailReport" JSONB,
    "emailCheckedAt" TIMESTAMP(3),
    "score" INTEGER,
    "checks" JSONB,
    "scoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityProfile_pkey" PRIMARY KEY ("organisationId")
);

-- CreateTable
CREATE TABLE "SecurityReport" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "checks" JSONB NOT NULL,
    "emailDomain" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityProfile_score_idx" ON "SecurityProfile"("score");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityReport_organisationId_month_key" ON "SecurityReport"("organisationId", "month");

-- AddForeignKey
ALTER TABLE "SecurityProfile" ADD CONSTRAINT "SecurityProfile_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityReport" ADD CONSTRAINT "SecurityReport_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

