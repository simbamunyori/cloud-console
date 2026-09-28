-- CreateEnum
CREATE TYPE "UserKind" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('SUPPORT', 'PROVISIONING', 'FINANCE', 'ADMIN');

-- CreateEnum
CREATE TYPE "SessionStage" AS ENUM ('CODE_PENDING', 'SETUP_PENDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "SignInOutcome" AS ENUM ('SUCCEEDED', 'WRONG_PASSWORD', 'WRONG_CODE', 'LOCKED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'BILLING', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('STUB', 'WHMCS');

-- CreateEnum
CREATE TYPE "ConnectorFamily" AS ENUM ('PRODUCTIVITY', 'PUBLIC_CLOUD', 'SERVERS', 'WEB_AND_DOMAINS', 'PROTECTION', 'OUR_SOFTWARE', 'SERVICES');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SETTING_UP', 'ACTIVE', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EftStatus" AS ENUM ('AWAITING_CONFIRMATION', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CardPaymentStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'WAITING_ON_CUSTOMER', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('CUSTOMER', 'STAFF', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AssistantRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AssistantActionStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'BW',
    "currency" TEXT NOT NULL DEFAULT 'BWP',
    "timeZone" TEXT NOT NULL DEFAULT 'Africa/Gaborone',
    "registrationNumber" TEXT,
    "vatNumber" TEXT,
    "billingEmail" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "defaultPoNumber" TEXT,
    "deletedAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "kind" "UserKind" NOT NULL DEFAULT 'CUSTOMER',
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpLastStep" INTEGER,
    "totpEnabledAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "staffRole" "StaffRole",
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "audience" "UserKind" NOT NULL,
    "stage" "SessionStage" NOT NULL,
    "activeOrganisationId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignInEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcome" "SignInOutcome" NOT NULL,
    "method" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignInEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "actorKind" "ActorKind" NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "visibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundEmail" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT,
    "kind" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "subject" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "externalClientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePoNumber" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicePoNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "family" "ConnectorFamily" NOT NULL,
    "marginBps" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "includes" TEXT[],
    "excludes" TEXT[],
    "unitLabel" TEXT NOT NULL,
    "quantityAllowed" BOOLEAN NOT NULL DEFAULT false,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "costMinor" BIGINT NOT NULL,
    "costCurrency" TEXT NOT NULL,
    "fixedPriceMinor" BIGINT,
    "fixedPriceCurrency" TEXT,
    "setupHours" INTEGER NOT NULL,
    "commitmentNote" TEXT,
    "billingProductId" TEXT NOT NULL,
    "options" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "currencyBufferBps" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rateMicros" BIGINT NOT NULL,
    "setById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "options" JSONB,
    "unitPriceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "monthlyTotalMinor" BIGINT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'SETTING_UP',
    "expectedBy" TIMESTAMP(3) NOT NULL,
    "placedById" TEXT NOT NULL,
    "billingOrderId" TEXT,
    "billingServiceIds" TEXT[],
    "billingInvoiceId" TEXT,
    "changesServiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisioningTask" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "orderId" TEXT,
    "family" "ConnectorFamily" NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "expectedBy" TIMESTAMP(3) NOT NULL,
    "assigneeId" TEXT,
    "notes" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EftPayment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "status" "EftStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "reportedById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "staffNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EftPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardPayment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayRef" TEXT NOT NULL,
    "status" "CardPaymentStatus" NOT NULL DEFAULT 'STARTED',
    "startedById" TEXT NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "openedById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "conversationId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorKind" "MessageAuthor" NOT NULL,
    "authorUserId" TEXT,
    "authorLabel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "handedOverAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AssistantRole" NOT NULL,
    "text" TEXT NOT NULL,
    "toolTrace" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantAction" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "status" "AssistantActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubClient" (
    "id" SERIAL NOT NULL,
    "companyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "address1" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "taxId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StubClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubProduct" (
    "id" SERIAL NOT NULL,
    "gid" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pricing" JSONB NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StubProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubOrder" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "invoiceId" INTEGER,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StubOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubService" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "name" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "domain" TEXT,
    "status" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "recurringMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL DEFAULT 'Monthly',
    "regDate" DATE NOT NULL,
    "nextDueDate" DATE NOT NULL,
    "details" JSONB,
    "suspendReason" TEXT,

    CONSTRAINT "StubService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubInvoice" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "invoiceNum" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "datePaid" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotal" BIGINT NOT NULL,
    "taxRateBps" INTEGER NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "StubInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubInvoiceItem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "relId" INTEGER,
    "description" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "taxed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StubInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubTransaction" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "gateway" TEXT NOT NULL,
    "transId" TEXT NOT NULL,
    "amountIn" BIGINT NOT NULL,
    "amountOut" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "StubTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubPayMethod" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cardType" TEXT,
    "lastFour" TEXT,
    "expiryDate" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StubPayMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubDomain" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "registrar" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "regDate" DATE NOT NULL,
    "expiryDate" DATE NOT NULL,
    "nextDueDate" DATE NOT NULL,
    "recurringMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "registrationYears" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "StubDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StubTldPrice" (
    "tld" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "register" BIGINT NOT NULL,
    "renew" BIGINT NOT NULL,
    "transfer" BIGINT NOT NULL,
    "takenNames" TEXT[],

    CONSTRAINT "StubTldPrice_pkey" PRIMARY KEY ("tld")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCode_codeHash_key" ON "RecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");

-- CreateIndex
CREATE INDEX "SignInEvent_userId_createdAt_idx" ON "SignInEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organisationId_userId_key" ON "Membership"("organisationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organisationId_idx" ON "Invitation"("organisationId");

-- CreateIndex
CREATE INDEX "AuditEvent_organisationId_createdAt_idx" ON "AuditEvent"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffAuditEvent_createdAt_idx" ON "StaffAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "OutboundEmail_status_nextAttemptAt_idx" ON "OutboundEmail"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_organisationId_key" ON "BillingAccount"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_provider_externalClientId_key" ON "BillingAccount"("provider", "externalClientId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePoNumber_organisationId_invoiceId_key" ON "InvoicePoNumber"("organisationId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_month_base_quote_key" ON "FxRate"("month", "base", "quote");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPrice_productId_month_currency_key" ON "MonthlyPrice"("productId", "month", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE INDEX "Order_organisationId_createdAt_idx" ON "Order"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "ProvisioningTask_status_expectedBy_idx" ON "ProvisioningTask"("status", "expectedBy");

-- CreateIndex
CREATE INDEX "ProvisioningTask_organisationId_idx" ON "ProvisioningTask"("organisationId");

-- CreateIndex
CREATE INDEX "EftPayment_status_createdAt_idx" ON "EftPayment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EftPayment_organisationId_idx" ON "EftPayment"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "CardPayment_gatewayRef_key" ON "CardPayment"("gatewayRef");

-- CreateIndex
CREATE INDEX "CardPayment_organisationId_idx" ON "CardPayment"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_reference_key" ON "Ticket"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_conversationId_key" ON "Ticket"("conversationId");

-- CreateIndex
CREATE INDEX "Ticket_organisationId_updatedAt_idx" ON "Ticket"("organisationId", "updatedAt");

-- CreateIndex
CREATE INDEX "Ticket_status_updatedAt_idx" ON "Ticket"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantConversation_organisationId_userId_updatedAt_idx" ON "AssistantConversation"("organisationId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_conversationId_createdAt_idx" ON "AssistantMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantAction_conversationId_idx" ON "AssistantAction"("conversationId");

-- CreateIndex
CREATE INDEX "StubService_clientId_idx" ON "StubService"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "StubInvoice_invoiceNum_key" ON "StubInvoice"("invoiceNum");

-- CreateIndex
CREATE INDEX "StubInvoice_clientId_date_idx" ON "StubInvoice"("clientId", "date");

-- CreateIndex
CREATE INDEX "StubTransaction_clientId_date_idx" ON "StubTransaction"("clientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StubDomain_domain_key" ON "StubDomain"("domain");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignInEvent" ADD CONSTRAINT "SignInEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePoNumber" ADD CONSTRAINT "InvoicePoNumber_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryKey_fkey" FOREIGN KEY ("categoryKey") REFERENCES "ProductCategory"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPrice" ADD CONSTRAINT "MonthlyPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingChange" ADD CONSTRAINT "PricingChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningTask" ADD CONSTRAINT "ProvisioningTask_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningTask" ADD CONSTRAINT "ProvisioningTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningTask" ADD CONSTRAINT "ProvisioningTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningTask" ADD CONSTRAINT "ProvisioningTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EftPayment" ADD CONSTRAINT "EftPayment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EftPayment" ADD CONSTRAINT "EftPayment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPayment" ADD CONSTRAINT "CardPayment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantAction" ADD CONSTRAINT "AssistantAction_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantAction" ADD CONSTRAINT "AssistantAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StubOrder" ADD CONSTRAINT "StubOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "StubClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StubService" ADD CONSTRAINT "StubService_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "StubClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StubInvoice" ADD CONSTRAINT "StubInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "StubClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StubInvoiceItem" ADD CONSTRAINT "StubInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "StubInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StubTransaction" ADD CONSTRAINT "StubTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "StubClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StubPayMethod" ADD CONSTRAINT "StubPayMethod_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "StubClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StubDomain" ADD CONSTRAINT "StubDomain_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "StubClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- ─── Integrity guarantees enforced by the database ──────────────────

-- The audit logs are append-only: not even the application can edit or
-- remove what staff and customers did.
CREATE FUNCTION console_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: this table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_append_only"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION console_forbid_change();

CREATE TRIGGER "StaffAuditEvent_append_only"
  BEFORE UPDATE OR DELETE ON "StaffAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION console_forbid_change();

-- TRUNCATE skips row triggers, so block it separately.
CREATE TRIGGER "AuditEvent_no_truncate"
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION console_forbid_change();

CREATE TRIGGER "StaffAuditEvent_no_truncate"
  BEFORE TRUNCATE ON "StaffAuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION console_forbid_change();

-- Money is never negative where it can't be.
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_check" CHECK ("unitPriceMinor" >= 0 AND "monthlyTotalMinor" >= 0 AND "quantity" > 0);
ALTER TABLE "EftPayment" ADD CONSTRAINT "EftPayment_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "CardPayment" ADD CONSTRAINT "CardPayment_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "MonthlyPrice" ADD CONSTRAINT "MonthlyPrice_amount_check" CHECK ("amountMinor" >= 0);
