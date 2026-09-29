<?php

namespace FourthGen\ConsoleSync;

use WHMCS\Database\Capsule;

/**
 * The Catalogue and Journal on WHMCS's own database layer. Only the product
 * catalogue tables are written: tblproductgroups, tblproducts, tblpricing
 * (product and configoptions rows), and the four tables of the "Users"
 * quantity option. New products are made with WHMCS's own AddProduct
 * through localAPI, so WHMCS fills in every default itself.
 */
final class WhmcsCatalogue implements Catalogue, Journal
{
    public const NONCE_TABLE = 'mod_fourthgen_console_nonces';
    public const SYNC_TABLE = 'mod_fourthgen_console_syncs';
    public const QUANTITY_OPTION_NAME = 'Users';

    /** Cycles that are switched off for our monthly products. */
    private const OFF_CYCLES = ['quarterly', 'semiannually', 'annually', 'biennially', 'triennially'];
    private const SETUP_FEES = ['msetupfee', 'qsetupfee', 'ssetupfee', 'asetupfee', 'bsetupfee', 'tsetupfee'];

    public function currencies(): array
    {
        return Capsule::table('tblcurrencies')->pluck('id', 'code')->map(fn ($id) => (string) $id)->all();
    }

    public function findGroup(string $id): ?array
    {
        $g = Capsule::table('tblproductgroups')->where('id', $id)->first();
        return $g ? ['id' => (string) $g->id, 'name' => $g->name, 'headline' => (string) ($g->headline ?? ''), 'hidden' => (bool) $g->hidden] : null;
    }

    public function createGroup(string $name, string $headline, bool $hidden): string
    {
        $row = ['name' => $name, 'headline' => $headline, 'tagline' => '', 'orderfrmtpl' => '', 'disabledgateways' => '', 'hidden' => $hidden ? 1 : 0, 'order' => ((int) Capsule::table('tblproductgroups')->max('order')) + 1, 'slug' => $this->slug('tblproductgroups', $name), 'created_at' => date('Y-m-d H:i:s'), 'updated_at' => date('Y-m-d H:i:s')];
        return (string) Capsule::table('tblproductgroups')->insertGetId($this->existingColumns('tblproductgroups', $row));
    }

    public function updateGroup(string $id, array $fields): void
    {
        $row = [];
        foreach ($fields as $field => $value) {
            $row[$field] = $field === 'hidden' ? ($value ? 1 : 0) : $value;
        }
        Capsule::table('tblproductgroups')->where('id', $id)->update($this->existingColumns('tblproductgroups', $row + ['updated_at' => date('Y-m-d H:i:s')]));
    }

    public function findProduct(string $id): ?array
    {
        $p = Capsule::table('tblproducts')->where('id', $id)->first();
        return $p ? ['id' => (string) $p->id, 'group' => (string) $p->gid, 'name' => $p->name, 'description' => (string) $p->description, 'hidden' => (bool) $p->hidden] : null;
    }

    public function createProduct(string $group, string $name, string $description, bool $hidden): string
    {
        $answer = localAPI('AddProduct', ['name' => $name, 'gid' => $group, 'type' => 'other', 'paytype' => 'recurring', 'description' => $description, 'hidden' => $hidden]);
        if (($answer['result'] ?? '') !== 'success') {
            throw new \RuntimeException('AddProduct failed: ' . ($answer['message'] ?? 'no reason given'));
        }
        return (string) $answer['pid'];
    }

    public function updateProduct(string $id, array $fields): void
    {
        $columns = ['group' => 'gid', 'name' => 'name', 'description' => 'description', 'hidden' => 'hidden'];
        $row = [];
        foreach ($fields as $field => $value) {
            $row[$columns[$field]] = $field === 'hidden' ? ($value ? 1 : 0) : $value;
        }
        Capsule::table('tblproducts')->where('id', $id)->update($this->existingColumns('tblproducts', $row + ['updated_at' => date('Y-m-d H:i:s')]));
    }

    public function productPrices(string $productId): array
    {
        return $this->prices('product', $productId);
    }

    public function setProductPrice(string $productId, string $currencyId, string $monthly): void
    {
        $this->setPrice('product', $productId, $currencyId, $monthly, '-1.00');
    }

    public function quantityOption(string $productId): ?array
    {
        $option = Capsule::table('tblproductconfigoptions as o')
            ->join('tblproductconfiglinks as l', 'l.gid', '=', 'o.gid')
            ->where('l.pid', $productId)
            ->where('o.optionname', self::QUANTITY_OPTION_NAME)
            ->where('o.optiontype', 4)
            ->select('o.id')
            ->first();
        if (!$option) {
            return null;
        }
        $choice = Capsule::table('tblproductconfigoptionssub')->where('configid', $option->id)->orderBy('id')->first();
        return $choice ? ['option' => (string) $option->id, 'choice' => (string) $choice->id] : null;
    }

    public function createQuantityOption(string $productId): array
    {
        $product = Capsule::table('tblproducts')->where('id', $productId)->value('name');
        $group = Capsule::table('tblproductconfiggroups')->insertGetId(['name' => "{$product}: users", 'description' => 'Made by the Cloud Console sync. Change prices in the console, not here.']);
        Capsule::table('tblproductconfiglinks')->insert(['gid' => $group, 'pid' => $productId]);
        $option = Capsule::table('tblproductconfigoptions')->insertGetId(['gid' => $group, 'optionname' => self::QUANTITY_OPTION_NAME, 'optiontype' => 4, 'qtyminimum' => 1, 'qtymaximum' => 0, 'order' => 0, 'hidden' => 0]);
        $choice = Capsule::table('tblproductconfigoptionssub')->insertGetId(['configid' => $option, 'optionname' => 'User', 'sortorder' => 0, 'hidden' => 0]);
        return ['option' => (string) $option, 'choice' => (string) $choice];
    }

    public function optionPrices(string $choiceId): array
    {
        return $this->prices('configoptions', $choiceId);
    }

    public function setOptionPrice(string $choiceId, string $currencyId, string $monthly): void
    {
        // Configurable option prices use 0.00, not -1.00, for cycles not sold.
        $this->setPrice('configoptions', $choiceId, $currencyId, $monthly, '0.00');
    }

    public function transaction(callable $work, bool $commit)
    {
        $db = Capsule::connection();
        $db->beginTransaction();
        try {
            $result = $work();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        $commit ? $db->commit() : $db->rollBack();
        return $result;
    }

    // ─── Journal ────────────────────────────────────────────────────────

    public function seenBefore(string $requestId, int $now): bool
    {
        // Ids older than the signature window can't be replayed anyway.
        Capsule::table(self::NONCE_TABLE)->where('seen_at', '<', $now - 2 * Guard::WINDOW_SECONDS)->delete();
        try {
            Capsule::table(self::NONCE_TABLE)->insert(['request_id' => $requestId, 'seen_at' => $now]);
            return false;
        } catch (\Illuminate\Database\QueryException $e) {
            // The id is the primary key, so a second insert fails: a replay.
            return true;
        }
    }

    public function activity(string $message): void
    {
        logActivity($message);
    }

    public function recordSync(string $ip, string $requestId, string $summary): void
    {
        Capsule::table(self::SYNC_TABLE)->insert(['synced_at' => date('Y-m-d H:i:s'), 'ip' => $ip, 'request_id' => $requestId, 'summary' => $summary]);
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private function prices(string $type, string $relid): array
    {
        $rows = Capsule::table('tblpricing as p')->join('tblcurrencies as c', 'c.id', '=', 'p.currency')->where('p.type', $type)->where('p.relid', $relid)->select('c.code', 'p.monthly')->get();
        $prices = [];
        foreach ($rows as $row) {
            $prices[$row->code] = number_format((float) $row->monthly, 2, '.', '');
        }
        return $prices;
    }

    private function setPrice(string $type, string $relid, string $currencyId, string $monthly, string $off): void
    {
        $row = ['monthly' => $monthly];
        foreach (self::OFF_CYCLES as $cycle) {
            $row[$cycle] = $off;
        }
        foreach (self::SETUP_FEES as $fee) {
            $row[$fee] = '0.00';
        }
        $where = ['type' => $type, 'currency' => $currencyId, 'relid' => $relid];
        if (Capsule::table('tblpricing')->where($where)->exists()) {
            Capsule::table('tblpricing')->where($where)->update($row);
        } else {
            Capsule::table('tblpricing')->insert($where + $row);
        }
    }

    /** Keeps only the columns this WHMCS version has (slug and timestamps came later). */
    private function existingColumns(string $table, array $row): array
    {
        static $columns = [];
        $columns[$table] ??= array_flip(Capsule::schema()->getColumnListing($table));
        return array_intersect_key($row, $columns[$table]);
    }

    private function slug(string $table, string $name): string
    {
        $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)), '-') ?: 'group';
        $slug = $base;
        for ($n = 2; Capsule::schema()->hasColumn($table, 'slug') && Capsule::table($table)->where('slug', $slug)->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }
        return $slug;
    }
}
