-- Change Request 01: "Botswana Copy" is now "Local data copy".
-- The billing product keeps its id. Issued invoice lines keep the name
-- they were issued with.
UPDATE "Product"
SET "slug" = 'local-data-copy',
    "name" = 'Local data copy',
    "summary" = 'A daily copy of your cloud data kept on our own servers, for organisations with data protection duties.'
WHERE "slug" = 'botswana-copy';

UPDATE "StubProduct" SET "name" = 'Local data copy' WHERE "name" = 'Botswana Copy';
UPDATE "StubService" SET "name" = 'Local data copy' WHERE "name" = 'Botswana Copy';
