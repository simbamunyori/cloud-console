-- CreateTable
CREATE TABLE "WhmcsLink" (
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "whmcsId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhmcsLink_pkey" PRIMARY KEY ("kind","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhmcsLink_kind_whmcsId_key" ON "WhmcsLink"("kind", "whmcsId");

