-- CreateEnum
CREATE TYPE "TenantVendor" AS ENUM ('MICROSOFT', 'GOOGLE');

-- CreateEnum
CREATE TYPE "LicenceChangeKind" AS ENUM ('ASSIGN', 'UNASSIGN', 'ADD_USER', 'REMOVE_USER');

-- CreateEnum
CREATE TYPE "LicenceChangeStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "vendor" "TenantVendor" NOT NULL,
    "primaryDomain" TEXT NOT NULL,
    "vendorTenantId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantLicence" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purchased" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantLicence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantUser" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenceAssignment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "licenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenceChange" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "LicenceChangeKind" NOT NULL,
    "status" "LicenceChangeStatus" NOT NULL DEFAULT 'PENDING',
    "tenantUserId" TEXT,
    "licenceId" TEXT,
    "email" TEXT,
    "name" TEXT,
    "taskId" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LicenceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_organisationId_vendor_key" ON "Tenant"("organisationId", "vendor");

-- CreateIndex
CREATE INDEX "TenantLicence_organisationId_idx" ON "TenantLicence"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantLicence_tenantId_sku_key" ON "TenantLicence"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "TenantUser_organisationId_idx" ON "TenantUser"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUser_tenantId_email_key" ON "TenantUser"("tenantId", "email");

-- CreateIndex
CREATE INDEX "LicenceAssignment_organisationId_idx" ON "LicenceAssignment"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "LicenceAssignment_tenantUserId_licenceId_key" ON "LicenceAssignment"("tenantUserId", "licenceId");

-- CreateIndex
CREATE INDEX "LicenceChange_organisationId_status_idx" ON "LicenceChange"("organisationId", "status");

-- CreateIndex
CREATE INDEX "LicenceChange_taskId_idx" ON "LicenceChange"("taskId");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLicence" ADD CONSTRAINT "TenantLicence_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLicence" ADD CONSTRAINT "TenantLicence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceAssignment" ADD CONSTRAINT "LicenceAssignment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceAssignment" ADD CONSTRAINT "LicenceAssignment_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "TenantUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceAssignment" ADD CONSTRAINT "LicenceAssignment_licenceId_fkey" FOREIGN KEY ("licenceId") REFERENCES "TenantLicence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceChange" ADD CONSTRAINT "LicenceChange_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceChange" ADD CONSTRAINT "LicenceChange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceChange" ADD CONSTRAINT "LicenceChange_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "TenantUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceChange" ADD CONSTRAINT "LicenceChange_licenceId_fkey" FOREIGN KEY ("licenceId") REFERENCES "TenantLicence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenceChange" ADD CONSTRAINT "LicenceChange_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProvisioningTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

