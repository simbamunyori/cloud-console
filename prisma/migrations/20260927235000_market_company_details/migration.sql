-- Company details for the invoice "From" block, and a switch for "our own data centre" copy.
-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "companyRegistrationNumber" TEXT,
ADD COLUMN     "ownDataCentre" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "registeredAddress" TEXT;


-- Botswana: the registered company.
UPDATE "Market" SET "companyRegistrationNumber" = 'BW00001816431', "registeredAddress" = 'Plot 11662/A, Mogoditshane, Botswana' WHERE "code" = 'bw';

-- No page claims our own data centre until colocation is live.
UPDATE "ProductCategory" SET "description" = 'Managed servers, monitored and backed up.' WHERE "key" = 'servers' AND "description" = 'Managed servers in our own data centre.';
UPDATE "Product" SET "excludes" = array_replace("excludes", 'Servers outside our data centre (ask us)', 'Servers we don''t manage (ask us)');
