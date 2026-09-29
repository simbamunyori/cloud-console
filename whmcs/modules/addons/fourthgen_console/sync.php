<?php

/**
 * The Cloud Console's price sync endpoint. Everything it may do, and who
 * may call it, is in lib/SyncHandler.php and lib/Guard.php; see
 * docs/whmcs-setup.md, section 6.
 */

use FourthGen\ConsoleSync\SyncHandler;
use FourthGen\ConsoleSync\WhmcsCatalogue;
use WHMCS\Database\Capsule;

require __DIR__ . '/../../../init.php';
require_once __DIR__ . '/lib/Guard.php';
require_once __DIR__ . '/lib/Catalogue.php';
require_once __DIR__ . '/lib/SyncHandler.php';
require_once __DIR__ . '/lib/WhmcsCatalogue.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

$settings = Capsule::table('tbladdonmodules')->where('module', 'fourthgen_console')->pluck('value', 'setting');
if (!isset($settings['version'])) {
    // The addon is not activated: answer nothing about it.
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'not found']);
    exit;
}

$secret = (string) ($settings['shared_secret'] ?? '');
if (function_exists('decrypt') && $secret !== '' && !preg_match('/^[a-f0-9]{32,}$/i', $secret)) {
    // The secret is hex (docs/whmcs-setup.md); anything else is WHMCS's encrypted copy of it.
    $secret = decrypt($secret);
}

// WHMCS's own idea of the caller's address honours its Trusted Proxies
// setting; without it, only the direct connection counts.
$ip = method_exists('\\WHMCS\\Utility\\Environment\\CurrentRequest', 'getIP') ? \WHMCS\Utility\Environment\CurrentRequest::getIP() : ($_SERVER['REMOTE_ADDR'] ?? '');

$headers = [];
foreach ($_SERVER as $key => $value) {
    if (str_starts_with($key, 'HTTP_X_CONSOLE_')) {
        $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
    }
}

$catalogue = new WhmcsCatalogue();
$handler = new SyncHandler($catalogue, $catalogue, $secret, (string) ($settings['allowed_ips'] ?? ''));
[$status, $answer] = $handler->handle($_SERVER['REQUEST_METHOD'] ?? 'GET', $headers, (string) file_get_contents('php://input', false, null, 0, 1048577), (string) $ip, time());

http_response_code($status);
echo json_encode($answer);
