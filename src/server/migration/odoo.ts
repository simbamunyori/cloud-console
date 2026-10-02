import { parseCsv } from "@/server/spend/csv";

/**
 * Reads the Odoo exports for the client migration (Milestone 9b). Each
 * file is a CSV from Odoo's Export dialog; docs/odoo-migration.md lists
 * the fields to tick. Columns are found by name, so their order doesn't
 * matter, and both Odoo's labels ("Next Invoice") and the technical names
 * of an import-compatible export ("next_invoice_date") work. Values stay
 * as text here; the dry run (plan.ts) interprets and checks them.
 */

export type OdooFile = "customers" | "contacts" | "services" | "domains" | "invoices";

export const ODOO_FILES: { key: OdooFile; label: string; required: boolean; hint: string }[] = [
  { key: "customers", label: "Customers", required: true, hint: "Contacts app, the companies and people you invoice." },
  { key: "contacts", label: "Contact people", required: false, hint: "Contacts app, the people at each company." },
  { key: "services", label: "Subscriptions", required: true, hint: "Subscriptions app, In progress, with their lines." },
  { key: "domains", label: "Domains", required: false, hint: "Our domains template, filled in from your registrar records." },
  { key: "invoices", label: "Unpaid invoices", required: false, hint: "Invoicing app, posted customer invoices not yet paid." },
];

/** Accepted column names per field, compared without case or surrounding spaces. */
const COLUMNS = {
  customers: {
    ref: ["id", "ID", "External ID"],
    name: ["name", "Name", "Display Name", "Company Name"],
    email: ["email", "Email"],
    phone: ["phone", "Phone"],
    mobile: ["mobile", "Mobile"],
    street: ["street", "Street"],
    street2: ["street2", "Street2", "Street 2"],
    city: ["city", "City"],
    zip: ["zip", "Zip", "ZIP", "Postcode"],
    country: ["country_id", "Country", "country_id/id", "Country/ID", "Country/External ID", "country_code", "Country Code"],
    vat: ["vat", "Tax ID", "VAT"],
    registry: ["company_registry", "Company ID", "Company Registry"],
  },
  contacts: {
    ref: ["id", "ID", "External ID"],
    parentRef: ["parent_id/id", "Related Company/ID", "Related Company/External ID", "Company/ID"],
    parentName: ["parent_id", "Related Company", "Company", "Company Name"],
    name: ["name", "Name", "Display Name"],
    email: ["email", "Email"],
    phone: ["phone", "Phone"],
    mobile: ["mobile", "Mobile"],
    type: ["type", "Address Type", "Type"],
    role: ["Console role", "Console Role", "Role"],
  },
  services: {
    subscription: ["name", "Order Reference", "Subscription Reference", "Reference", "Number", "Subscription"],
    customerRef: ["partner_id/id", "Customer/ID", "Customer/External ID"],
    customerName: ["partner_id", "Customer"],
    plan: ["plan_id", "Recurring Plan", "Recurrence", "recurrence_id", "Plan", "Billing period"],
    nextInvoice: ["next_invoice_date", "Next Invoice", "Date of Next Invoice", "Next Invoice Date"],
    startDate: ["start_date", "Start Date", "date_order", "Order Date"],
    currency: ["currency_id", "Currency"],
    status: ["subscription_state", "stage_id", "Stage", "Status", "Subscription Status", "state"],
    product: ["order_line/product_id", "Order Lines/Product", "Product"],
    description: ["order_line/name", "Order Lines/Description", "Description"],
    quantity: ["order_line/product_uom_qty", "Order Lines/Quantity", "Quantity"],
    unitPrice: ["order_line/price_unit", "Order Lines/Unit Price", "Unit Price"],
    discount: ["order_line/discount", "Order Lines/Discount (%)", "Discount (%)", "Discount"],
    hostedAt: ["Hosted at", "Hosted At"],
    hostServer: ["Server or account", "Server or Account"],
    hostNotes: ["Hosting notes", "Hosting Notes"],
    reviewOn: ["Price review date", "Price Review Date"],
    domain: ["Domain", "Website address"],
  },
  domains: {
    name: ["Domain", "Domain name", "name"],
    customerRef: ["Customer ID", "partner_id/id", "Customer/ID"],
    customerName: ["Customer", "partner_id"],
    registeredOn: ["Registered on", "Registration date"],
    expiresOn: ["Expires on", "Expiry date"],
    renewal: ["Renewal price", "Price"],
    years: ["Years", "Registration years"],
    registrar: ["Registrar"],
    autoRenew: ["Auto renew", "Auto-renew"],
  },
  invoices: {
    number: ["name", "Number", "Invoice Number"],
    customerRef: ["partner_id/id", "Customer/ID", "Partner/ID", "Customer/External ID"],
    customerName: ["partner_id", "Customer", "Partner", "invoice_partner_display_name"],
    date: ["invoice_date", "Invoice/Bill Date", "Invoice Date", "Date"],
    dueDate: ["invoice_date_due", "Due Date"],
    amountDue: ["amount_residual", "Amount Due", "amount_residual_signed", "Amount Due Signed", "Residual"],
    total: ["amount_total", "Total", "amount_total_signed", "Total Signed"],
    currency: ["currency_id", "Currency"],
    type: ["move_type", "Type"],
  },
} as const;

type Fields<F extends OdooFile> = keyof (typeof COLUMNS)[F];
export type OdooRow<F extends OdooFile> = { row: number } & { [K in Fields<F>]: string };

/** Fields a file can't do without. A pair means either column will do. */
const REQUIRED: { [F in OdooFile]: (Fields<F> | [Fields<F>, Fields<F>])[] } = {
  customers: ["ref", "name"],
  contacts: [["parentRef", "parentName"], "name"],
  services: ["subscription", ["customerRef", "customerName"], "plan", "nextInvoice", "product", "quantity", "unitPrice"],
  domains: ["name", ["customerRef", "customerName"], "expiresOn", "renewal"],
  invoices: ["number", ["customerRef", "customerName"], "date", "dueDate", "amountDue"],
};

/** Subscription fields Odoo leaves blank on a subscription's second and later lines. */
const CARRIED: Fields<"services">[] = ["subscription", "customerRef", "customerName", "plan", "nextInvoice", "startDate", "currency", "status"];

export interface OdooSource {
  files: Partial<Record<OdooFile, { name: string; rows: number }>>;
  customers: OdooRow<"customers">[];
  contacts: OdooRow<"contacts">[];
  services: OdooRow<"services">[];
  domains: OdooRow<"domains">[];
  invoices: OdooRow<"invoices">[];
  /** Files that couldn't be read at all, and why. */
  problems: { file: OdooFile; message: string }[];
}

const norm = (s: string) => s.trim().toLowerCase();

/** One file's rows, keyed by field. Row numbers count the header as row 1, as a spreadsheet does. */
export function readOdooFile<F extends OdooFile>(file: F, text: string): { rows: OdooRow<F>[]; problems: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], problems: ["The file is empty."] };
  const header = table[0].map(norm);
  const columns = COLUMNS[file] as Record<string, readonly string[]>;
  const index: Record<string, number> = {};
  for (const [field, names] of Object.entries(columns)) {
    const at = names.map((n) => header.indexOf(norm(n))).find((i) => i >= 0);
    if (at !== undefined) index[field] = at;
  }
  const problems: string[] = [];
  for (const need of REQUIRED[file] as (string | [string, string])[]) {
    const options = Array.isArray(need) ? need : [need];
    if (!options.some((f) => f in index)) problems.push(`There is no ${options.map((f) => `"${columns[f][1] ?? columns[f][0]}"`).join(" or ")} column.`);
  }
  if (problems.length) return { rows: [], problems };

  const rows: OdooRow<F>[] = [];
  let previous: Record<string, string> | null = null;
  table.slice(1).forEach((cells, i) => {
    const row: Record<string, string | number> = { row: i + 2 };
    for (const field of Object.keys(columns)) row[field] = field in index ? (cells[index[field]] ?? "").trim() : "";
    if (file === "services") {
      // A subscription's later lines leave its own fields blank.
      if (!row.subscription && previous) for (const f of CARRIED) row[f] = previous[f];
      previous = row as Record<string, string>;
    }
    rows.push(row as OdooRow<F>);
  });
  return { rows, problems };
}

/** Reads every uploaded file. Missing optional files are simply empty. */
export function readOdooExports(uploads: { file: OdooFile; name: string; text: string }[]): OdooSource {
  const source: OdooSource = { files: {}, customers: [], contacts: [], services: [], domains: [], invoices: [], problems: [] };
  for (const { key, label, required } of ODOO_FILES) {
    const upload = uploads.find((u) => u.file === key);
    if (!upload) {
      if (required) source.problems.push({ file: key, message: `Add the ${label.toLowerCase()} file.` });
      continue;
    }
    const { rows, problems } = readOdooFile(key, upload.text);
    source.files[key] = { name: upload.name, rows: rows.length };
    for (const message of problems) source.problems.push({ file: key, message });
    (source[key] as unknown[]) = rows;
  }
  return source;
}

/**
 * Example files: the columns the import reads, with one made-up row each.
 * Odoo's own export gives the same columns when the fields in
 * docs/odoo-migration.md are ticked; the domains file is filled in by hand.
 */
export const ODOO_TEMPLATES: Record<OdooFile, string> = {
  customers: [
    "ID,Name,Email,Phone,Street,Street2,City,Zip,Country,Tax ID,Company ID",
    "__export__.res_partner_42_a1b2c3,Example Holdings (Pty) Ltd,accounts@example.co.bw,+267 390 0000,Plot 123,Main Mall,Gaborone,,Botswana,P01234567890,BW00001234567",
  ].join("\n"),
  contacts: [
    "ID,Related Company/ID,Name,Email,Phone,Address Type,Console role",
    "__export__.res_partner_43_d4e5f6,__export__.res_partner_42_a1b2c3,Neo Example,neo@example.co.bw,+267 71 000 000,Contact,Owner",
    "__export__.res_partner_44_a7b8c9,__export__.res_partner_42_a1b2c3,Accounts,accounts@example.co.bw,,Invoice Address,Billing",
  ].join("\n"),
  services: [
    "Order Reference,Customer/ID,Recurring Plan,Next Invoice,Start Date,Currency,Status,Order Lines/Product,Order Lines/Description,Order Lines/Quantity,Order Lines/Unit Price,Order Lines/Discount (%),Hosted at,Server or account,Hosting notes,Price review date,Domain",
    "SUB/2026/0042,__export__.res_partner_42_a1b2c3,Monthly,2026-11-01,2024-03-01,BWP,In Progress,Microsoft 365 Business Standard,Microsoft 365 Business Standard,12,190.00,0,,,,2027-03-01,",
    ",,,,,,,[WEB-01] Web hosting,Web hosting,1,150.00,0,Contabo,vps-17 (161.97.0.17),cPanel account example,,example.co.bw",
  ].join("\n"),
  domains: ["Domain,Customer ID,Registered on,Expires on,Renewal price,Years,Registrar,Auto renew", "example.co.bw,__export__.res_partner_42_a1b2c3,2019-05-14,2027-05-14,310.00,1,cocca,Yes"].join("\n"),
  invoices: [
    "Number,Customer/ID,Invoice/Bill Date,Due Date,Amount Due,Total,Currency,Type",
    "INV/2026/00042,__export__.res_partner_42_a1b2c3,2026-08-12,2026-09-11,1140.00,2280.00,BWP,Customer Invoice",
  ].join("\n"),
};
