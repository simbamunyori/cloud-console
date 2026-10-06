-- STRATEGY_ROLLOUT U6: Microsoft 365 and Google Workspace automation. Only adds.

CREATE TYPE "TenantConsent" AS ENUM ('NONE', 'REQUESTED', 'GRANTED');

ALTER TABLE "Tenant" ADD COLUMN "consent" "TenantConsent" NOT NULL DEFAULT 'NONE',
ADD COLUMN "consentLink" TEXT,
ADD COLUMN "consentRequestedAt" TIMESTAMP(3),
ADD COLUMN "consentGrantedAt" TIMESTAMP(3),
ADD COLUMN "securityChecks" JSONB,
ADD COLUMN "securityCheckedAt" TIMESTAMP(3);

ALTER TABLE "TenantLicence" ADD COLUMN "vendorQuantity" INTEGER,
ADD COLUMN "vendorCheckedAt" TIMESTAMP(3);

ALTER TABLE "LicenceChange" ADD COLUMN "vendorAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "vendorError" TEXT;
