-- The Connectivity family (Change Request 02): sold by quote, a draft with
-- no products, hidden everywhere until an Admin sets it live. A separate
-- migration, because a new enum value can't be used in the transaction
-- that adds it.
INSERT INTO "ProductFamily" ("key", "name", "description", "connector", "status", "fulfilment", "sortOrder", "updatedAt")
VALUES ('connectivity', 'Connectivity', 'Links between your sites and to the cloud, designed and priced for you.', 'CONNECTIVITY', 'DRAFT', 'QUOTE', 8, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
