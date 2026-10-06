import tokens from "@/config/theme/tokens.json";
import { company } from "@/config/app";
import { companyDetails } from "@/server/company/company";

/**
 * The frame every email shares. Email clients ignore stylesheets, so the
 * token values are written inline here, still read from tokens.json.
 */

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface EmailBody {
  heading: string;
  /** Plain paragraphs. Escaped. */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Small print under the button. */
  footnote?: string;
  /** Label and value rows, e.g. an amount and a reference. */
  facts?: [string, string][];
  /** Articles, each a linked title with a line under it (the newsletter). */
  items?: { title: string; summary: string; url: string }[];
}

/** Who the email is from, from Admin > Company: the logo and the small print under every email. */
export interface EmailBrand {
  name: string;
  logoUrl: string;
  footer: string[];
}

export async function emailBrand(db: Parameters<typeof companyDetails>[0], appUrl: string): Promise<EmailBrand> {
  const c = await companyDetails(db).catch(() => null);
  if (!c) return defaultBrand(appUrl);
  return {
    name: c.tradingName,
    // A PNG: not every email app shows SVG images.
    logoUrl: `${appUrl}/api/company/logo/light`,
    footer: [`${c.legalName} · Registration ${c.registrationNumber}`, c.addressLines.join(", "), [c.email, c.phone, c.website?.replace(/^https:\/\//, "")].filter(Boolean).join(" · ")],
  };
}

const defaultBrand = (appUrl: string): EmailBrand => ({ name: company.name, logoUrl: `${appUrl}/brand/logo/fgt-logo.svg`, footer: [company.legalName] });

export function renderEmail(body: EmailBody, appUrl: string, brand: EmailBrand = defaultBrand(appUrl)): { text: string; html: string } {
  const t = tokens.light;
  const font = tokens.font.family;
  const factsText = body.facts?.map(([k, v]) => `${k}: ${v}`).join("\n");
  const text = [
    body.heading,
    "",
    ...body.paragraphs.flatMap((p) => [p, ""]),
    ...(body.items ?? []).flatMap((i) => [i.title, i.summary, i.url, ""]),
    ...(factsText ? [factsText, ""] : []),
    ...(body.button ? [`${body.button.label}: ${body.button.url}`, ""] : []),
    ...(body.footnote ? [body.footnote, ""] : []),
    brand.name,
    appUrl,
    "",
    ...brand.footer,
  ].join("\n");

  const facts = body.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse;width:100%">${body.facts
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;border-bottom:1px solid ${t.border};color:${t.textMuted};font-size:14px">${escapeHtml(k)}</td><td style="padding:8px 0;border-bottom:1px solid ${t.border};color:${t.text};font-size:14px;text-align:right;font-weight:600">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const items = (body.items ?? [])
    .map(
      (i) =>
        `<div style="margin:0 0 20px;padding:0 0 20px;border-bottom:1px solid ${t.border}"><p style="margin:0 0 6px;font-size:18px;line-height:26px;font-weight:600"><a href="${escapeHtml(i.url)}" style="color:${t.primaryText};text-decoration:none">${escapeHtml(i.title)}</a></p><p style="margin:0;font-size:15px;line-height:22px;color:${t.textMuted}">${escapeHtml(i.summary)}</p></div>`,
    )
    .join("");
  const button = body.button
    ? `<p style="margin:0 0 24px"><a href="${escapeHtml(body.button.url)}" style="display:inline-block;background:${tokens.console.light.primaryFill};color:${t.onPrimary};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:${tokens.radius.md}">${escapeHtml(body.button.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:${tokens.console.light.page};font-family:${font};color:${t.text}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${t.bg};border:1px solid ${t.border};border-radius:${tokens.radius.lg}">
<tr><td style="padding:32px">
<img src="${escapeHtml(brand.logoUrl)}" width="168" height="44" alt="${escapeHtml(brand.name)}" style="display:block;margin:0 0 32px;height:auto">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;letter-spacing:${tokens.font.headlineTracking};color:${t.text}">${escapeHtml(body.heading)}</h1>
${body.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px">${escapeHtml(p)}</p>`).join("")}
${items}${facts}${button}
${body.footnote ? `<p style="margin:0;font-size:14px;line-height:20px;color:${t.textMuted}">${escapeHtml(body.footnote)}</p>` : ""}
</td></tr></table>
${brand.footer.map((line, i) => `<p style="margin:${i ? 2 : 16}px 0 0;font-size:12px;line-height:18px;color:${t.textMuted}">${escapeHtml(line)}</p>`).join("")}
</td></tr></table></body></html>`;
  return { text, html };
}
