-- CreateEnum
CREATE TYPE "OnboardingKind" AS ENUM ('NEW', 'TRANSFER');

-- CreateTable
CREATE TABLE "TenantOnboarding" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "OnboardingKind" NOT NULL,
    "verificationValue" TEXT,
    "domainVerifiedAt" TIMESTAMP(3),
    "dnsCheckedAt" TIMESTAMP(3),
    "dnsResults" JSONB,
    "partnerInviteUrl" TEXT,
    "migrationSource" TEXT,
    "migrationStartsAt" TIMESTAMP(3),
    "migrationNotes" TEXT,
    "migrationTaskId" TEXT,
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantOnboarding_tenantId_key" ON "TenantOnboarding"("tenantId");

-- CreateIndex
CREATE INDEX "TenantOnboarding_organisationId_idx" ON "TenantOnboarding"("organisationId");

-- AddForeignKey
ALTER TABLE "TenantOnboarding" ADD CONSTRAINT "TenantOnboarding_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantOnboarding" ADD CONSTRAINT "TenantOnboarding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

