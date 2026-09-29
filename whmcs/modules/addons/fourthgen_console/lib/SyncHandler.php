<?php

namespace FourthGen\ConsoleSync;

/** Remembers request ids and writes the WHMCS activity log. */
interface Journal
{
    /** Records the request id; true if it had been seen before (a replay). */
    public function seenBefore(string $requestId, int $now): bool;

    /** One line in the WHMCS activity log. */
    public function activity(string $message): void;

    /** One row in the addon's own list of syncs, shown on its admin page. */
    public function recordSync(string $ip, string $requestId, string $summary): void;
}

final class Refused extends \RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

/**
 * The sync endpoint's whole behaviour, independent of WHMCS: check who is
 * calling, then create or update product groups, products, and their
 * monthly prices per currency. A request is applied all or nothing, and a
 * dry run works everything out and then rolls it back.
 *
 * Request body (JSON):
 *   {"dryRun": false, "operations": [
 *     {"op": "group", "ref": "category:productivity", "id": null,
 *      "name": "Productivity", "headline": "...", "hidden": false},
 *     {"op": "product", "ref": "product:m365-standard", "id": "34",
 *      "group": "@category:productivity", "name": "...", "description": "...",
 *      "hidden": false, "perUser": true, "prices": {"BWP": "190.00"}}
 *   ]}
 * "group" is a WHMCS group id, or "@" and the ref of a group in the same
 * request. A per-user product costs 0.00 itself and its "Users" quantity
 * option carries the price per user.
 */
final class SyncHandler
{
    private const GROUP_KEYS = ['op', 'ref', 'id', 'name', 'headline', 'hidden'];
    private const PRODUCT_KEYS = ['op', 'ref', 'id', 'group', 'name', 'description', 'hidden', 'perUser', 'prices'];
    private const MAX_OPERATIONS = 500;

    public function __construct(
        private readonly Catalogue $catalogue,
        private readonly Journal $journal,
        private readonly string $secret,
        private readonly string $allowedIps,
    ) {
    }

    /** @return array{0:int,1:array} HTTP status and the JSON answer. */
    public function handle(string $method, array $headers, string $body, string $ip, int $now): array
    {
        $headers = array_change_key_case($headers, CASE_LOWER);
        try {
            if ($method !== 'POST') {
                throw new Refused(405, 'only POST is accepted');
            }
            if (!Guard::ipAllowed($ip, $this->allowedIps)) {
                throw new Refused(403, 'the address is not on the allowed list');
            }
            if (strlen($body) > Guard::MAX_BODY_BYTES) {
                throw new Refused(413, 'the request is too big');
            }
            $problem = Guard::checkSignature($this->secret, $headers, $body, $now);
            if ($problem !== null) {
                throw new Refused(401, $problem);
            }
            $requestId = $headers['x-console-request-id'];
            if ($this->journal->seenBefore($requestId, $now)) {
                throw new Refused(409, 'the request id has been used before (a replay)');
            }
            $request = json_decode($body, true);
            if (!is_array($request)) {
                throw new Refused(400, 'the body is not a JSON object');
            }
            $dryRun = $this->validate($request);
            $results = $this->catalogue->transaction(fn () => $this->apply($request['operations'], $dryRun), !$dryRun);
        } catch (Refused $e) {
            $this->journal->activity("Console sync: refused a request from {$ip}: {$e->getMessage()}.");
            return [$e->status, ['ok' => false, 'error' => $e->getMessage()]];
        } catch (\Throwable $e) {
            $this->journal->activity("Console sync: failed for a request from {$ip}: " . get_class($e) . '.');
            return [500, ['ok' => false, 'error' => 'the sync failed inside WHMCS; nothing was changed']];
        }

        if (!$dryRun) {
            $changed = array_filter($results, fn ($r) => $r['created'] || $r['changes']);
            foreach ($changed as $r) {
                $this->journal->activity('Console sync: ' . ($r['created'] ? 'created' : 'updated') . " {$r['kind']} {$r['id']} ({$r['name']})" . ($r['changes'] ? ': ' . implode('; ', $r['changes']) : '') . '.');
            }
            $this->journal->recordSync($ip, $requestId, count($changed) . ' of ' . count($results) . ' items changed');
        }
        return [200, ['ok' => true, 'dryRun' => $dryRun, 'results' => $results]];
    }

    /** Throws Refused(400) unless the request is exactly what the sync may do. Returns dryRun. */
    private function validate(array $request): bool
    {
        $unknown = array_diff(array_keys($request), ['operations', 'dryRun']);
        if ($unknown) {
            throw new Refused(400, 'unknown field ' . implode(', ', $unknown));
        }
        if (isset($request['dryRun']) && !is_bool($request['dryRun'])) {
            throw new Refused(400, 'dryRun must be true or false');
        }
        $operations = $request['operations'] ?? null;
        if (!is_array($operations) || !array_is_list($operations) || !$operations || count($operations) > self::MAX_OPERATIONS) {
            throw new Refused(400, 'operations must be a list of 1 to ' . self::MAX_OPERATIONS);
        }
        $currencies = $this->catalogue->currencies();
        $refs = [];
        foreach ($operations as $n => $op) {
            $where = "operation {$n}";
            if (!is_array($op) || !in_array($op['op'] ?? null, ['group', 'product'], true)) {
                throw new Refused(400, "{$where}: op must be group or product");
            }
            $allowed = $op['op'] === 'group' ? self::GROUP_KEYS : self::PRODUCT_KEYS;
            $unknown = array_diff(array_keys($op), $allowed);
            if ($unknown) {
                throw new Refused(400, "{$where}: unknown field " . implode(', ', $unknown));
            }
            $this->text($op, 'ref', 1, 100, $where);
            if (isset($refs[$op['ref']])) {
                throw new Refused(400, "{$where}: ref {$op['ref']} is used twice");
            }
            $refs[$op['ref']] = $op['op'];
            if (isset($op['id']) && !(is_string($op['id']) && preg_match('/^[1-9]\d{0,9}$/', $op['id']))) {
                throw new Refused(400, "{$where}: id must be a WHMCS id or null");
            }
            $this->text($op, 'name', 1, 255, $where);
            if (!is_bool($op['hidden'] ?? null)) {
                throw new Refused(400, "{$where}: hidden must be true or false");
            }
            if ($op['op'] === 'group') {
                $this->text($op, 'headline', 0, 255, $where);
                continue;
            }
            $this->text($op, 'description', 0, 10000, $where);
            if (!is_bool($op['perUser'] ?? null)) {
                throw new Refused(400, "{$where}: perUser must be true or false");
            }
            $group = $op['group'] ?? null;
            $groupRef = is_string($group) && str_starts_with($group, '@') ? substr($group, 1) : null;
            if (!is_string($group) || ($groupRef === null && !preg_match('/^[1-9]\d{0,9}$/', $group)) || ($groupRef !== null && ($refs[$groupRef] ?? null) !== 'group')) {
                throw new Refused(400, "{$where}: group must be a WHMCS group id, or @ and the ref of a group earlier in this request");
            }
            $prices = $op['prices'] ?? null;
            // Empty when a product is only being hidden: its prices stay as they are.
            if (!is_array($prices) || ($prices && array_is_list($prices))) {
                throw new Refused(400, "{$where}: prices must map currency codes to amounts");
            }
            foreach ($prices as $code => $amount) {
                if (!isset($currencies[$code])) {
                    throw new Refused(400, "{$where}: currency {$code} is not set up in WHMCS");
                }
                if (!is_string($amount) || !preg_match('/^\d{1,9}\.\d{2}$/', $amount)) {
                    throw new Refused(400, "{$where}: the {$code} price must look like 190.00");
                }
            }
        }
        return $request['dryRun'] ?? false;
    }

    private function text(array $op, string $key, int $min, int $max, string $where): void
    {
        $value = $op[$key] ?? null;
        if (!is_string($value) || mb_strlen($value) < $min || mb_strlen($value) > $max || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $value)) {
            throw new Refused(400, "{$where}: {$key} must be text of {$min} to {$max} characters");
        }
    }

    private function apply(array $operations, bool $dryRun): array
    {
        $currencies = $this->catalogue->currencies();
        $groupIds = [];
        $results = [];
        foreach ($operations as $op) {
            $result = $op['op'] === 'group' ? $this->applyGroup($op) : $this->applyProduct($op, $groupIds, $currencies);
            if ($op['op'] === 'group') {
                $groupIds[$op['ref']] = $result['id'];
            }
            $results[] = ['ref' => $op['ref'], 'kind' => $op['op'], 'id' => $dryRun && $result['created'] ? null : $result['id'], 'name' => $op['name'], 'created' => $result['created'], 'changes' => $result['changes']];
        }
        return $results;
    }

    private function applyGroup(array $op): array
    {
        $wanted = ['name' => $op['name'], 'headline' => $op['headline'], 'hidden' => $op['hidden']];
        if (empty($op['id'])) {
            return ['id' => $this->catalogue->createGroup($op['name'], $op['headline'], $op['hidden']), 'created' => true, 'changes' => []];
        }
        $current = $this->catalogue->findGroup($op['id']);
        if (!$current) {
            throw new Refused(409, "product group {$op['id']} ({$op['ref']}) is not in WHMCS");
        }
        $diff = $this->diff($current, $wanted);
        if ($diff) {
            $this->catalogue->updateGroup($op['id'], array_intersect_key($wanted, $diff));
        }
        return ['id' => $op['id'], 'created' => false, 'changes' => array_values($diff)];
    }

    private function applyProduct(array $op, array $groupIds, array $currencies): array
    {
        $group = str_starts_with($op['group'], '@') ? $groupIds[substr($op['group'], 1)] : $op['group'];
        if (!str_starts_with($op['group'], '@') && !$this->catalogue->findGroup($group)) {
            throw new Refused(409, "product group {$group} is not in WHMCS");
        }
        $wanted = ['group' => $group, 'name' => $op['name'], 'description' => $op['description'], 'hidden' => $op['hidden']];
        $created = empty($op['id']);
        $changes = [];
        if ($created) {
            $id = $this->catalogue->createProduct($group, $op['name'], $op['description'], $op['hidden']);
        } else {
            $id = $op['id'];
            $current = $this->catalogue->findProduct($id);
            if (!$current) {
                throw new Refused(409, "product {$id} ({$op['ref']}) is not in WHMCS");
            }
            $diff = $this->diff($current, $wanted);
            if ($diff) {
                $this->catalogue->updateProduct($id, array_intersect_key($wanted, $diff));
            }
            $changes = array_values($diff);
        }

        $productPrices = $this->catalogue->productPrices($id);
        $option = $op['perUser'] ? $this->catalogue->quantityOption($id) : null;
        if ($op['perUser'] && !$option) {
            $option = $this->catalogue->createQuantityOption($id);
            if (!$created) {
                $changes[] = 'added the Users quantity option';
            }
        }
        $optionPrices = $option ? $this->catalogue->optionPrices($option['choice']) : [];
        foreach ($op['prices'] as $code => $amount) {
            $productAmount = $op['perUser'] ? '0.00' : $amount;
            if (($productPrices[$code] ?? null) !== $productAmount) {
                $this->catalogue->setProductPrice($id, $currencies[$code], $productAmount);
                if (!$created) {
                    $changes[] = "price {$code} " . ($productPrices[$code] ?? 'none') . " to {$productAmount}";
                }
            }
            if ($op['perUser'] && ($optionPrices[$code] ?? null) !== $amount) {
                $this->catalogue->setOptionPrice($option['choice'], $currencies[$code], $amount);
                if (!$created) {
                    $changes[] = "price per user {$code} " . ($optionPrices[$code] ?? 'none') . " to {$amount}";
                }
            }
        }
        return ['id' => $id, 'created' => $created, 'changes' => $changes];
    }

    /** Field => description of each field that differs. */
    private function diff(array $current, array $wanted): array
    {
        $diff = [];
        foreach ($wanted as $field => $value) {
            $now = $current[$field] ?? null;
            if (is_bool($value) ? (bool) $now !== $value : (string) $now !== (string) $value) {
                $diff[$field] = is_bool($value) ? ($value ? 'hidden' : 'shown') : ($field === 'description' ? 'description' : "{$field} to {$value}");
            }
        }
        return $diff;
    }
}
