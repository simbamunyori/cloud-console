-- Local data copy isn't offered until our servers move to Botswana.
UPDATE "Product" SET "active" = false WHERE "slug" = 'local-data-copy';
