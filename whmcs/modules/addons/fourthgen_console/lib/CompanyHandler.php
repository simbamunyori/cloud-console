<?php

namespace FourthGen\ConsoleSync;

/**
 * The company push (docs/whmcs-setup.md, section 10): the console's Admin >
 * Company details replace WHMCS's own defaults, so nothing WHMCS shows or
 * sends carries anything else. The same callers as the price sync: signed,
 * fresh, unseen, from an allowed address. A request is applied all or
 * nothing, and a dry run works it out and rolls it back.
 *
 * Request body (JSON):
 *   {"dryRun": false,
 *    "settings": {"CompanyName": "...", "MaintenanceMode": "on", ...},
 *    "company": {"legalName": "...", ...},       (for the invoice PDF)
 *    "currencies": [{"code": "BWP", "taxLabel": "VAT", "taxNumber": "...",
 *                    "bank": {"bankName": "...", ...} or null}],
 *    "logo": "base64 PNG",
 *    "emailTemplates": [{"name": "Invoice Created", "subject": "...", "message": "..."}],
 *    "registrar": {"module": "openprovider", "username": "...", "password": "...", "testMode": false}}
 * Every key is optional except dryRun.
 */
final class CompanyHandler
{
    /** General settings the push may change, and what each value must look like. */
    public const SETTINGS = [
        'CompanyName' => 'text',
        'Email' => 'email',
        'Domain' => 'url',
        'InvoicePayTo' => 'longtext',
        'LogoURL' => 'url',
        'SystemEmailsFromName' => 'text',
        'SystemEmailsFromEmail' => 'email',
        'Signature' => 'longtext',
        'EmailGlobalHeader' => 'html',
        'EmailGlobalFooter' => 'html',
        'EmailCSS' => 'html',
        'MaintenanceMode' => 'flag',
        'MaintenanceModeMessage' => 'longtext',
        'MaintenanceModeURL' => 'url',
        'AutoRenewDomainsonPayment' => 'flag',
        'DefaultNameserver1' => 'host',
        'DefaultNameserver2' => 'host',
        'DefaultNameserver3' => 'host',
        'DefaultNameserver4' => 'host',
        'Template' => 'theme',
    ];

    /** The invoice emails WHMCS can send; the console sends its own, but these match it if WHMCS ever does. */
    public const EMAIL_TEMPLATES = [
        'Invoice Created',
        'Invoice Payment Confirmation',
        'Invoice Payment Reminder',
        'First Invoice Overdue Notice',
        'Second Invoice Overdue Notice',
        'Third Invoice Overdue Notice',
        'Credit Card Invoice Created',
    ];

    public const THEMES = ['fourthgen', 'twenty-one'];
    public const REGISTRARS = ['openprovider'];

    private const COMPANY_KEYS = ['legalName', 'tradingName', 'registrationNumber', 'addressLines', 'phone', 'email', 'website', 'paymentTerms', 'invoiceFooter', 'consoleUrl'];
    private const BANK_KEYS = ['bankName', 'branchName', 'accountName', 'accountNumber', 'branchCode', 'swiftCode'];
    private const MAX_LOGO_BYTES = 1048576;

    public function __construct(
        private readonly CompanySettings $settings,
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
            if (strlen($body) > Guard::MAX_BODY_BYTES * 2) {
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
            $this->validate($request);
            $dryRun = $request['dryRun'];
            [$changes, $warnings] = $this->settings->transaction(fn () => $this->apply($request), !$dryRun);
        } catch (Refused $e) {
            $this->journal->activity("Console company push: refused a request from {$ip}: {$e->getMessage()}.");
            return [$e->status, ['ok' => false, 'error' => $e->getMessage()]];
        } catch (\Throwable $e) {
            $this->journal->activity("Console company push: failed for a request from {$ip}: " . get_class($e) . '.');
            return [500, ['ok' => false, 'error' => 'the company push failed inside WHMCS; nothing was changed']];
        }

        if (!$dryRun) {
            foreach ($changes as $change) {
                $this->journal->activity("Console company push: {$change}.");
            }
            $this->journal->recordSync($ip, $requestId, 'Company push: ' . count($changes) . ' ' . (count($changes) === 1 ? 'change' : 'changes'));
        }
        return [200, ['ok' => true, 'dryRun' => $dryRun, 'changes' => $changes, 'warnings' => $warnings]];
    }

    /** Throws Refused(400) unless the request is exactly what the push may do. */
    private function validate(array $request): void
    {
        $unknown = array_diff(array_keys($request), ['dryRun', 'settings', 'company', 'currencies', 'logo', 'emailTemplates', 'registrar']);
        if ($unknown) {
            throw new Refused(400, 'unknown field ' . implode(', ', $unknown));
        }
        if (!is_bool($request['dryRun'] ?? null)) {
            throw new Refused(400, 'dryRun must be true or false');
        }

        foreach ($request['settings'] ?? [] as $name => $value) {
            $kind = self::SETTINGS[$name] ?? null;
            if ($kind === null) {
                throw new Refused(400, "setting {$name} may not be changed");
            }
            if (!is_string($value) || !self::valid($kind, $value)) {
                throw new Refused(400, "setting {$name} is not a valid {$kind}");
            }
            if ($kind === 'theme' && !$this->settings->themeExists($value)) {
                throw new Refused(409, "the {$value} theme is not installed in WHMCS");
            }
        }

        if (isset($request['company'])) {
            $company = $request['company'];
            if (!is_array($company) || array_diff(array_keys($company), self::COMPANY_KEYS)) {
                throw new Refused(400, 'company has unknown fields');
            }
            foreach ($company as $key => $value) {
                $ok = $key === 'addressLines'
                    ? is_array($value) && array_is_list($value) && count($value) <= 8 && !array_filter($value, fn ($l) => !is_string($l) || !self::valid('text', $l))
                    : $value === null || (is_string($value) && self::valid('longtext', $value));
                if (!$ok) {
                    throw new Refused(400, "company {$key} is not valid");
                }
            }
        }

        if (isset($request['currencies'])) {
            $list = $request['currencies'];
            if (!is_array($list) || !array_is_list($list) || count($list) > 20) {
                throw new Refused(400, 'currencies must be a list of up to 20');
            }
            foreach ($list as $n => $c) {
                if (!is_array($c) || array_diff(array_keys($c), ['code', 'taxLabel', 'taxNumber', 'bank']) || !is_string($c['code'] ?? null) || !preg_match('/^[A-Z]{3}$/', $c['code'])) {
                    throw new Refused(400, "currency {$n} is not valid");
                }
                foreach (['taxLabel', 'taxNumber'] as $key) {
                    if (isset($c[$key]) && !(is_string($c[$key]) && self::valid('text', $c[$key]))) {
                        throw new Refused(400, "currency {$c['code']}: {$key} is not valid");
                    }
                }
                $bank = $c['bank'] ?? null;
                if ($bank !== null && (!is_array($bank) || array_diff(array_keys($bank), self::BANK_KEYS) || !is_string($bank['bankName'] ?? null) || !is_string($bank['accountNumber'] ?? null))) {
                    throw new Refused(400, "currency {$c['code']}: bank is not valid");
                }
                foreach ($bank ?? [] as $key => $value) {
                    if ($value !== null && !(is_string($value) && self::valid('text', $value))) {
                        throw new Refused(400, "currency {$c['code']}: bank {$key} is not valid");
                    }
                }
            }
        }

        if (isset($request['logo'])) {
            $png = is_string($request['logo']) ? base64_decode($request['logo'], true) : false;
            if ($png === false || strlen($png) > self::MAX_LOGO_BYTES || !str_starts_with($png, "\x89PNG\r\n\x1a\n")) {
                throw new Refused(400, 'logo must be a PNG under 1 MB, base64 encoded');
            }
        }

        if (isset($request['emailTemplates'])) {
            $list = $request['emailTemplates'];
            if (!is_array($list) || !array_is_list($list) || count($list) > count(self::EMAIL_TEMPLATES)) {
                throw new Refused(400, 'emailTemplates must be a list');
            }
            foreach ($list as $t) {
                if (!is_array($t) || array_diff(array_keys($t), ['name', 'subject', 'message']) || !in_array($t['name'] ?? null, self::EMAIL_TEMPLATES, true)) {
                    throw new Refused(400, 'email template ' . json_encode($t['name'] ?? null) . ' may not be changed');
                }
                if (!is_string($t['subject'] ?? null) || !self::valid('text', $t['subject']) || !is_string($t['message'] ?? null) || !self::valid('html', $t['message'])) {
                    throw new Refused(400, "email template {$t['name']} is not valid");
                }
            }
        }

        if (isset($request['registrar'])) {
            $r = $request['registrar'];
            if (!is_array($r) || array_diff(array_keys($r), ['module', 'username', 'password', 'testMode']) || !in_array($r['module'] ?? null, self::REGISTRARS, true)) {
                throw new Refused(400, 'registrar may only be openprovider');
            }
            if (!is_string($r['username'] ?? null) || !self::valid('text', $r['username']) || !is_string($r['password'] ?? null) || $r['password'] === '' || strlen($r['password']) > 200 || !is_bool($r['testMode'] ?? null)) {
                throw new Refused(400, 'registrar needs a username, a password and testMode');
            }
        }
    }

    /** Whether $value is acceptable for a setting of $kind. */
    public static function valid(string $kind, string $value): bool
    {
        // Control characters never belong in a setting; Smarty tags that run code never belong in a template.
        if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $value)) {
            return false;
        }
        if (preg_match('/\{\s*\/?\s*(php|include|fetch|eval|insert|config_load)\b/i', $value)) {
            return false;
        }
        return match ($kind) {
            'text' => mb_strlen($value) <= 255,
            'longtext' => mb_strlen($value) <= 2000,
            'html' => mb_strlen($value) <= 60000 && !preg_match('/<\s*script/i', $value),
            'email' => (bool) filter_var($value, FILTER_VALIDATE_EMAIL),
            'url' => mb_strlen($value) <= 255 && (bool) preg_match('#^https://[^\s<>"\']+$#', $value),
            'flag' => $value === 'on' || $value === '',
            'host' => $value === '' || (bool) preg_match('/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i', $value),
            'theme' => in_array($value, self::THEMES, true),
            default => false,
        };
    }

    /** @return array{0:string[],1:string[]} what changed, and anything the console should tell the Admin. */
    private function apply(array $request): array
    {
        $changes = [];
        $warnings = [];
        foreach ($request['settings'] ?? [] as $name => $value) {
            if ($this->settings->setting($name) !== $value) {
                $this->settings->setSetting($name, $value);
                $changes[] = in_array(self::SETTINGS[$name], ['html', 'longtext'], true) ? "changed {$name}" : "set {$name} to " . ($value === '' ? '(empty)' : $value);
            }
        }

        $stored = [
            'company' => isset($request['company']) ? json_encode($request['company']) : null,
            'currencies' => isset($request['currencies']) ? json_encode($request['currencies']) : null,
            'logo' => $request['logo'] ?? null,
        ];
        $labels = ['company' => 'the company details on invoices', 'currencies' => 'the bank and tax details on invoices', 'logo' => 'the invoice logo'];
        foreach ($stored as $key => $value) {
            if ($value !== null && $this->settings->addonValue($key) !== $value) {
                $this->settings->setAddonValue($key, $value);
                $changes[] = "updated {$labels[$key]}";
            }
        }

        foreach ($request['emailTemplates'] ?? [] as $t) {
            $current = $this->settings->emailTemplate($t['name']);
            if ($current === null) {
                $warnings[] = "WHMCS has no \"{$t['name']}\" email template";
                continue;
            }
            if ($current['subject'] !== $t['subject'] || $current['message'] !== $t['message']) {
                $this->settings->setEmailTemplate($t['name'], $t['subject'], $t['message']);
                $changes[] = "updated the \"{$t['name']}\" email";
            }
        }

        if (isset($request['registrar'])) {
            [$change, $warning] = $this->applyRegistrar($request['registrar']);
            if ($change) {
                $changes[] = $change;
            }
            if ($warning) {
                $warnings[] = $warning;
            }
        }
        return [$changes, $warnings];
    }

    /** Fills the registrar module's own settings, whatever it calls them. */
    private function applyRegistrar(array $r): array
    {
        $fields = $this->settings->registrarFields($r['module']);
        if ($fields === null) {
            return [null, 'the Openprovider registrar module is not installed in WHMCS yet, so its settings were not sent'];
        }
        $find = function (string $pattern, array $not = []) use ($fields): ?string {
            foreach ($fields as $name) {
                if (preg_match($pattern, $name) && !in_array($name, $not, true)) {
                    return $name;
                }
            }
            return null;
        };
        $user = $find('/user/i');
        $pass = $find('/pass/i');
        $test = $find('/test|sandbox/i', array_filter([$user, $pass]));
        if (!$user || !$pass) {
            return [null, 'the Openprovider module asks for settings the console does not recognise (' . implode(', ', $fields) . '); enter them in WHMCS by hand'];
        }
        $wanted = [$user => $r['username'], $pass => $r['password']];
        if ($test) {
            $wanted[$test] = $r['testMode'] ? 'on' : '';
        }
        $current = $this->settings->registrarSettings($r['module']);
        $differs = array_filter(array_keys($wanted), fn ($k) => ($current[$k] ?? null) !== $wanted[$k]);
        if (!$differs) {
            return [null, null];
        }
        $this->settings->setRegistrarSettings($r['module'], $wanted + $current);
        // Names only: the values include the password.
        return ['set the Openprovider registrar module\'s ' . implode(', ', $differs), null];
    }
}
