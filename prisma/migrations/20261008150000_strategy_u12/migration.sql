-- CreateTable
CREATE TABLE "ConnectivityLicence" (
    "market" TEXT NOT NULL,
    "regulator" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "grantedOn" DATE NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectivityLicence_pkey" PRIMARY KEY ("market")
);

-- CreateTable
CREATE TABLE "ConnectivityRequest" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sites" JSONB NOT NULL,
    "speed" TEXT NOT NULL,
    "standby" BOOLEAN NOT NULL DEFAULT false,
    "cloudLink" BOOLEAN NOT NULL DEFAULT false,
    "managed" BOOLEAN NOT NULL DEFAULT false,
    "startBy" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectivityRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectivityRequest_quoteId_key" ON "ConnectivityRequest"("quoteId");

-- AddForeignKey
ALTER TABLE "ConnectivityLicence" ADD CONSTRAINT "ConnectivityLicence_market_fkey" FOREIGN KEY ("market") REFERENCES "Market"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectivityRequest" ADD CONSTRAINT "ConnectivityRequest_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

