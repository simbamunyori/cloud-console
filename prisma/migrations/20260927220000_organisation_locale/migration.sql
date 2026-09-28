-- How amounts and dates are written for each customer, from their market.
ALTER TABLE "Organisation" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en-BW';

UPDATE "Organisation" o SET "locale" = m."locale" FROM "Market" m WHERE m."code" = o."billingMarket";
