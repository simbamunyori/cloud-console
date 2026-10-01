-- CreateTable
CREATE TABLE "SiteRedirect" (
    "id" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdBy" TEXT,

    CONSTRAINT "SiteRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteRedirect_fromPath_key" ON "SiteRedirect"("fromPath");


-- The old website lived under /new/ (WordPress). Its two pages in search
-- results go to the new home page; anything else under /new/ does too, in code.
INSERT INTO "SiteRedirect" ("id", "fromPath", "toPath", "createdBy") VALUES
  ('redirect_old_home', '/new', '/', 'Milestone 10'),
  ('redirect_old_about', '/new/about', '/', 'Milestone 10');
