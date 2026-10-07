-- CreateTable
CREATE TABLE "AccountContact" (
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountContact_pkey" PRIMARY KEY ("organisationId")
);

-- CreateTable
CREATE TABLE "StaffContactCard" (
    "userId" TEXT NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffContactCard_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WelcomeChecklist" (
    "organisationId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WelcomeChecklist_pkey" PRIMARY KEY ("organisationId")
);

-- CreateIndex
CREATE INDEX "AccountContact_userId_idx" ON "AccountContact"("userId");

-- AddForeignKey
ALTER TABLE "AccountContact" ADD CONSTRAINT "AccountContact_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountContact" ADD CONSTRAINT "AccountContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffContactCard" ADD CONSTRAINT "StaffContactCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomeChecklist" ADD CONSTRAINT "WelcomeChecklist_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

