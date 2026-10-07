<?php

/**
 * The invoice PDF WHMCS makes, laid out like the Cloud Console's own
 * (src/server/documents/business-pdf.ts): our logo, company details,
 * the customer, the lines and totals, and the bank details for the
 * invoice's currency with the invoice number as the reference. The
 * company details, logo and bank details come from the console's
 * Admin > Company through the addon's company push
 * (docs/whmcs-setup.md, section 10); WHMCS's own values are the fallback.
 */

use FourthGen\ConsoleSync\WhmcsSettings;
use WHMCS\Database\Capsule;

$addon = ROOTDIR . '/modules/addons/fourthgen_console/lib/WhmcsSettings.php';
$stored = ['company' => [], 'currencies' => [], 'logo' => null];
if (is_file($addon)) {
    require_once ROOTDIR . '/modules/addons/fourthgen_console/lib/CompanySettings.php';
    require_once ROOTDIR . '/modules/addons/fourthgen_console/lib/CompanyHandler.php';
    require_once $addon;
    $stored = ['company' => WhmcsSettings::json('company'), 'currencies' => WhmcsSettings::json('currencies'), 'logo' => WhmcsSettings::raw('logo')];
}
$company = $stored['company'];
$e = fn ($s) => htmlspecialchars(trim((string) $s), ENT_QUOTES, 'UTF-8');
$font = $pdfFont ?? 'helvetica';
$blue = '#0057ff';
$muted = '#5b6475';

$code = '';
try {
    $code = (string) Capsule::table('tblinvoices as i')->join('tblclients as c', 'c.id', '=', 'i.userid')->join('tblcurrencies as cur', 'cur.id', '=', 'c.currency')->where('i.id', $invoiceid)->value('cur.code');
} catch (\Throwable $ignored) {
}
$money = [];
foreach ($stored['currencies'] as $c) {
    if (($c['code'] ?? '') === $code) {
        $money = $c;
    }
}
$bank = $money['bank'] ?? null;
$number = $invoicenum ?: $invoiceid;

# Logo: the one from Admin > Company, else WHMCS's own.
$logo = $stored['logo'] ? base64_decode($stored['logo'], true) : false;
if ($logo) {
    $pdf->Image('@' . $logo, 15, 15, 62, 0, 'PNG');
} elseif (file_exists(ROOTDIR . '/assets/img/logo.png')) {
    $pdf->Image(ROOTDIR . '/assets/img/logo.png', 15, 15, 62);
}

# Title and status.
$statusText = [
    'Paid' => 'Paid',
    'Unpaid' => 'Unpaid',
    'Cancelled' => 'Cancelled',
    'Refunded' => 'Refunded',
    'Collections' => 'Overdue',
    'Payment Pending' => 'Payment pending',
][$status] ?? $status;
$pdf->SetXY(110, 15);
$pdf->SetFont($font, 'B', 20);
$pdf->SetTextColor(11, 21, 48);
$pdf->Cell(85, 9, 'Invoice', 0, 2, 'R');
$pdf->SetFont($font, '', 10);
$pdf->SetTextColor(91, 100, 117);
$pdf->Cell(85, 5, 'Number ' . $number, 0, 2, 'R');
$pdf->Cell(85, 5, $statusText, 0, 2, 'R');
$pdf->SetTextColor(0, 0, 0);
$pdf->SetY(42);

# From and To.
$from = [$company['legalName'] ?? $companyname];
foreach ($company['addressLines'] ?? $companyaddress as $line) {
    $from[] = $line;
}
if (!empty($company['registrationNumber'])) {
    $from[] = 'Company registration ' . $company['registrationNumber'];
}
if (!empty($money['taxNumber'])) {
    $from[] = ($money['taxLabel'] ?? 'Tax') . ' number ' . $money['taxNumber'];
}
foreach (['phone', 'email'] as $k) {
    if (!empty($company[$k])) {
        $from[] = $company[$k];
    }
}
$to = array_filter([
    $clientsdetails['companyname'] ?? '',
    trim(($clientsdetails['firstname'] ?? '') . ' ' . ($clientsdetails['lastname'] ?? '')),
    $clientsdetails['address1'] ?? '',
    $clientsdetails['address2'] ?? '',
    trim(($clientsdetails['city'] ?? '') . ' ' . ($clientsdetails['postcode'] ?? '')),
    $clientsdetails['country'] ?? '',
]);
foreach ($customfields as $field) {
    if (!empty($field['value'])) {
        $to[] = $field['fieldname'] . ': ' . $field['value'];
    }
}
$lines = fn ($list) => implode('<br>', array_map($e, $list));
$html = '<table cellpadding="0" cellspacing="0" width="100%"><tr>'
    . '<td width="50%"><span style="color:' . $muted . ';font-size:8pt;">FROM</span><br><span style="font-size:9.5pt;">' . $lines($from) . '</span></td>'
    . '<td width="50%"><span style="color:' . $muted . ';font-size:8pt;">TO</span><br><span style="font-size:9.5pt;">' . $lines($to) . '</span></td>'
    . '</tr></table><br>';

# Dates.
$html .= '<table cellpadding="6" cellspacing="0" width="100%" style="background-color:#eef3ff;"><tr>'
    . '<td><span style="color:' . $muted . ';font-size:8pt;">Issued</span><br>' . $e($datecreated) . '</td>'
    . '<td><span style="color:' . $muted . ';font-size:8pt;">Due</span><br>' . $e($duedate) . '</td>'
    . '<td><span style="color:' . $muted . ';font-size:8pt;">Reference</span><br>' . $e($number) . '</td>'
    . '</tr></table><br>';

# Lines.
$html .= '<table cellpadding="5" cellspacing="0" width="100%">'
    . '<tr style="color:' . $muted . ';font-size:8.5pt;"><td width="75%" style="border-bottom:1px solid #d5dbe6;">Description</td><td width="25%" align="right" style="border-bottom:1px solid #d5dbe6;">Amount</td></tr>';
foreach ($invoiceitems as $item) {
    $html .= '<tr><td style="border-bottom:1px solid #eef0f4;">' . nl2br($e($item['description'])) . ($item['taxed'] ? ' *' : '') . '</td>'
        . '<td align="right" style="border-bottom:1px solid #eef0f4;">' . $e($item['amount']) . '</td></tr>';
}
$totalRow = function (string $label, $value, bool $strong = false) use ($e) {
    $style = $strong ? 'font-weight:bold;font-size:11pt;' : '';
    return '<tr><td align="right" style="' . $style . '">' . $e($label) . '</td><td align="right" style="' . $style . '">' . $e($value) . '</td></tr>';
};
$html .= $totalRow('Subtotal', $subtotal);
if ($taxname) {
    $html .= $totalRow($taxname . ' (' . $taxrate . '%)', $tax);
}
if ($taxname2) {
    $html .= $totalRow($taxname2 . ' (' . $taxrate2 . '%)', $tax2);
}
if ((float) preg_replace('/[^0-9.]/', '', (string) $credit) > 0) {
    $html .= $totalRow('Credit', $credit);
}
$html .= $totalRow('Total', $total, true);
$html .= '</table>';
if ($taxname) {
    $html .= '<p style="color:' . $muted . ';font-size:8pt;">* ' . $e($taxname) . ' applies to this line.</p>';
}

# How to pay.
if ($status !== 'Paid' && $status !== 'Cancelled') {
    $html .= '<br><span style="font-weight:bold;">How to pay</span><br>';
    if ($bank) {
        $rows = [
            ['Bank', $bank['bankName'] ?? ''],
            ['Branch', $bank['branchName'] ?? ''],
            ['Account name', $bank['accountName'] ?? ''],
            ['Account number', $bank['accountNumber'] ?? ''],
            ['Branch code', $bank['branchCode'] ?? ''],
            ['SWIFT code', $bank['swiftCode'] ?? ''],
            ['Reference', $number],
        ];
        $html .= '<table cellpadding="3" cellspacing="0" width="70%">';
        foreach ($rows as [$label, $value]) {
            if ($value !== '' && $value !== null) {
                $html .= '<tr><td width="40%" style="color:' . $muted . ';">' . $e($label) . '</td><td width="60%">' . $e($value) . '</td></tr>';
            }
        }
        $html .= '</table>';
    }
    if (!empty($company['consoleUrl'])) {
        $link = rtrim($company['consoleUrl'], '/') . '/app/billing/invoices/' . rawurlencode((string) $invoiceid);
        $html .= '<p>Pay online or download a copy: <a href="' . $e($link) . '" style="color:' . $blue . ';">' . $e($link) . '</a></p>';
    }
}
if (!empty($company['paymentTerms'])) {
    $html .= '<p style="color:' . $muted . ';font-size:8.5pt;">' . nl2br($e($company['paymentTerms'])) . '</p>';
}
if (!empty($notes)) {
    $html .= '<p style="font-size:9pt;">' . nl2br($e($notes)) . '</p>';
}

# Payments made.
if (count($transactions)) {
    $html .= '<br><span style="font-weight:bold;">Payments</span><table cellpadding="3" cellspacing="0" width="100%">';
    foreach ($transactions as $t) {
        $html .= '<tr><td>' . $e($t['date']) . '</td><td>' . $e($t['gateway']) . '</td><td align="right">' . $e($t['amount']) . '</td></tr>';
    }
    $html .= '</table>';
}

if (!empty($company['invoiceFooter'])) {
    $html .= '<br><p align="center" style="color:' . $muted . ';font-size:8.5pt;">' . $e($company['invoiceFooter']) . '</p>';
}

$pdf->SetFont($font, '', 10);
$pdf->writeHTML($html, true, false, true, false, '');
