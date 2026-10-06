-- CreateEnum
CREATE TYPE "SecurityProviderType" AS ENUM ('MANUAL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "SecurityTenantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "DeviceHealth" AS ENUM ('HEALTHY', 'AT_RISK', 'OFFLINE', 'UNPROTECTED');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('NEW', 'INVESTIGATING', 'CONTAINED', 'RESOLVED');

-- CreateTable
CREATE TABLE "SecurityProvider" (
    "id" TEXT NOT NULL,
    "type" "SecurityProviderType" NOT NULL DEFAULT 'MANUAL',
    "name" TEXT NOT NULL,
    "endpoint" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityTenant" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "tenantRef" TEXT,
    "status" "SecurityTenantStatus" NOT NULL DEFAULT 'PENDING',
    "enrolmentLink" TEXT,
    "enrolmentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityTenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityDevice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "os" TEXT,
    "health" "DeviceHealth" NOT NULL DEFAULT 'HEALTHY',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityIncident" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "providerId" TEXT,
    "providerRef" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'NEW',
    "ourAction" TEXT,
    "deviceName" TEXT,
    "assigneeId" TEXT,
    "respondBy" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityIncidentEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibleToCustomer" BOOLEAN NOT NULL DEFAULT false,
    "actorLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityIncidentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocReport" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityWebhookEvent" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "criticalMinutes" INTEGER NOT NULL DEFAULT 15,
    "highMinutes" INTEGER NOT NULL DEFAULT 60,
    "mediumMinutes" INTEGER NOT NULL DEFAULT 240,
    "lowMinutes" INTEGER NOT NULL DEFAULT 1440,
    "escalationEmail" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityTenant_organisationId_key" ON "SecurityTenant"("organisationId");

-- CreateIndex
CREATE INDEX "SecurityDevice_organisationId_idx" ON "SecurityDevice"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityDevice_tenantId_providerRef_key" ON "SecurityDevice"("tenantId", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityIncident_reference_key" ON "SecurityIncident"("reference");

-- CreateIndex
CREATE INDEX "SecurityIncident_status_respondBy_idx" ON "SecurityIncident"("status", "respondBy");

-- CreateIndex
CREATE INDEX "SecurityIncident_organisationId_idx" ON "SecurityIncident"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityIncident_providerId_providerRef_key" ON "SecurityIncident"("providerId", "providerRef");

-- CreateIndex
CREATE INDEX "SecurityIncidentEvent_incidentId_createdAt_idx" ON "SecurityIncidentEvent"("incidentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocReport_organisationId_month_key" ON "SocReport"("organisationId", "month");

-- CreateIndex
CREATE INDEX "SecurityWebhookEvent_receivedAt_idx" ON "SecurityWebhookEvent"("receivedAt");

-- AddForeignKey
ALTER TABLE "SecurityTenant" ADD CONSTRAINT "SecurityTenant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityTenant" ADD CONSTRAINT "SecurityTenant_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "SecurityProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityDevice" ADD CONSTRAINT "SecurityDevice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityDevice" ADD CONSTRAINT "SecurityDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "SecurityTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityIncident" ADD CONSTRAINT "SecurityIncident_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityIncident" ADD CONSTRAINT "SecurityIncident_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "SecurityProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityIncident" ADD CONSTRAINT "SecurityIncident_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityIncidentEvent" ADD CONSTRAINT "SecurityIncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocReport" ADD CONSTRAINT "SocReport_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityWebhookEvent" ADD CONSTRAINT "SecurityWebhookEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "SecurityProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

