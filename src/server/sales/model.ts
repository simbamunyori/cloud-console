import "server-only";
import { assistantModel, type AssistantModel, type ModelBlock, type ModelRequest } from "@/server/support/assistant/model";

/**
 * The model behind Thapelo: the same AI service as the support assistant
 * (ANTHROPIC_API_KEY). Demo and CI servers can set SALES_ASSISTANT_DEMO=yes
 * for a scripted stand-in that uses the real tools, so the panel can be
 * tried and tested without an AI bill. A production server refuses it.
 */
export function salesModel(): AssistantModel | null {
  if (process.env.SALES_ASSISTANT_DEMO === "yes" && (process.env.NODE_ENV !== "production" || process.env.ALLOW_PLACEHOLDERS === "yes")) return demoModel;
  return assistantModel();
}

const text = (t: string): ModelBlock[] => [{ type: "text", text: t }];

/** Picks a tool from the visitor's words, then reads its result back plainly. */
export const demoModel: AssistantModel = {
  async respond(req: ModelRequest) {
    const last = req.messages[req.messages.length - 1];
    if (Array.isArray(last.content) && last.content[0]?.type === "tool_result") {
      const result = JSON.parse(last.content[0].content) as Record<string, unknown>;
      if (Array.isArray(result.results) && result.results[0] && "state" in (result.results[0] as object)) {
        const r = result.results[0] as { name: string; state: string; price: string | null };
        return { content: text(r.state === "available" ? `${r.name} is free, at ${r.price} a year.` : `${r.name} is taken.`), stopReason: "end_turn" };
      }
      if (Array.isArray(result.products)) {
        const list = (result.products as { name: string; price: string; per: string }[]).slice(0, 3).map((p) => `${p.name}: ${p.price} ${p.per}`);
        return { content: text(list.length ? `Here's some of what we offer. ${list.join(". ")}.` : "Nothing is on sale here yet."), stopReason: "end_turn" };
      }
      if (result.shown) return { content: text("Leave your details in the form below and someone from our team will contact you."), stopReason: "end_turn" };
      const found = (result.results as { title: string }[] | undefined) ?? [];
      return { content: text(found.length ? `This might help: ${found[0].title}.` : "I don't know that one. I can put you in touch with a person."), stopReason: "end_turn" };
    }
    const q = typeof last.content === "string" ? last.content.toLowerCase() : "";
    const domain = q.match(/\b[a-z0-9-]+(\.[a-z]{2,})+\b/)?.[0];
    const call = (name: string, input: Record<string, unknown>): ModelBlock[] => [{ type: "tool_use", id: `demo-${Date.now()}`, name, input }];
    if (domain || q.includes("domain")) return { content: call("check_domain", { name: domain ?? (q.replace(/.*domain\s*/, "").split(/\s/)[0] || "example") }), stopReason: "tool_use" };
    if (q.includes("person") || q.includes("human")) return { content: call("offer_contact", { reason: "person", summary: q }), stopReason: "tool_use" };
    if (/plan|price|cost|email/.test(q)) return { content: call("list_products", {}), stopReason: "tool_use" };
    return { content: call("search_site", { query: q }), stopReason: "tool_use" };
  },
};
