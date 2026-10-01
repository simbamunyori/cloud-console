/** The words of a rich text document (Payload's Lexical JSON), paragraphs on their own lines. */
export function richTextPlain(value: unknown): string {
  const out: string[] = [];
  const walk = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { type?: string; text?: unknown; children?: unknown[] };
    if (typeof n.text === "string") return n.text;
    const inner = Array.isArray(n.children) ? n.children.map(walk).join(n.type === "list" ? "\n" : "") : "";
    return n.type === "listitem" ? `- ${inner}` : inner;
  };
  const root = (value as { root?: { children?: unknown[] } } | null)?.root;
  for (const block of root?.children ?? []) {
    const text = walk(block).trim();
    if (text) out.push(text);
  }
  return out.join("\n");
}
