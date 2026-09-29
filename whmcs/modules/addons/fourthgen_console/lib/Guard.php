<?php

namespace FourthGen\ConsoleSync;

/**
 * Who may call the sync endpoint: a request signed with the shared secret,
 * made in the last 5 minutes, never seen before, from an allowed address.
 * Pure functions, so they are tested without WHMCS (whmcs/tests/run.php).
 */
final class Guard
{
    /** Requests older (or further in the future) than this are refused. */
    public const WINDOW_SECONDS = 300;

    /** The biggest request body accepted, in bytes. */
    public const MAX_BODY_BYTES = 1048576;

    /**
     * The signature the console sends in X-Console-Signature:
     * "v1=" and the hex HMAC-SHA256, keyed with the shared secret, of
     * "v1", the timestamp, the request id and the exact body, one per line.
     */
    public static function sign(string $secret, string $timestamp, string $requestId, string $body): string
    {
        return 'v1=' . hash_hmac('sha256', "v1\n{$timestamp}\n{$requestId}\n{$body}", $secret);
    }

    /**
     * Why the signature, timestamp or request id is unacceptable, or null
     * when they are fine. Replays are checked separately, after this.
     */
    public static function checkSignature(string $secret, array $headers, string $body, int $now): ?string
    {
        if (strlen($secret) < 32) {
            return 'the shared secret is not set, or is shorter than 32 characters';
        }
        $timestamp = (string) ($headers['x-console-timestamp'] ?? '');
        $requestId = (string) ($headers['x-console-request-id'] ?? '');
        $signature = (string) ($headers['x-console-signature'] ?? '');
        if (!preg_match('/^\d{10}$/', $timestamp)) {
            return 'no valid timestamp';
        }
        if (!preg_match('/^[a-f0-9]{32,64}$/', $requestId)) {
            return 'no valid request id';
        }
        if (abs($now - (int) $timestamp) > self::WINDOW_SECONDS) {
            return 'the timestamp is more than 5 minutes from now';
        }
        if (!hash_equals(self::sign($secret, $timestamp, $requestId, $body), $signature)) {
            return 'the signature does not match';
        }
        return null;
    }

    /**
     * Whether $ip is in the allowlist: one address or CIDR range per line
     * (IPv4 or IPv6), with anything after # ignored. An empty list allows
     * nobody.
     */
    public static function ipAllowed(string $ip, string $allowlist): bool
    {
        $address = @inet_pton(trim($ip));
        if ($address === false) {
            return false;
        }
        foreach (preg_split('/[\r\n,]+/', $allowlist) as $line) {
            $entry = trim(preg_replace('/#.*/', '', $line));
            if ($entry === '') {
                continue;
            }
            [$base, $bits] = array_pad(explode('/', $entry, 2), 2, null);
            $network = @inet_pton($base);
            if ($network === false || strlen($network) !== strlen($address)) {
                continue;
            }
            $size = strlen($network) * 8;
            $bits = $bits === null ? $size : (ctype_digit($bits) ? (int) $bits : -1);
            if ($bits < 0 || $bits > $size) {
                continue;
            }
            if (self::samePrefix($address, $network, $bits)) {
                return true;
            }
        }
        return false;
    }

    private static function samePrefix(string $a, string $b, int $bits): bool
    {
        $whole = intdiv($bits, 8);
        if (substr($a, 0, $whole) !== substr($b, 0, $whole)) {
            return false;
        }
        $rest = $bits % 8;
        if ($rest === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rest)) & 0xFF;
        return (ord($a[$whole]) & $mask) === (ord($b[$whole]) & $mask);
    }
}
