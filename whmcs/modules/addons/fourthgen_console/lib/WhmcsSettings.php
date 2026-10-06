<?php

namespace FourthGen\ConsoleSync;

use WHMCS\Database\Capsule;

/**
 * CompanySettings on WHMCS's own database layer. Writes only
 * tblconfiguration (the names CompanyHandler::SETTINGS lists),
 * tblemailtemplates (the invoice emails it lists, in the default
 * language), the addon's mod_fourthgen_console_settings table, and
 * tblregistrars for the Openprovider module.
 */
final class WhmcsSettings implements CompanySettings
{
    public const SETTINGS_TABLE = 'mod_fourthgen_console_settings';

    public function __construct(private readonly string $whmcsRoot)
    {
    }

    public function setting(string $name): ?string
    {
        $value = Capsule::table('tblconfiguration')->where('setting', $name)->value('value');
        return $value === null ? null : (string) $value;
    }

    public function setSetting(string $name, string $value): void
    {
        $now = date('Y-m-d H:i:s');
        if (Capsule::table('tblconfiguration')->where('setting', $name)->exists()) {
            Capsule::table('tblconfiguration')->where('setting', $name)->update(['value' => $value, 'updated_at' => $now]);
        } else {
            Capsule::table('tblconfiguration')->insert(['setting' => $name, 'value' => $value, 'created_at' => $now, 'updated_at' => $now]);
        }
    }

    public function themeExists(string $name): bool
    {
        return preg_match('/^[a-z0-9-]+$/', $name) === 1 && is_file("{$this->whmcsRoot}/templates/{$name}/theme.yaml");
    }

    public function emailTemplate(string $name): ?array
    {
        $row = Capsule::table('tblemailtemplates')->where('name', $name)->where(fn ($q) => $q->where('language', '')->orWhereNull('language'))->first();
        return $row ? ['subject' => (string) $row->subject, 'message' => (string) $row->message] : null;
    }

    public function setEmailTemplate(string $name, string $subject, string $message): void
    {
        Capsule::table('tblemailtemplates')->where('name', $name)->where(fn ($q) => $q->where('language', '')->orWhereNull('language'))->update(['subject' => $subject, 'message' => $message, 'updated_at' => date('Y-m-d H:i:s')]);
    }

    public function addonValue(string $key): ?string
    {
        self::ensureTable();
        $value = Capsule::table(self::SETTINGS_TABLE)->where('key', $key)->value('value');
        return $value === null ? null : (string) $value;
    }

    public function setAddonValue(string $key, string $value): void
    {
        self::ensureTable();
        Capsule::table(self::SETTINGS_TABLE)->updateOrInsert(['key' => $key], ['value' => $value, 'updated_at' => date('Y-m-d H:i:s')]);
    }

    public function registrarFields(string $module): ?array
    {
        $file = "{$this->whmcsRoot}/modules/registrars/{$module}/{$module}.php";
        if (!in_array($module, CompanyHandler::REGISTRARS, true) || !is_file($file)) {
            return null;
        }
        require_once $file;
        $function = "{$module}_getConfigArray";
        if (!function_exists($function)) {
            return null;
        }
        $config = $function();
        return array_values(array_filter(array_keys($config), fn ($k) => $k !== 'FriendlyName' && $k !== 'Description' && in_array($config[$k]['Type'] ?? '', ['text', 'password', 'yesno', 'dropdown'], true)));
    }

    public function registrarSettings(string $module): array
    {
        $settings = [];
        foreach (Capsule::table('tblregistrars')->where('registrar', $module)->get() as $row) {
            $settings[$row->setting] = (string) decrypt($row->value);
        }
        return $settings;
    }

    public function setRegistrarSettings(string $module, array $settings): void
    {
        foreach ($settings as $setting => $value) {
            Capsule::table('tblregistrars')->updateOrInsert(['registrar' => $module, 'setting' => $setting], ['value' => encrypt((string) $value)]);
        }
    }

    public function transaction(callable $work, bool $commit)
    {
        self::ensureTable();
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

    /** The addon's settings table, made on first use so an addon upgraded in place needs no re-activation. */
    public static function ensureTable(): void
    {
        if (!Capsule::schema()->hasTable(self::SETTINGS_TABLE)) {
            Capsule::schema()->create(self::SETTINGS_TABLE, function ($table) {
                $table->string('key', 64)->primary();
                $table->longText('value');
                $table->dateTime('updated_at');
            });
        }
    }

    /** A stored value decoded from JSON, for the invoice template. */
    public static function json(string $key): array
    {
        try {
            $value = Capsule::schema()->hasTable(self::SETTINGS_TABLE) ? Capsule::table(self::SETTINGS_TABLE)->where('key', $key)->value('value') : null;
        } catch (\Throwable) {
            return [];
        }
        $decoded = $value ? json_decode((string) $value, true) : null;
        return is_array($decoded) ? $decoded : [];
    }

    public static function raw(string $key): ?string
    {
        try {
            return Capsule::schema()->hasTable(self::SETTINGS_TABLE) ? Capsule::table(self::SETTINGS_TABLE)->where('key', $key)->value('value') : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
