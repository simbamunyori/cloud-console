import { Fragment } from "react";
import { DELETION_NOTICE_DAYS } from "@/config/app";
import { cn } from "@/lib/cn";

/**
 * Rich text from the website editor, drawn in the site's own type styles.
 * Words in braces are filled in from the market's settings, so text stays
 * right when those change:
 *   {market}               the market's name, e.g. Botswana
 *   {support-email}        its support address
 *   {data-protection-law}  its data protection law
 *   {deletion-notice-days} days' notice before anything is deleted
 */

export interface TextMarket {
  name: string;
  supportEmail: string;
  dataProtectionLaw?: string | null;
  currency?: string;
}

export function fill(text: string, m: TextMarket): string {
  return text
    .replaceAll("{market}", m.name)
    .replaceAll("{support-email}", m.supportEmail)
    .replaceAll("{data-protection-law}", m.dataProtectionLaw ?? "data protection law")
    .replaceAll("{deletion-notice-days}", String(DELETION_NOTICE_DAYS))
    .replaceAll("{currency}", m.currency ?? "your currency");
}

type Node = {
  type: string;
  text?: string;
  format?: number | string;
  tag?: string;
  listType?: string;
  headerState?: number;
  fields?: { url?: string; newTab?: boolean };
  children?: Node[];
};

const BOLD = 1;
const ITALIC = 2;

/** "1. Who we are" → "who-we-are", as the old legal files made them, so links to sections keep working. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const plain = (n: Node): string => (n.text ?? "") + (n.children ?? []).map(plain).join("");

const safeHref = (url: string) => (/^(https?:|mailto:|tel:|\/|#)/.test(url) && !url.startsWith("//") ? url : "#");

export type RichTextStyle = "legal" | "prose" | "block" | "block-dark";

function Nodes({ nodes, m, style, ids }: { nodes: Node[] | undefined; m: TextMarket; style: RichTextStyle; ids: Set<string> }) {
  const strongClass = style === "block-dark" ? "font-semibold text-on-navy" : "font-semibold text-ink";
  const linkClass = style === "block-dark" ? "font-semibold text-on-navy underline" : "text-link underline";
  return (
    <>
      {(nodes ?? []).map((n, i) => {
        const kids = <Nodes nodes={n.children} m={m} style={style} ids={ids} />;
        switch (n.type) {
          case "text": {
            let out: React.ReactNode = fill(n.text ?? "", m);
            const f = typeof n.format === "number" ? n.format : 0;
            if (f & ITALIC) out = <em>{out}</em>;
            if (f & BOLD) out = <strong className={strongClass}>{out}</strong>;
            return <Fragment key={i}>{out}</Fragment>;
          }
          case "linebreak":
            return <br key={i} />;
          case "paragraph":
            return <p key={i}>{kids}</p>;
          case "heading": {
            let id = slugify(fill(plain(n), m)) || "section";
            while (ids.has(id)) id += "-2";
            ids.add(id);
            const Tag = n.tag === "h3" ? "h3" : "h2";
            return (
              <Tag key={i} id={id} className={cn("scroll-mt-24", Tag === "h2" ? "text-title-2" : "text-headline", style === "legal" && "mt-4", style === "block-dark" ? "text-on-navy" : "text-ink")}>
                {kids}
              </Tag>
            );
          }
          case "list": {
            const Tag = n.listType === "number" ? "ol" : "ul";
            return (
              <Tag key={i} className={cn("flex flex-col gap-2 pl-6", Tag === "ol" ? "list-decimal" : "list-disc")}>
                {kids}
              </Tag>
            );
          }
          case "listitem":
            return <li key={i}>{kids}</li>;
          case "link":
          case "autolink": {
            const href = safeHref(fill(n.fields?.url ?? "", m));
            return (
              <a key={i} href={href} className={linkClass} {...(n.fields?.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {kids}
              </a>
            );
          }
          case "table": {
            const rows = n.children ?? [];
            const headed = rows[0]?.children?.every((c) => (c.headerState ?? 0) > 0);
            const cell = (c: Node, j: number, head: boolean) => {
              const inner = (c.children ?? []).flatMap((p) => (p.type === "paragraph" ? (p.children ?? []) : [p]));
              return head ? (
                <th key={j} scope="col" className="px-4 py-3 font-semibold text-ink">
                  <Nodes nodes={inner} m={m} style={style} ids={ids} />
                </th>
              ) : (
                <td key={j} className="px-4 py-3 align-top">
                  <Nodes nodes={inner} m={m} style={style} ids={ids} />
                </td>
              );
            };
            return (
              <div key={i} className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-144 border-collapse text-left text-callout">
                  {headed ? (
                    <thead className="bg-surface-2">
                      <tr>{rows[0].children!.map((c, j) => cell(c, j, true))}</tr>
                    </thead>
                  ) : null}
                  <tbody>
                    {rows.slice(headed ? 1 : 0).map((r, j) => (
                      <tr key={j} className="border-t border-border">
                        {(r.children ?? []).map((c, k) => cell(c, k, false))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          default:
            return <Fragment key={i}>{kids}</Fragment>;
        }
      })}
    </>
  );
}

const WRAPPER: Record<RichTextStyle, string> = {
  legal: "flex flex-col gap-4 text-body text-ink-body",
  prose: "flex flex-col gap-3 text-body text-ink-body",
  block: "flex max-w-3xl flex-col gap-4 text-body text-ink-body",
  "block-dark": "flex max-w-3xl flex-col gap-4 text-body",
};

/** Rich text as the site shows it. `before` goes first inside the same column (e.g. a "Last updated" line). */
export function SiteRichText({ data, market, style, before }: { data: unknown; market: TextMarket; style: RichTextStyle; before?: React.ReactNode }) {
  const root = (data as { root?: Node } | null)?.root;
  return (
    <div className={WRAPPER[style]}>
      {before}
      <Nodes nodes={root?.children} m={market} style={style} ids={new Set()} />
    </div>
  );
}
