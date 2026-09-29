<?php

namespace FourthGen\ConsoleSync;

/**
 * Everything the sync may touch in WHMCS: product groups, products, and the
 * per-currency monthly prices of products and of their "Users" quantity
 * option. Nothing else is reachable through this interface.
 * WhmcsCatalogue is the real one; the tests use an in-memory one.
 */
interface Catalogue
{
    /** Currency code => WHMCS currency id. */
    public function currencies(): array;

    /** ['id', 'name', 'headline', 'hidden'] or null. */
    public function findGroup(string $id): ?array;

    public function createGroup(string $name, string $headline, bool $hidden): string;

    /** $fields: any of 'name', 'headline', 'hidden'. */
    public function updateGroup(string $id, array $fields): void;

    /** ['id', 'group', 'name', 'description', 'hidden'] or null. */
    public function findProduct(string $id): ?array;

    public function createProduct(string $group, string $name, string $description, bool $hidden): string;

    /** $fields: any of 'group', 'name', 'description', 'hidden'. */
    public function updateProduct(string $id, array $fields): void;

    /** Currency code => monthly price ("190.00") for the product. */
    public function productPrices(string $productId): array;

    public function setProductPrice(string $productId, string $currencyId, string $monthly): void;

    /** ['option' => id, 'choice' => id] of the product's "Users" quantity option, or null. */
    public function quantityOption(string $productId): ?array;

    /** Creates the "Users" quantity option (WHMCS type 4) for one product. */
    public function createQuantityOption(string $productId): array;

    /** Currency code => monthly price per user. */
    public function optionPrices(string $choiceId): array;

    public function setOptionPrice(string $choiceId, string $currencyId, string $monthly): void;

    /** Runs $work in one database transaction; rolls it back when $commit is false. */
    public function transaction(callable $work, bool $commit);
}
