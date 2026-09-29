import { TriangleAlert } from "lucide-react";
import { Fragment } from "react";
import type { LegalDocument } from "@/server/site/legal";

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/** Emails in a run of text, as links. */
function withEmails(text: string, key: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(EMAIL)) {
    const email = m[0].replace(/\.$/, "");
    out.push(text.slice(last, m.index));
    out.push(
      <a key={`${key}-${m.index}`} href={`mailto:${email}`} className="text-link underline">
        {email}
      </a>,
    );
    last = m.index + email.length;
  }
  out.push(text.slice(last));
  return out;
}

/** **Bold** and email addresses; everything else stays plain text. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="font-semibold text-ink">
            {withEmails(part.slice(2, -2), `b${i}`)}
          </strong>
        ) : (
          <Fragment key={i}>{withEmails(part, `t${i}`)}</Fragment>
        ),
      )}
    </>
  );
}

/** The banner kept on a legal page until the text is approved and the line taken out of its file. */
export function DraftBanner({ text }: { text: string }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-lg border border-warning bg-warning-soft p-4">
      <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <p className="text-callout font-semibold text-ink">{text}</p>
    </div>
  );
}

/** A market's legal page, from its file in content/legal. */
export function LegalBody({ doc }: { doc: LegalDocument }) {
  return (
    <div className="flex flex-col gap-4 text-body text-ink-body">
      {doc.updated ? <p className="text-callout text-ink-muted">{doc.updated}</p> : null}
      {doc.blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <h2 key={i} id={b.id} className="mt-4 scroll-mt-24 text-title-2 text-ink">
                {b.text}
              </h2>
            );
          case "paragraph":
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
          case "list":
            return (
              <ul key={i} className="flex list-disc flex-col gap-2 pl-6">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-144 border-collapse text-left text-callout">
                  <thead className="bg-surface-2">
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} scope="col" className="px-4 py-3 font-semibold text-ink">
                          <Inline text={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j} className="border-t border-border">
                        {row.map((c, k) => (
                          <td key={k} className="px-4 py-3 align-top">
                            <Inline text={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
