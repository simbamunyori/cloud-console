-- Final build, Milestone 9: catalogue additions.

-- A quote request can be for a partner's work (enterprise, on-site
-- compliance projects go to NSMC); staff introduce the customer and close it.
ALTER TABLE "Quote" ADD COLUMN     "referTo" TEXT,
ADD COLUMN     "referredAt" TIMESTAMP(3);

-- Disaster recovery stays internal until its service description, recovery
-- targets and price are set. Only a server where nobody has ordered it yet
-- is changed; the new compliance archiving, signatures and website builder
-- products are added as drafts when the server next starts.
UPDATE "Product" SET "status" = 'INTERNAL', "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'disaster-recovery' AND "status" = 'LIVE'
  AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."productId" = "Product"."id");
