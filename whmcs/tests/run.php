<?php

/**
 * Tests for the WHMCS sync addon, without WHMCS: signatures, the time
 * window, replays, the IP allowlist, what an operation may contain, and
 * what gets changed and logged. Run with `php whmcs/tests/run.php`
 * (CI does). Exits non-zero on the first failure.
 */

declare(strict_types=1);

require __DIR__ . '/../modules/addons/fourthgen_console/lib/Guard.php';
require __DIR__ . '/../modules/addons/fourthgen_console/lib/Catalogue.php';
require __DIR__ . '/../modules/addons/fourthgen_console/lib/SyncHandler.php';

use FourthGen\ConsoleSync\Catalogue;
use FourthGen\ConsoleSync\Guard;
use FourthGen\ConsoleSync\Journal;
use FourthGen\ConsoleSync\SyncHandler;

final class MemoryCatalogue implements Catalogue, Journal
{
    public array $groups = ['5' => ['id' => '5', 'name' => 'Servers', 'headline' => '', 'hidden' => false]];
    public array $products = [];
    public array $productPrices = [];
    public array $options = [];
    public array $optionPrices = [];
    public array $nonces = [];
    public array $activity = [];
    public array $syncs = [];
    public bool $failInside = false;
    private int $next = 100;

    public function currencies(): array { return ['BWP' => '1', 'ZAR' => '2', 'USD' => '3']; }
    public function findGroup(string $id): ?array { return $this->groups[$id] ?? null; }
    public function createGroup(string $name, string $headline, bool $hidden): string
    {
        $id = (string) $this->next++;
        $this->groups[$id] = compact('id', 'name', 'headline', 'hidden');
        return $id;
    }
    public function updateGroup(string $id, array $fields): void { $this->groups[$id] = $fields + $this->groups[$id]; }
    public function findProduct(string $id): ?array { return $this->products[$id] ?? null; }
    public function createProduct(string $group, string $name, string $description, bool $hidden): string
    {
        if ($this->failInside) {
            throw new RuntimeException('database went away');
        }
        $id = (string) $this->next++;
        $this->products[$id] = compact('id', 'group', 'name', 'description', 'hidden');
        return $id;
    }
    public function updateProduct(string $id, array $fields): void { $this->products[$id] = $fields + $this->products[$id]; }
    public function productPrices(string $productId): array { return $this->productPrices[$productId] ?? []; }
    public function setProductPrice(string $productId, string $currencyId, string $monthly): void
    {
        $this->productPrices[$productId][array_search($currencyId, $this->currencies(), true)] = $monthly;
    }
    public function quantityOption(string $productId): ?array { return $this->options[$productId] ?? null; }
    public function createQuantityOption(string $productId): array
    {
        return $this->options[$productId] = ['option' => (string) $this->next++, 'choice' => (string) $this->next++];
    }
    public function optionPrices(string $choiceId): array { return $this->optionPrices[$choiceId] ?? []; }
    public function setOptionPrice(string $choiceId, string $currencyId, string $monthly): void
    {
        $this->optionPrices[$choiceId][array_search($currencyId, $this->currencies(), true)] = $monthly;
    }
    public function transaction(callable $work, bool $commit)
    {
        $before = [$this->groups, $this->products, $this->productPrices, $this->options, $this->optionPrices, $this->next];
        try {
            $result = $work();
        } catch (Throwable $e) {
            [$this->groups, $this->products, $this->productPrices, $this->options, $this->optionPrices, $this->next] = $before;
            throw $e;
        }
        if (!$commit) {
            [$this->groups, $this->products, $this->productPrices, $this->options, $this->optionPrices, $this->next] = $before;
        }
        return $result;
    }
    public function seenBefore(string $requestId, int $now): bool
    {
        if (isset($this->nonces[$requestId])) {
            return true;
        }
        $this->nonces[$requestId] = $now;
        return false;
    }
    public function activity(string $message): void { $this->activity[] = $message; }
    public function recordSync(string $ip, string $requestId, string $summary): void { $this->syncs[] = compact('ip', 'requestId', 'summary'); }
}

const SECRET = 'a3f1c9e07b5d4a2e8f6b1c3d5e7f9a0b2c4d6e8f0a1b3c5d7e9f1a2b4c6d8e0f';
const NOW = 1790000000;
const IP = '198.51.100.7';

$failures = 0;
$count = 0;
function check(string $name, bool $ok, string $detail = ''): void
{
    global $failures, $count;
    $count++;
    if ($ok) {
        echo "  ok  {$name}\n";
        return;
    }
    $failures++;
    echo "  FAIL {$name}" . ($detail !== '' ? ": {$detail}" : '') . "\n";
}

function headers(string $body, array $over = [], string $secret = SECRET): array
{
    $timestamp = (string) ($over['timestamp'] ?? NOW);
    $id = $over['id'] ?? bin2hex(random_bytes(16));
    return [
        'X-Console-Timestamp' => $timestamp,
        'X-Console-Request-Id' => $id,
        'X-Console-Signature' => $over['signature'] ?? Guard::sign($secret, $timestamp, $id, $body),
    ];
}

function handler(?MemoryCatalogue $c = null, string $ips = IP): array
{
    $c ??= new MemoryCatalogue();
    return [new SyncHandler($c, $c, SECRET, $ips), $c];
}

function body(array $operations, bool $dryRun = false): string
{
    return json_encode(['dryRun' => $dryRun, 'operations' => $operations]);
}

$m365 = ['op' => 'group', 'ref' => 'category:productivity', 'id' => null, 'name' => 'Productivity', 'headline' => 'Email and Office', 'hidden' => false];
$standard = ['op' => 'product', 'ref' => 'product:m365-standard', 'id' => null, 'group' => '@category:productivity', 'name' => 'Microsoft 365 Business Standard', 'description' => 'Per user, per month.', 'hidden' => false, 'perUser' => true, 'prices' => ['BWP' => '190.00', 'USD' => '12.50']];
$vps = ['op' => 'product', 'ref' => 'product:vps-medium', 'id' => null, 'group' => '5', 'name' => 'Managed VPS, medium', 'description' => '', 'hidden' => false, 'perUser' => false, 'prices' => ['BWP' => '850.00']];

echo "Signatures\n";
[$h] = handler();
$b = body([$vps]);
check('a correctly signed request is accepted', $h->handle('POST', headers($b), $b, IP, NOW)[0] === 200);

[$h, $c] = handler();
[$status] = $h->handle('POST', headers($b, [], str_repeat('0', 64)), $b, IP, NOW);
check('a request signed with another secret is refused', $status === 401);
check('the refusal is in the activity log', str_contains($c->activity[0] ?? '', 'Console sync: refused a request from 198.51.100.7: the signature does not match'));
check('nothing was changed', $c->products === []);

[$h] = handler();
$signed = headers($b);
$tampered = str_replace('850.00', '1.00', $b);
check('a changed body is refused', $h->handle('POST', $signed, $tampered, IP, NOW)[0] === 401);

[$h] = handler();
check('a missing signature is refused', $h->handle('POST', array_diff_key(headers($b), ['X-Console-Signature' => 1]), $b, IP, NOW)[0] === 401);
check('a malformed signature is refused', $h->handle('POST', headers($b, ['signature' => 'v1=zz']), $b, IP, NOW)[0] === 401);
check('a signature over another timestamp is refused', $h->handle('POST', array_merge(headers($b), ['X-Console-Timestamp' => (string) (NOW - 1)]), $b, IP, NOW)[0] === 401);
check('a bad request id is refused', $h->handle('POST', headers($b, ['id' => 'not-hex!']), $b, IP, NOW)[0] === 401);
check('header names are matched in any case', $h->handle('POST', array_change_key_case(headers($b), CASE_LOWER), $b, IP, NOW)[0] === 200);

$short = new MemoryCatalogue();
$shortHandler = new SyncHandler($short, $short, 'too-short', IP);
check('a shared secret under 32 characters refuses everything', $shortHandler->handle('POST', headers($b, [], 'too-short'), $b, IP, NOW)[0] === 401);
$none = new SyncHandler($short, $short, '', IP);
check('an unset shared secret refuses everything', $none->handle('POST', headers($b, [], ''), $b, IP, NOW)[0] === 401);

echo "Time window\n";
[$h] = handler();
check('4 minutes 59 seconds old is accepted', $h->handle('POST', headers($b, ['timestamp' => NOW - 299]), $b, IP, NOW)[0] === 200);
[$h, $c] = handler();
[$status, $answer] = $h->handle('POST', headers($b, ['timestamp' => NOW - 301]), $b, IP, NOW);
check('older than 5 minutes is refused', $status === 401 && str_contains($answer['error'], '5 minutes'));
check('more than 5 minutes in the future is refused', $h->handle('POST', headers($b, ['timestamp' => NOW + 301]), $b, IP, NOW)[0] === 401);

echo "Replays\n";
[$h, $c] = handler();
$once = headers($b);
check('the first use of a request id is accepted', $h->handle('POST', $once, $b, IP, NOW)[0] === 200);
[$status, $answer] = $h->handle('POST', $once, $b, IP, NOW + 10);
check('the identical request sent again is refused', $status === 409 && str_contains($answer['error'], 'replay'));
check('the replay is in the activity log', str_contains(end($c->activity), 'a replay'));
check('the replay changed nothing', count($c->products) === 1 && count($c->syncs) === 1);
$resigned = headers($b, ['id' => $once['X-Console-Request-Id'], 'timestamp' => NOW + 20]);
check('a request id reused with a fresh signature is still refused', $h->handle('POST', $resigned, $b, IP, NOW + 20)[0] === 409);
[$h, $c] = handler();
$bad = headers($b, ['signature' => 'v1=' . str_repeat('0', 64)]);
$h->handle('POST', $bad, $b, IP, NOW);
check('a badly signed request does not use up its request id', $c->nonces === []);

echo "Allowed addresses\n";
[$h] = handler(null, "203.0.113.0/24\n2001:db8::/32 # office");
check('an address inside an allowed range is accepted', $h->handle('POST', headers($b), $b, '203.0.113.99', NOW)[0] === 200);
check('an IPv6 address inside an allowed range is accepted', $h->handle('POST', headers($b), $b, '2001:db8:1::5', NOW)[0] === 200);
[$status] = $h->handle('POST', headers($b), $b, '203.0.114.1', NOW);
check('an address outside the ranges is refused, even when signed', $status === 403);
[$h] = handler(null, '');
check('an empty list allows nobody', $h->handle('POST', headers($b), $b, IP, NOW)[0] === 403);
check('Guard: exact address', Guard::ipAllowed('198.51.100.7', '198.51.100.7'));
check('Guard: /32 range', Guard::ipAllowed('198.51.100.7', '198.51.100.7/32'));
check('Guard: /23 range edge', Guard::ipAllowed('10.0.1.255', '10.0.0.0/23') && !Guard::ipAllowed('10.0.2.0', '10.0.0.0/23'));
check('Guard: IPv4 never matches an IPv6 range', !Guard::ipAllowed('198.51.100.7', '::/0'));
check('Guard: nonsense entries are ignored', !Guard::ipAllowed('198.51.100.7', "nonsense\n198.51.100.0/99"));
check('Guard: an unreadable caller address is refused', !Guard::ipAllowed('', '0.0.0.0/0'));

echo "What a request may contain\n";
[$h, $c] = handler();
$refused = function (array $request, string $expect) use ($h) {
    $raw = json_encode($request);
    [$status, $answer] = $h->handle('POST', headers($raw), $raw, IP, NOW);
    return $status === 400 && str_contains($answer['error'] ?? '', $expect);
};
check('GET is refused', $h->handle('GET', headers(''), '', IP, NOW)[0] === 405);
check('an unknown operation is refused', $refused(['operations' => [['op' => 'client', 'ref' => 'x']]], 'op must be group or product'));
check('an unknown field is refused (e.g. a module or a setup fee)', $refused(['operations' => [$vps + ['module' => 'cpanel']]], 'unknown field module'));
check('an unknown top-level field is refused', $refused(['operations' => [$vps], 'sql' => 'DROP'], 'unknown field sql'));
check('a currency WHMCS lacks is refused', $refused(['operations' => [array_merge($vps, ['prices' => ['EUR' => '1.00']])]], 'currency EUR'));
check('a price that is not an amount is refused', $refused(['operations' => [array_merge($vps, ['prices' => ['BWP' => '-5']])]], 'must look like 190.00'));
check('a float price is refused', $refused(['operations' => [array_merge($vps, ['prices' => ['BWP' => 850.0]])]], 'must look like 190.00'));
check('a group ref not earlier in the request is refused', $refused(['operations' => [$standard]], 'group must be'));
check('a repeated ref is refused', $refused(['operations' => [$vps, $vps]], 'used twice'));
check('prices as a list are refused', $refused(['operations' => [array_merge($vps, ['prices' => ['850.00']])]], 'prices must map'));
check('an empty list is refused', $refused(['operations' => []], 'operations must be'));
check('an id that is not a WHMCS id is refused', $refused(['operations' => [array_merge($vps, ['id' => '1 OR 1=1'])]], 'id must be'));
check('a name that is too long is refused', $refused(['operations' => [array_merge($vps, ['name' => str_repeat('x', 256)])]], 'name must be'));
check('nothing was changed by any of them', $c->products === [] && $c->syncs === []);
$bigBody = str_repeat(' ', Guard::MAX_BODY_BYTES + 1);
check('a body over 1 MB is refused', $h->handle('POST', headers($bigBody), $bigBody, IP, NOW)[0] === 413);

echo "Changes\n";
[$h, $c] = handler();
$b = body([$m365, $standard, $vps]);
[$status, $answer] = $h->handle('POST', headers($b), $b, IP, NOW);
check('a new group and products are created', $status === 200 && count($c->groups) === 2 && count($c->products) === 2);
$std = $answer['results'][1];
check('the new product is in the new group', $c->products[$std['id']]['group'] === $answer['results'][0]['id']);
check('a per-user product costs 0.00 itself', $c->productPrices[$std['id']] === ['BWP' => '0.00', 'USD' => '0.00']);
$choice = $c->options[$std['id']]['choice'];
check('its Users option carries the price per user', $c->optionPrices[$choice] === ['BWP' => '190.00', 'USD' => '12.50']);
check('a product sold as one unit carries its own price', $c->productPrices[$answer['results'][2]['id']] === ['BWP' => '850.00']);
check('each change is in the activity log', count(array_filter($c->activity, fn ($l) => str_starts_with($l, 'Console sync: created'))) === 3);
check('the sync is listed on the addon page', $c->syncs[0]['summary'] === '3 of 3 items changed');

$update = [array_merge($m365, ['id' => $answer['results'][0]['id']]), array_merge($standard, ['id' => $std['id'], 'hidden' => true, 'prices' => ['BWP' => '199.00', 'USD' => '12.50']])];
$b = body($update);
[$status, $answer] = $h->handle('POST', headers($b), $b, IP, NOW + 60);
check('an update reports exactly what changed', $answer['results'][1]['changes'] === ['hidden', 'price per user BWP 190.00 to 199.00'], json_encode($answer['results'][1]['changes'] ?? null));
check('an unchanged group reports no change', $answer['results'][0]['changes'] === [] && !$answer['results'][0]['created']);
check('the update is in the activity log', end($c->activity) === "Console sync: updated product {$std['id']} (Microsoft 365 Business Standard): hidden; price per user BWP 190.00 to 199.00.");
check('the product is hidden and its price changed', $c->products[$std['id']]['hidden'] === true && $c->optionPrices[$choice]['BWP'] === '199.00');

echo "Dry runs and failures\n";
$before = serialize([$c->products, $c->productPrices, $c->optionPrices]);
$activityBefore = count($c->activity);
$b = body([array_merge($standard, ['id' => $std['id'], 'group' => $update[0]['id'], 'prices' => ['BWP' => '210.00']]), array_merge($vps, ['ref' => 'product:vps-large', 'name' => 'Managed VPS, large'])], true);
[$status, $answer] = $h->handle('POST', headers($b), $b, IP, NOW + 120);
check('a dry run reports the changes', $status === 200 && $answer['dryRun'] === true && $answer['results'][0]['changes'] === ['shown', 'price per user BWP 199.00 to 210.00'], json_encode($answer['results'][0]['changes'] ?? null));
check('a dry run gives no id for what it would create', $answer['results'][1]['created'] === true && $answer['results'][1]['id'] === null);
check('a dry run changes nothing and logs no change', serialize([$c->products, $c->productPrices, $c->optionPrices]) === $before && count($c->activity) === $activityBefore);

$b = body([array_merge($vps, ['id' => '999'])]);
[$status, $answer] = $h->handle('POST', headers($b), $b, IP, NOW + 180);
check('updating a product WHMCS no longer has is refused', $status === 409 && str_contains($answer['error'], 'product 999'));

$c->failInside = true;
$b = body([array_merge($vps, ['ref' => 'product:new-one']), array_merge($vps, ['ref' => 'product:other', 'id' => null])]);
$productsBefore = $c->products;
[$status, $answer] = $h->handle('POST', headers($b), $b, IP, NOW + 240);
check('a failure inside WHMCS changes nothing and says so', $status === 500 && $c->products === $productsBefore && str_contains($answer['error'], 'nothing was changed'));
check('the failure does not leak details', !str_contains(json_encode($answer), 'database went away'));

echo "Signature vector shared with the console's tests\n";
check('the console and the addon sign the same way', Guard::sign('test-secret-that-is-at-least-32-chars', '1790000000', '0123456789abcdef0123456789abcdef', '{"operations":[]}') === 'v1=5c4bedec0e12267fa5ba28250c754f2bca6cb87534c1e72fc8a29d893106708d');

echo "\n{$count} checks, {$failures} failed\n";
exit($failures ? 1 : 0);
