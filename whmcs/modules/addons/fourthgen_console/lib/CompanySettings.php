<?php

namespace FourthGen\ConsoleSync;

/**
 * Everything the company push may touch in WHMCS: a fixed list of general
 * settings, a fixed list of email templates, the addon's own settings
 * (company details, bank details and logo for the invoice PDF), and the
 * Openprovider registrar module's settings. Nothing else is reachable.
 * WhmcsSettings is the real one; the tests use an in-memory one.
 */
interface CompanySettings
{
    /** The value of a tblconfiguration setting, or null when unset. */
    public function setting(string $name): ?string;

    public function setSetting(string $name, string $value): void;

    /** Whether templates/{name} exists, so WHMCS can use it as its theme. */
    public function themeExists(string $name): bool;

    /** ['subject', 'message'] of an email template, or null when WHMCS has none by that name. */
    public function emailTemplate(string $name): ?array;

    public function setEmailTemplate(string $name, string $subject, string $message): void;

    /** One of the addon's own stored values, or null. */
    public function addonValue(string $key): ?string;

    public function setAddonValue(string $key, string $value): void;

    /** The setting names a registrar module asks for, or null when it isn't installed. */
    public function registrarFields(string $module): ?array;

    /** The registrar module's current settings, decrypted. */
    public function registrarSettings(string $module): array;

    /** Saves the registrar module's settings, encrypted as WHMCS keeps them. */
    public function setRegistrarSettings(string $module, array $settings): void;

    /** Runs $work in one database transaction; rolls it back when $commit is false. */
    public function transaction(callable $work, bool $commit);
}
