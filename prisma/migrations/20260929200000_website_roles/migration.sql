-- CreateEnum
CREATE TYPE "WebsiteRole" AS ENUM ('EDITOR', 'PUBLISHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "websiteRole" "WebsiteRole";

-- The website editor (Payload) keeps its tables in their own schema, with its own migrations.
CREATE SCHEMA IF NOT EXISTS "cms";
