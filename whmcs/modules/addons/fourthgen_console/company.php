<?php

/**
 * The Cloud Console's company push endpoint: Admin > Company's details,
 * logo, bank details and invoice emails into WHMCS. What it may change,
 * and who may call it, is in lib/CompanyHandler.php and lib/Guard.php; see
 * docs/whmcs-setup.md, section 10.
 */

use FourthGen\ConsoleSync\CompanyHandler;
use FourthGen\ConsoleSync\WhmcsCatalogue;
use FourthGen\ConsoleSync\WhmcsSettings;
use WHMCS\Database\Capsule;

require __DIR__ . '/../../../init.php';
require_once __DIR__ . '/lib/Guard.php';
require_once __DIR__ . '/lib/Catalogue.php';
require_once __DIR__ . '/lib/SyncHandler.php';
require_once __DIR__ . '/lib/WhmcsCatalogue.php';
require_once __DIR__ . '/lib/CompanySettings.php';
require_once __DIR__ . '/lib/CompanyHandler.php';
require_once __DIR__ . '/lib/WhmcsSettings.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

$settings = Capsule::table('tbladdonmodules')->where('module', 'fourthgen_console')->pluck('value', 'setting');
if (!isset($settings['version'])) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'not found']);
    exit;
}

$secret = (string) ($settings['shared_secret'] ?? '');
if (function_exists('decrypt') && $secret !== '' && !preg_match('/^[a-f0-9]{32,}$/i', $secret)) {
    $secret = decrypt($secret);
}

$ip = method_exists('\\WHMCS\\Utility\\Environment\\CurrentRequest', 'getIP') ? \WHMCS\Utility\Environment\CurrentRequest::getIP() : ($_SERVER['REMOTE_ADDR'] ?? '');

$headers = [];
foreach ($_SERVER as $key => $value) {
    if (str_starts_with($key, 'HTTP_X_CONSOLE_')) {
        $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
    }
}

$handler = new CompanyHandler(new WhmcsSettings(realpath(__DIR__ . '/../../..')), new WhmcsCatalogue(), $secret, (string) ($settings['allowed_ips'] ?? ''));
[$status, $answer] = $handler->handle($_SERVER['REQUEST_METHOD'] ?? 'GET', $headers, (string) file_get_contents('php://input', false, null, 0, 2097153), (string) $ip, time());

http_response_code($status);
echo json_encode($answer);
