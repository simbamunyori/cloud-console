<?php

/**
 * Fourth Generation Console Sync: lets the Cloud Console keep WHMCS's
 * product groups, products and prices the same as its approved price
 * books, so nobody sets them up by hand. The endpoint is sync.php; this
 * file only registers the addon, creates its two tables, and shows recent
 * syncs to administrators.
 */

use FourthGen\ConsoleSync\WhmcsCatalogue;
use WHMCS\Database\Capsule;

if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

require_once __DIR__ . '/lib/Guard.php';
require_once __DIR__ . '/lib/Catalogue.php';
require_once __DIR__ . '/lib/SyncHandler.php';
require_once __DIR__ . '/lib/WhmcsCatalogue.php';

function fourthgen_console_config()
{
    return [
        'name' => 'Fourth Generation Console Sync',
        'description' => 'Keeps product groups, products and prices the same as the Cloud Console\'s approved price books. It can change nothing else.',
        'author' => 'Fourth Generation Technologies',
        'language' => 'english',
        'version' => '1.0.0',
        'fields' => [
            'shared_secret' => [
                'FriendlyName' => 'Shared secret',
                'Type' => 'password',
                'Size' => '70',
                'Description' => 'The same value as WHMCS_SYNC_SECRET in the console. At least 32 characters, e.g. from openssl rand -hex 32.',
            ],
            'allowed_ips' => [
                'FriendlyName' => 'Allowed IPs',
                'Type' => 'textarea',
                'Rows' => '4',
                'Cols' => '50',
                'Description' => 'Addresses or ranges (203.0.113.0/24) allowed to call the sync, one per line. Empty allows nobody.',
            ],
        ],
    ];
}

function fourthgen_console_activate()
{
    try {
        if (!Capsule::schema()->hasTable(WhmcsCatalogue::NONCE_TABLE)) {
            Capsule::schema()->create(WhmcsCatalogue::NONCE_TABLE, function ($table) {
                $table->string('request_id', 64)->primary();
                $table->integer('seen_at')->index();
            });
        }
        if (!Capsule::schema()->hasTable(WhmcsCatalogue::SYNC_TABLE)) {
            Capsule::schema()->create(WhmcsCatalogue::SYNC_TABLE, function ($table) {
                $table->increments('id');
                $table->dateTime('synced_at')->index();
                $table->string('ip', 45);
                $table->string('request_id', 64);
                $table->string('summary', 255);
            });
        }
        return ['status' => 'success', 'description' => 'Activated. Set the shared secret and allowed IPs under Configure.'];
    } catch (\Throwable $e) {
        return ['status' => 'error', 'description' => 'Could not create the addon\'s tables: ' . $e->getMessage()];
    }
}

/** Keeps both tables: the sync history stays for the record. */
function fourthgen_console_deactivate()
{
    return ['status' => 'success', 'description' => 'Deactivated. The sync endpoint now refuses every request.'];
}

function fourthgen_console_output($vars)
{
    $secretSet = strlen((string) ($vars['shared_secret'] ?? '')) > 0;
    $ips = array_filter(array_map('trim', preg_split('/[\r\n,]+/', (string) ($vars['allowed_ips'] ?? ''))));
    $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES);

    echo '<p>The Cloud Console calls <code>' . $e(rtrim((string) \App::getSystemURL(), '/') . '/modules/addons/fourthgen_console/sync.php') . '</code> to keep products and prices the same as its price books. Change prices in the console; changes made here are replaced on the next sync.</p>';
    echo '<ul>';
    echo '<li>Shared secret: ' . ($secretSet ? 'set' : '<strong>not set, so every request is refused</strong>') . '</li>';
    echo '<li>Allowed IPs: ' . ($ips ? $e(implode(', ', $ips)) : '<strong>none, so every request is refused</strong>') . '</li>';
    echo '</ul>';

    $rows = Capsule::table(WhmcsCatalogue::SYNC_TABLE)->orderBy('id', 'desc')->limit(20)->get();
    echo '<h3>Last 20 syncs</h3>';
    if (!count($rows)) {
        echo '<p>None yet.</p>';
        return;
    }
    echo '<table class="table table-condensed"><tr><th>When</th><th>From</th><th>What changed</th></tr>';
    foreach ($rows as $row) {
        echo '<tr><td>' . $e($row->synced_at) . '</td><td>' . $e($row->ip) . '</td><td>' . $e($row->summary) . '</td></tr>';
    }
    echo '</table><p>Each change is also in the Activity Log, in lines starting "Console sync:".</p>';
}
