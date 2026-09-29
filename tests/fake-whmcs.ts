/**
 * An in-memory WHMCS API for unit tests. It answers the actions the console
 * uses in the shapes documented at developers.whmcs.com (see
 * docs/whmcs-api-notes.md): numbers as strings, nested lists, "" for an
 * empty list, and service passwords in GetClientsProducts. It is not
 * WHMCS; where WHMCS's behaviour isn't documented, it does the least (for
 * example CancelOrder only cancels the order), so the adapter has to do the
 * rest itself. The live suite (whmcs.integration.test.ts) checks the real
 * thing.
 */

type Row = Record<string, unknown>;
type Answer = Record<string, unknown>;

export const FAKE_CREDENTIALS = { url: "https://billing.test/includes/api.php", identifier: "fake-identifier", secret: "fake-secret" };
/** Every service's password in the fake; tests check it is never logged. */
export const SERVICE_PASSWORD = "fake-service-password-7Hq";

const CURRENCIES = [
  { id: "1", code: "BWP", prefix: "P", suffix: " BWP" },
  { id: "2", code: "ZAR", prefix: "R", suffix: " ZAR" },
  { id: "3", code: "USD", prefix: "$", suffix: " USD" },
];

interface Product {
  pid: string;
  gid: string;
  groupname: string;
  name: string;
  type: string;
  module: string;
  /** Monthly price per unit, by currency code. */
  monthly: Record<string, string>;
  /** Sold per user, with a "Users" quantity option. */
  perUser: boolean;
}

export const FAKE_PRODUCTS: Product[] = [
  { pid: "1", gid: "1", groupname: "Microsoft 365", name: "Microsoft 365 Business Standard", type: "other", module: "", monthly: { BWP: "190.00", ZAR: "230.00", USD: "12.50" }, perUser: true },
  { pid: "2", gid: "1", groupname: "Microsoft 365", name: "Microsoft 365 Business Premium", type: "other", module: "", monthly: { BWP: "380.00", ZAR: "460.00", USD: "25.00" }, perUser: true },
  { pid: "3", gid: "2", groupname: "Servers", name: "Managed VPS, medium", type: "server", module: "fakevps", monthly: { BWP: "850.00", ZAR: "1020.00", USD: "65.00" }, perUser: false },
];

/** The "Users" option on product n is option id 100 + n, with one choice 200 + n. */
const optionId = (pid: string) => String(100 + Number(pid));
const choiceId = (pid: string) => String(200 + Number(pid));

const START_TLDS: Record<string, Record<string, string>> = {
  "co.bw": { BWP: "250.00", ZAR: "300.00", USD: "19.00" },
  bw: { BWP: "300.00", ZAR: "360.00", USD: "23.00" },
  com: { BWP: "220.00", ZAR: "260.00", USD: "16.00" },
};
const TAKEN = ["mascom.co.bw", "google.com"];

export interface FakeWhmcsOptions {
  /** Answer this instead, for every call (e.g. an authentication failure). */
  failWith?: string;
  /** Throw a network error on the first n calls. */
  dropFirst?: number;
  /** What ModuleSuspend and friends say for a product with no module. */
  noModuleMessage?: string;
  /** Make the fakevps module fail with this message. */
  moduleFailure?: string;
}

export function fakeWhmcs(options: FakeWhmcsOptions = {}) {
  let nextId = 1000;
  const TLDS: Record<string, Record<string, string>> = structuredClone(START_TLDS);
  const renewals: Record<string, Record<string, string>> = structuredClone(START_TLDS);
  const id = () => String(nextId++);
  const today = () => new Date().toISOString().slice(0, 10);
  const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

  const clients = new Map<string, Row>();
  const orders = new Map<string, Row & { items: { type: string; relid: string }[] }>();
  const services = new Map<string, Row & { options: Record<string, string> }>();
  const invoices = new Map<string, Row & { items: Row[] }>();
  const transactions: Row[] = [];
  const domains = new Map<string, Row>();
  const calls: { action: string; params: Record<string, string> }[] = [];
  let dropped = 0;

  const fail = (message: string): Answer => ({ result: "error", message });
  // How PHP reads a flag: "false" is on, only "", "0" and nothing are off.
  const on = (flag: string | undefined) => flag !== undefined && flag !== "" && flag !== "0";
  const code = (currencyId: string) => CURRENCIES.find((c) => c.id === currencyId)!.code;
  const clientCode = (clientId: string) => code(String(clients.get(clientId)!.currency));
  const cents = (s: unknown) => Math.round(Number(s) * 100);
  const fmt = (c: number) => (c / 100).toFixed(2);
  const addMonths = (d: string, n: number) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCMonth(x.getUTCMonth() + n);
    return x.toISOString().slice(0, 10);
  };
  const indexed = (p: Record<string, string>, name: string) =>
    Object.keys(p)
      .map((k) => new RegExp(`^${name}\\[(\\d+)\\]$`).exec(k))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ key: m[1], value: p[m[0]] }));

  function paged<T>(rows: T[], p: Record<string, string>) {
    const start = Number(p.limitstart ?? 0);
    const limit = Number(p.limitnum ?? 25);
    const page = rows.slice(start, start + limit);
    return { totalresults: String(rows.length), startnumber: String(start), numreturned: String(page.length), page };
  }

  function invoiceTotals(inv: Row & { items: Row[] }) {
    const subtotal = inv.items.reduce((t, l) => t + cents(l.amount), 0);
    const paid = transactions.filter((t) => t.invoiceid === inv.invoiceid).reduce((t, x) => t + cents(x.amountin) - cents(x.amountout), 0);
    return { subtotal: fmt(subtotal), tax: "0.00", tax2: "0.00", total: fmt(subtotal), balance: fmt(subtotal - paid) };
  }

  function newInvoice(clientId: string, items: Row[], paymentmethod: string) {
    const invoiceid = id();
    invoices.set(invoiceid, {
      invoiceid,
      invoicenum: "",
      userid: clientId,
      date: today(),
      duedate: today(),
      datepaid: "0000-00-00 00:00:00",
      status: "Unpaid",
      paymentmethod,
      notes: "",
      taxrate: "0.000",
      items: items.map((l) => ({ id: id(), taxed: 0, ...l })),
    });
    return invoiceid;
  }

  function productRow(p: Product) {
    const pricing: Record<string, Row> = {};
    for (const c of CURRENCIES) {
      pricing[c.code] = { prefix: c.prefix, suffix: c.suffix, msetupfee: "0.00", monthly: p.perUser ? "0.00" : p.monthly[c.code], annually: "-1.00" };
    }
    const optionPricing = Object.fromEntries(CURRENCIES.map((c) => [c.code, { monthly: p.monthly[c.code], msetupfee: "0.00" }]));
    return {
      pid: p.pid,
      gid: p.gid,
      type: p.type,
      name: p.name,
      description: "",
      module: p.module,
      paytype: "recurring",
      allowqty: "0",
      pricing,
      customfields: { customfield: [] },
      configoptions: p.perUser ? { configoption: [{ id: optionId(p.pid), name: "Users", type: "4", options: { option: [{ id: choiceId(p.pid), name: "User", recurring: optionPricing }] } }] } : { configoption: [] },
    };
  }

  function serviceRow(s: Row & { options: Record<string, string> }) {
    const product = FAKE_PRODUCTS.find((p) => p.pid === s.pid)!;
    return {
      ...s,
      name: product.name,
      groupname: product.groupname,
      username: "svc",
      password: SERVICE_PASSWORD,
      configoptions: product.perUser ? { configoption: [{ id: optionId(product.pid), option: "Users", type: "quantity", value: s.options[optionId(product.pid)] ?? "0" }] } : "",
      options: undefined,
    };
  }

  /** Just enough of PHP's unserialize for flat and one-level nested arrays. */
  function unserialize(text: string) {
    let i = 0;
    const read = (): unknown => {
      const t = text[i];
      if (t === "i") {
        const end = text.indexOf(";", i);
        const v = text.slice(i + 2, end);
        i = end + 1;
        return v;
      }
      if (t === "s") {
        const colon = text.indexOf(":", i + 2);
        const len = Number(text.slice(i + 2, colon));
        const v = Buffer.from(text.slice(colon + 2)).subarray(0, len).toString();
        i = colon + 2 + v.length + 2;
        return v;
      }
      if (t === "a") {
        const colon = text.indexOf(":", i + 2);
        const n = Number(text.slice(i + 2, colon));
        i = colon + 2;
        const out: Record<string, unknown> = {};
        for (let k = 0; k < n; k++) {
          const key = String(read());
          out[key] = read();
        }
        i += 1;
        return out;
      }
      throw new Error(`Can't unserialize at ${i}: ${text}`);
    };
    return read() as Record<string, unknown>;
  }

  const actions: Record<string, (p: Record<string, string>) => Answer> = {
    GetCurrencies: () => ({ totalresults: CURRENCIES.length, currencies: { currency: CURRENCIES.map((c) => ({ ...c, format: "1", rate: "1.00000" })) } }),

    GetClientsDetails: (p) => {
      const c = clients.get(p.clientid);
      if (!c) return fail("Client Not Found");
      return { client: { ...c, client_id: c.id, userid: c.id, currency_code: code(String(c.currency)) }, ...c };
    },

    AddClient: (p) => {
      for (const field of ["firstname", "lastname", "email", "address1", "city", "state", "postcode", "country", "phonenumber"]) if (!p[field]) return fail(`You did not provide required ${field}`);
      // What the live install answers (WHMCS 9.0.9), though the API docs call it optional.
      if (!p.password2 && !p.owner_user_id) return fail("The Password field is required.");
      if ([...clients.values()].some((c) => c.email === p.email)) return fail("A user already exists with that email address");
      const clientId = id();
      clients.set(clientId, { id: clientId, firstname: p.firstname, lastname: p.lastname, companyname: p.companyname ?? "", email: p.email, address1: p.address1, city: p.city, state: p.state, postcode: p.postcode, countrycode: p.country, phonenumber: p.phonenumber, tax_id: p.tax_id ?? "", currency: p.currency ?? "1", status: "Active" });
      return { clientid: clientId };
    },

    UpdateClient: (p) => {
      const c = clients.get(p.clientid);
      if (!c) return fail("Client ID Not Found");
      for (const field of ["firstname", "lastname", "companyname", "email", "address1", "city", "phonenumber", "tax_id", "currency", "status"]) if (p[field] !== undefined) c[field] = p[field];
      // As the live install does: only the digits of a phone number are kept.
      if (p.phonenumber !== undefined) c.phonenumber = p.phonenumber.replace(/\D/g, "");
      if (p.country !== undefined) c.countrycode = p.country;
      return { clientid: p.clientid };
    },

    GetProducts: (p) => {
      const rows = FAKE_PRODUCTS.filter((x) => (!p.pid || p.pid.split(",").includes(x.pid)) && (!p.gid || x.gid === p.gid)).map(productRow);
      return { totalresults: String(rows.length), products: { product: rows } };
    },

    AddOrder: (p) => {
      const c = clients.get(p.clientid);
      if (!c) return fail("Client ID Not Found");
      if (!p.paymentmethod) return fail("Invalid Payment Method. Valid options include banktransfer");
      const orderid = id();
      const items: { type: string; relid: string }[] = [];
      const lines: Row[] = [];
      const serviceIds: string[] = [];
      const domainIds: string[] = [];
      for (const { key, value: pid } of indexed(p, "pid")) {
        const product = FAKE_PRODUCTS.find((x) => x.pid === pid);
        if (!product) return fail(`Product ID Not Found: ${pid}`);
        const qty = Number(p[`qty[${key}]`] ?? 1);
        const options = p[`configoptions[${key}]`] ? (unserialize(Buffer.from(p[`configoptions[${key}]`], "base64").toString()) as Record<string, string>) : {};
        // Assumed: priceoverride is the whole recurring price, options included (checked live).
        const price = p[`priceoverride[${key}]`] ?? fmt(cents(product.monthly[clientCode(p.clientid)]) * qty);
        for (let n = 0; n < qty; n++) {
          const sid = id();
          services.set(sid, { id: sid, clientid: p.clientid, orderid, pid, qty: "1", regdate: today(), nextduedate: addMonths(today(), 1), billingcycle: "Monthly", recurringamount: price, firstpaymentamount: price, status: "Pending", suspensionreason: "", domain: p[`domain[${key}]`] ?? "", options: { ...options } });
          serviceIds.push(sid);
          items.push({ type: "product", relid: sid });
          lines.push({ type: "Hosting", relid: sid, description: product.name, amount: price });
        }
      }
      for (const { key, value: name } of indexed(p, "domain")) {
        if (p[`pid[${key}]`]) continue;
        const type = p[`domaintype[${key}]`];
        const years = Number(p[`regperiod[${key}]`] ?? 1);
        const tld = name.slice(name.indexOf(".") + 1);
        const price = p[`domainpriceoverride[${key}]`] ?? fmt(cents(TLDS[tld][clientCode(p.clientid)]) * years);
        const did = id();
        domains.set(did, { id: did, userid: p.clientid, orderid, regtype: type === "transfer" ? "Transfer" : "Register", domainname: name, registrar: "", regperiod: String(years), firstpaymentamount: price, recurringamount: fmt(cents(TLDS[tld][clientCode(p.clientid)])), regdate: today(), expirydate: "0000-00-00", nextduedate: today(), status: type === "transfer" ? "Pending Transfer" : "Pending", donotrenew: "0" });
        domainIds.push(did);
        items.push({ type: "domain", relid: did });
        lines.push({ type: type === "transfer" ? "DomainTransfer" : "DomainRegister", relid: did, description: `Domain ${type} - ${name}`, amount: price });
      }
      for (const { key: did, value: years } of indexed(p, "domainrenewals")) {
        const d = domains.get(did);
        if (!d || d.userid !== p.clientid) return fail("Domain ID Not Found");
        items.push({ type: "domain", relid: did });
        lines.push({ type: "Domain", relid: did, description: `Domain Renewal - ${d.domainname} - ${years} Year/s`, amount: fmt(cents(d.recurringamount) * Number(years)) });
      }
      if (!items.length) return fail("No items added to cart so order cannot proceed");
      const invoiceid = p.noinvoice === "true" ? "0" : newInvoice(p.clientid, lines, p.paymentmethod);
      orders.set(orderid, { id: orderid, ordernum: String(9_000_000_000 + Number(orderid)), userid: p.clientid, date: nowStamp(), amount: fmt(lines.reduce((t, l) => t + cents(l.amount), 0)), status: "Pending", invoiceid, paymentmethod: p.paymentmethod, items });
      return { orderid, serviceids: serviceIds.join(","), addonids: "", domainids: domainIds.join(","), invoiceid };
    },

    AcceptOrder: (p) => {
      const o = orders.get(p.orderid);
      if (!o) return fail("Order ID not found");
      if (o.status !== "Pending") return fail("Order is not pending");
      o.status = "Active";
      for (const item of o.items) {
        if (item.type === "product") {
          const s = services.get(item.relid)!;
          const product = FAKE_PRODUCTS.find((x) => x.pid === s.pid)!;
          // Assumed: without a module WHMCS leaves the service pending.
          if (on(p.autosetup) && product.module) s.status = "Active";
        } else {
          const d = domains.get(item.relid)!;
          if (on(p.sendregistrar)) {
            d.status = "Active";
            d.expirydate = addMonths(today(), 12 * Number(d.regperiod));
          }
        }
      }
      return {};
    },

    GetOrders: (p) => {
      const rows = [...orders.values()]
        .filter((o) => (!p.id || o.id === p.id) && (!p.userid || o.userid === p.userid))
        .map(({ items, ...o }) => ({ ...o, lineitems: { lineitem: items.map((i) => ({ ...i, product: "", domain: "", billingcycle: "Monthly", amount: "0.00", status: "Pending" })) } }));
      const { page, ...rest } = paged(rows, p);
      return { ...rest, orders: { order: page } };
    },

    CancelOrder: (p) => {
      const o = orders.get(p.orderid);
      if (!o) return fail("Order ID not found");
      if (o.status !== "Pending") return fail("Order status not pending");
      // What the live install said for a bank transfer order.
      if (on(p.cancelsub)) return fail("Subscription Cancellation Failed - Please check the gateway log for further information.");
      o.status = "Cancelled";
      return {};
    },

    GetClientsProducts: (p) => {
      const rows = [...services.values()].filter((s) => (!p.clientid || s.clientid === p.clientid) && (!p.serviceid || s.id === p.serviceid)).map(serviceRow);
      const { page, ...rest } = paged(rows, p);
      return { clientid: p.clientid ?? "", serviceid: p.serviceid ?? "", ...rest, products: page.length ? { product: page } : "" };
    },

    ...Object.fromEntries(
      (["ModuleCreate", "ModuleSuspend", "ModuleUnsuspend", "ModuleTerminate"] as const).map((action) => [
        action,
        (p: Record<string, string>) => {
          const s = services.get(p.serviceid);
          if (!s) return fail("Service ID not found");
          const product = FAKE_PRODUCTS.find((x) => x.pid === s.pid)!;
          if (!product.module) return fail(options.noModuleMessage ?? "Service not assigned to a module.");
          if (options.moduleFailure) return fail(options.moduleFailure);
          s.status = { ModuleCreate: "Active", ModuleSuspend: "Suspended", ModuleUnsuspend: "Active", ModuleTerminate: "Terminated" }[action];
          s.suspensionreason = action === "ModuleSuspend" ? (p.suspendreason ?? "") : "";
          return {};
        },
      ]),
    ),

    UpgradeProduct: (p) => {
      const s = services.get(p.serviceid);
      if (!s) return fail("Service ID not found");
      if (!p.paymentmethod) return fail("Invalid Payment Method");
      if (p.type !== "configoptions") return fail("Only configoptions upgrades are faked");
      const product = FAKE_PRODUCTS.find((x) => x.pid === s.pid)!;
      const opt = optionId(product.pid);
      const newQty = Number(p[`configoptions[${opt}]`]);
      const oldQty = Number(s.options[opt] ?? 0);
      const currency = clientCode(String(s.clientid));
      const totaldays = 30;
      const daysuntilrenewal = 15;
      const priceCents = Math.round((((newQty - oldQty) * cents(product.monthly[currency])) * daysuntilrenewal) / totaldays);
      const c = CURRENCIES.find((x) => x.code === currency)!;
      const formatted = `${c.prefix}${fmt(priceCents)}${c.suffix}`;
      // The shape the live install gives for a configoptions change: no "price", no days.
      const answer: Answer = { configname1: "Users", originalvalue1: oldQty, newvalue1: `${newQty} x User`, price1: formatted, subtotal: formatted, discount: `${c.prefix}0.00${c.suffix}`, total: formatted, upgradeinprogress: 0 };
      if (p.calconly === "true") return answer;
      const orderid = id();
      // WHMCS applies the upgrade itself once the invoice is paid; the fake leaves it.
      const invoiceid = priceCents > 0 ? newInvoice(String(s.clientid), [{ type: "Upgrade", relid: s.id, description: "Upgrade: Users", amount: fmt(priceCents) }], p.paymentmethod) : null;
      orders.set(orderid, { id: orderid, ordernum: "", userid: s.clientid, date: nowStamp(), amount: fmt(Math.max(priceCents, 0)), status: "Pending", invoiceid: invoiceid ?? "0", paymentmethod: p.paymentmethod, items: [] });
      return { ...answer, id: id(), orderid: Number(orderid), order_number: "", invoiceid };
    },

    CreateInvoice: (p) => {
      if (!clients.has(p.userid)) return fail("Client ID Not Found");
      const items: Row[] = [];
      for (let n = 1; p[`itemdescription${n}`] !== undefined; n++) items.push({ type: "", relid: "0", description: p[`itemdescription${n}`], amount: p[`itemamount${n}`] ?? "0.00", taxed: on(p[`itemtaxed${n}`]) ? 1 : 0 });
      const invoiceid = newInvoice(p.userid, items, p.paymentmethod ?? "");
      return { invoiceid: Number(invoiceid), status: p.status ?? "Unpaid" };
    },

    UpdateClientProduct: (p) => {
      const s = services.get(p.serviceid);
      if (!s) return fail("Service ID Not Found");
      if (p.pid) s.pid = p.pid;
      if (p.billingcycle) s.billingcycle = p.billingcycle;
      if (p.status) s.status = p.status;
      if (p.suspendreason !== undefined) s.suspensionreason = p.suspendreason;
      if (p.recurringamount) s.recurringamount = p.recurringamount;
      if (p.configoptions) {
        const parsed = unserialize(Buffer.from(p.configoptions, "base64").toString()) as Record<string, Record<string, string> | string>;
        for (const [option, value] of Object.entries(parsed)) s.options[option] = typeof value === "object" ? value.qty : value;
      }
      return { serviceid: p.serviceid };
    },

    GetInvoices: (p) => {
      const rows = [...invoices.values()]
        .filter((i) => (!p.userid || i.userid === p.userid) && (!p.status || i.status === p.status))
        .map(({ items: _items, ...i }) => ({ ...i, id: i.invoiceid, ...invoiceTotals({ ...i, items: _items }), currencycode: clientCode(String(i.userid)), balance: undefined }));
      const { page, ...rest } = paged(rows, p);
      return { ...rest, invoices: page.length ? { invoice: page } : "" };
    },

    GetInvoice: (p) => {
      const inv = invoices.get(p.invoiceid);
      if (!inv) return fail("Invoice ID Not Found");
      const txns = transactions.filter((t) => t.invoiceid === inv.invoiceid);
      return { ...inv, ...invoiceTotals(inv), items: { item: inv.items }, transactions: txns.length ? { transaction: txns } : "" };
    },

    UpdateInvoice: (p) => {
      const inv = invoices.get(p.invoiceid);
      if (!inv) return fail("Invoice ID Not Found");
      if (p.status) inv.status = p.status;
      // Assumed: like most WHMCS fields, an empty value is ignored.
      if (p.notes) inv.notes = p.notes;
      for (let n = 0; p[`newitemdescription[${n}]`] !== undefined; n++) {
        inv.items.push({ type: "", relid: "0", description: p[`newitemdescription[${n}]`], amount: p[`newitemamount[${n}]`] ?? "0.00", taxed: on(p[`newitemtaxed[${n}]`]) ? 1 : 0 });
      }
      return { invoiceid: p.invoiceid };
    },

    AddInvoicePayment: (p) => {
      const inv = invoices.get(p.invoiceid);
      if (!inv) return fail("Invoice ID Not Found");
      for (const field of ["transid", "gateway", "date"]) if (!p[field]) return fail(`${field} is required`);
      transactions.push({ id: id(), userid: inv.userid, currency: "0", gateway: p.gateway, date: p.date, description: `Invoice Payment`, amountin: p.amount ?? invoiceTotals(inv).balance, fees: "0.00", amountout: "0.00", rate: "1.00000", transid: p.transid, invoiceid: inv.invoiceid, refundid: "0" });
      if (cents(invoiceTotals(inv).balance) <= 0) {
        inv.status = "Paid";
        inv.datepaid = nowStamp();
      }
      return {};
    },

    GetTransactions: (p) => {
      const rows = transactions.filter((t) => (!p.clientid || t.userid === p.clientid) && (!p.invoiceid || t.invoiceid === p.invoiceid));
      return { totalresults: rows.length, startnumber: 0, numreturned: rows.length, transactions: rows.length ? { transaction: rows } : "" };
    },

    GetPayMethods: (p) => (clients.has(p.clientid) ? { clientid: p.clientid, paymethods: [] } : fail("Client Not Found")),

    DomainWhois: (p) => {
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(p.domain ?? "")) return fail("Domain not valid");
      return { status: TAKEN.includes(p.domain) ? "unavailable" : "available", whois: "" };
    },

    GetClientsDomains: (p) => {
      const rows = [...domains.values()].filter((d) => (!p.clientid || d.userid === p.clientid) && (!p.domainid || d.id === p.domainid) && (!p.domain || d.domainname === p.domain));
      const { page, ...rest } = paged(rows, p);
      return { clientid: p.clientid ?? "", domainid: p.domainid ?? "", ...rest, domains: page.length ? { domain: page } : "" };
    },

    GetTLDPricing: (p) => {
      const c = CURRENCIES.find((x) => x.id === p.currencyid) ?? CURRENCIES[0];
      const year = (price: string) => ({ "1": price, "2": fmt(cents(price) * 2) });
      return {
        currency: { ...c, format: "1", rate: "1.00000" },
        pricing: Object.fromEntries(
          Object.entries(TLDS)
            .filter(([, prices]) => prices[c.code])
            .map(([tld, prices]) => [tld, { categories: ["Other"], addons: {}, group: "", register: year(prices[c.code]), transfer: year(prices[c.code]), renew: year(renewals[tld][c.code]), grace_period: null, redemption_period: null }]),
        ),
      };
    },

    CreateOrUpdateTLD: (p) => {
      if (!p.extension?.startsWith(".")) return fail("Extension must start with a dot");
      if (!CURRENCIES.some((c) => c.code === p.currency_code)) return fail("Invalid currency code");
      const tld = p.extension.slice(1);
      TLDS[tld] = { ...(TLDS[tld] ?? {}), [p.currency_code]: p["register[1]"] };
      renewals[tld] = { ...(renewals[tld] ?? {}), [p.currency_code]: p["renew[1]"] };
      return { extension: p.extension, id: "1" };
    },
  };

  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const params = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    if (dropped < (options.dropFirst ?? 0)) {
      dropped++;
      throw new TypeError("fetch failed");
    }
    const { action, identifier, secret, responsetype, ...rest } = params;
    calls.push({ action, params: rest });
    const json = (body: Answer) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (options.failWith) return json(fail(options.failWith));
    if (identifier !== FAKE_CREDENTIALS.identifier || secret !== FAKE_CREDENTIALS.secret) return json(fail("Authentication Failed"));
    if (responsetype !== "json") return new Response("result=error", { status: 200 });
    const handler = actions[action];
    if (!handler) return json(fail(`Command Not Found`));
    const answer = handler(rest);
    return json(answer.result ? answer : { result: "success", ...answer });
  }) as typeof fetch;

  return { fetcher, calls, clients, services, invoices, orders, domains };
}
