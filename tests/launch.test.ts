import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { campaignReport, decodeTouch, encodeTouch, recordCampaign, touchFrom, tracked } from "../src/server/campaigns/campaigns";
import { saveProduct } from "../src/server/admin/catalogue";
import { TEMPLATES } from "../src/server/email/templates";
import { deliverDue } from "../src/server/email/outbox";
import { MemoryEmailAdapter } from "../src/server/email/adapter";
import { approveLinkedin, approvePage, houseStyle, kitLinks, kitMarket, launchCampaign, saveKit, templateDrafts, writeDrafts, type LaunchActor } from "../src/server/launch/kits";
import { issueEmail, prepareIssues, previousMonth, saveIssue, sendIssue } from "../src/server/newsletter/issues";
import { unsubscribe } from "../src/server/newsletter/newsletter";
import { DomainError } from "../src/server/org/access";
import type { AssistantModel, ModelRequest } from "../src/server/support/assistant/model";
import { db, hasDb } from "./helpers";

const tag = () => randomBytes(4).toString("hex");

describe("tracked links", () => {
  it("keeps only clean tags, and needs a campaign", () => {
    expect(touchFrom({ campaign: "Launch-M365", source: "LinkedIn", medium: "social" })).toEqual({ campaign: "launch-m365", source: "linkedin", medium: "social" });
    expect(touchFrom({ campaign: "", source: "linkedin" })).toBeNull();
    expect(touchFrom({ campaign: "<script>", source: "x" })).toBeNull();
    expect(touchFrom({ campaign: "ok", source: "bad value" })).toEqual({ campaign: "ok", source: null, medium: null });
  });

  it("round-trips through the cookie and tags a link", () => {
    const t = { campaign: "launch-x", source: "google", medium: "cpc" };
    expect(decodeTouch(encodeTouch(t))).toEqual(t);
    expect(decodeTouch("|x|y")).toBeNull();
    const url = new URL(tracked("https://console.example/bw/products/x?a=1", { ...t, content: "hero" }));
    expect(Object.fromEntries(url.searchParams)).toEqual({ a: "1", utm_source: "google", utm_medium: "cpc", utm_campaign: "launch-x", utm_content: "hero" });
  });

  it("gives every kit channel its own tags, on the default market when the product is sold there", () => {
    const links = kitLinks("https://console.example/", "bw", "m365", launchCampaign("m365"));
    expect(links.map((l) => l.key)).toEqual(["linkedin-post", "linkedin-ad", "facebook-ad", "google-ad", "newsletter", "signature"]);
    expect(links[0].url).toBe("https://console.example/bw/products/m365?utm_source=linkedin&utm_medium=social&utm_campaign=launch-m365");
    expect(kitMarket(["za", "bw"], "bw")).toBe("bw");
    expect(kitMarket(["za"], "bw")).toBe("za");
  });

  it("writes in house style whatever the model sends", () => {
    expect(houseStyle("Fast — and safe!")).toBe("Fast, and safe.");
  });
});

class DraftModel implements AssistantModel {
  requests: ModelRequest[] = [];
  async respond(request: ModelRequest) {
    this.requests.push(request);
    return {
      stopReason: "tool_use",
      content: [
        {
          type: "tool_use" as const,
          id: "t1",
          name: "save_drafts",
          input: {
            audience: "Small teams!",
            faq: [{ question: "Can we keep our address?", answer: "Yes — we move it." }, { question: "", answer: "dropped" }],
            insight_title: "Why we offer it",
            insight_summary: "A summary.",
            insight_topic: "not-a-topic",
            insight_markdown: "## Heading\n\nA paragraph.",
            linkedin: "Now available!",
          },
        },
      ],
    };
  }
}

function fakePayload() {
  const created: Record<string, unknown>[] = [];
  return {
    created,
    async find() {
      return { totalDocs: 0, docs: [] } as never;
    },
    async create(args: { data: Record<string, unknown> }) {
      created.push(args.data);
      return { id: created.length, ...args.data } as never;
    },
  };
}

describe.skipIf(!hasDb)("launch kits", () => {
  const slugs: string[] = [];
  let publisher: LaunchActor;
  let editor: LaunchActor;

  async function liveProduct() {
    const slug = `launch-test-${tag()}`;
    slugs.push(slug);
    const admin = await db.user.findFirstOrThrow({ where: { staffRole: "ADMIN" } });
    publisher = { userId: admin.id, name: admin.name, staffRole: "ADMIN", websiteRole: "PUBLISHER" };
    editor = { ...publisher, websiteRole: "EDITOR" };
    const category = await db.productCategory.findFirstOrThrow({ where: { family: { fulfilment: null } } });
    await saveProduct({ db, staff: publisher, month: "2026-09" }, {
      slug,
      name: "Launch test product",
      summary: "For the launch kit tests.",
      includes: "One thing\nAnother thing",
      excludes: "",
      categoryKey: category.key,
      unitLabel: "per site",
      quantityAllowed: false,
      minQuantity: "1",
      setupHours: "4",
      minTermMonths: "1",
      commitmentNote: "",
      cost: "100",
      costCurrency: "USD",
      fixedPrice: "",
      fixedPriceCurrency: "USD",
      markets: [],
      fulfilment: "QUOTE",
      status: "DRAFT",
      sortOrder: "900",
    });
    return slug;
  }

  afterAll(async () => {
    if (slugs.length) await db.product.deleteMany({ where: { slug: { in: slugs } } });
  });

  it("prepares a kit when a product goes live, once", async () => {
    const slug = await liveProduct();
    const product = await db.product.findUniqueOrThrow({ where: { slug } });
    expect(await db.launchKit.findUnique({ where: { productId: product.id } })).toBeNull();
    const base = { name: product.name, summary: product.summary, includes: "One thing", excludes: "", categoryKey: product.categoryKey, unitLabel: "per site", quantityAllowed: false, minQuantity: "1", setupHours: "4", minTermMonths: "1", commitmentNote: "", cost: "100", costCurrency: "USD", fixedPrice: "", fixedPriceCurrency: "USD", markets: ["bw"], fulfilment: "QUOTE", sortOrder: "900", slug };
    const live = await saveProduct({ db, staff: publisher, month: "2026-09" }, { ...base, status: "LIVE" }, slug);
    expect(live.launched).toBe(true);
    const kit = await db.launchKit.findUniqueOrThrow({ where: { productId: product.id } });
    expect(kit.campaign).toBe(`launch-${slug}`);
    const again = await saveProduct({ db, staff: publisher, month: "2026-09" }, { ...base, summary: "Changed.", status: "LIVE" }, slug);
    expect(again.launched).toBe(false);
  });

  it("writes drafts with the model, filling only what is empty, and never twice", async () => {
    const slug = await liveProduct();
    const product = await db.product.update({ where: { slug }, data: { status: "LIVE", markets: ["bw"] } });
    await db.launchKit.create({ data: { productId: product.id, campaign: launchCampaign(slug), linkedinText: "Written by hand." } });
    const model = new DraftModel();
    const payload = fakePayload();
    await writeDrafts({ db, payload, model, only: { productId: product.id } });
    const kit = await db.launchKit.findUniqueOrThrow({ where: { productId: product.id } });
    expect(kit.audience).toBe("Small teams.");
    expect(kit.faq).toEqual([{ question: "Can we keep our address?", answer: "Yes, we move it." }]);
    expect(kit.linkedinText).toBe("Written by hand.");
    expect(kit.draftError).toBeNull();
    expect(kit.insightId).toBeTruthy();
    const insight = payload.created.find((c) => (c.related as { products: string[] }).products[0] === slug)!;
    expect(insight).toMatchObject({ title: "Why we offer it", topic: "productivity", _status: "draft" });
    // The model was told the facts and told not to invent prices.
    const request = model.requests.find((r) => JSON.stringify(r.messages).includes(slug) || JSON.stringify(r.messages).includes("One thing"))!;
    expect(request.forceTool).toBe("save_drafts");
    expect(request.system).toMatch(/Never state a price/);
    const before = payload.created.length;
    await writeDrafts({ db, payload, model, only: { productId: product.id } });
    expect(payload.created.filter((c) => (c.related as { products: string[] }).products[0] === slug)).toHaveLength(1);
    expect(payload.created.length).toBeGreaterThanOrEqual(before);
  });

  it("falls back to plain drafts without an AI service, and says so", async () => {
    const slug = await liveProduct();
    const product = await db.product.update({ where: { slug }, data: { status: "LIVE" } });
    await db.launchKit.create({ data: { productId: product.id, campaign: launchCampaign(slug) } });
    await writeDrafts({ db, payload: fakePayload(), model: null, only: { productId: product.id } });
    const kit = await db.launchKit.findUniqueOrThrow({ where: { productId: product.id } });
    expect(kit.draftError).toMatch(/No AI service/);
    expect(kit.linkedinText).toContain("Launch test product");
    expect(templateDrafts({ ...product, category: { name: "X" } }).audience).toBe("");
  });

  it("only a Publisher approves, and an Editor's change sends it back", async () => {
    const slug = await liveProduct();
    const product = await db.product.update({ where: { slug }, data: { status: "LIVE" } });
    const kit = await db.launchKit.create({ data: { productId: product.id, campaign: launchCampaign(slug), linkedinText: "Post." } });
    await expect(approvePage(db, editor, kit.id, true)).rejects.toBeInstanceOf(DomainError);
    await expect(approvePage(db, publisher, kit.id, true)).rejects.toThrow(/who the product is for/);
    await saveKit(db, editor, kit.id, { audience: "Small teams", faq: [], linkedinText: "Post." });
    await approvePage(db, publisher, kit.id, true);
    await approveLinkedin(db, publisher, kit.id);
    // A Publisher's own edit keeps the approvals.
    await saveKit(db, publisher, kit.id, { audience: "Small teams of five", faq: [], linkedinText: "Post." });
    let row = await db.launchKit.findUniqueOrThrow({ where: { id: kit.id } });
    expect(row.pageApprovedAt).not.toBeNull();
    // An Editor's change to the post withdraws only the post's approval.
    await saveKit(db, editor, kit.id, { audience: "Small teams of five", faq: [], linkedinText: "A new post." });
    row = await db.launchKit.findUniqueOrThrow({ where: { id: kit.id } });
    expect(row.pageApprovedAt).not.toBeNull();
    expect(row.linkedinApprovedAt).toBeNull();
    const audit = await db.staffAuditEvent.findMany({ where: { action: { startsWith: "launch." }, data: { path: ["kit"], equals: kit.id } } });
    expect(audit.map((a) => a.action)).toContain("launch.page-approved");
  });

  it("counts a campaign's visits, leads and sign-ups", async () => {
    const campaign = `test-${tag()}`;
    await recordCampaign(db, { campaign, source: "linkedin", medium: "social" }, "VISIT");
    await recordCampaign(db, { campaign, source: "linkedin", medium: "social" }, "VISIT");
    await recordCampaign(db, { campaign, source: "google", medium: "cpc" }, "VISIT");
    await recordCampaign(db, { campaign, source: "google", medium: "cpc" }, "LEAD", "LEAD-1");
    await recordCampaign(db, null, "LEAD");
    const r = await campaignReport(db, campaign);
    expect(r).toMatchObject({ visits: 3, leads: 1, quotes: 0, signUps: 0, orders: 0 });
    expect(r.bySource[0]).toEqual({ label: "linkedin / social", visits: 2 });
    await db.campaignEvent.deleteMany({ where: { campaign } });
  });
});

describe.skipIf(!hasDb)("monthly newsletter", () => {
  const market = `n${tag().slice(0, 5)}`;
  afterAll(async () => {
    await db.newsletterIssue.deleteMany({ where: { OR: [{ market }, { month: "2001-01" }] } });
    await db.newsletterSubscriber.deleteMany({ where: { marketCode: market } });
  });

  it("prepares last month's issue from what was published, once", async () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    const payload = {
      async find() {
        return { docs: [{ slug: "a", title: "An article", summary: "Short.", topic: "resilience" }] } as never;
      },
    };
    const now = new Date("2001-02-03T10:00:00Z");
    const first = await prepareIssues({ db, payload, now });
    expect(first).toBeGreaterThan(0);
    expect(await prepareIssues({ db, payload, now })).toBe(0);
    const issue = await db.newsletterIssue.findFirstOrThrow({ where: { month: "2001-01", market: "bw" } });
    expect(issue.status).toBe("DRAFT");
  });

  it("sends once, to confirmed subscribers, with tracked links and one-click unsubscribe", async () => {
    const admin = await db.user.findFirstOrThrow({ where: { staffRole: "ADMIN" } });
    const publisher = { userId: admin.id, name: admin.name, staffRole: "ADMIN" as const, websiteRole: "PUBLISHER" as const };
    const make = (email: string, confirmed: boolean) =>
      db.newsletterSubscriber.create({ data: { email: `${tag()}-${email}`, marketCode: market, consentText: "yes", consentAt: new Date(), unsubscribeToken: tag() + tag(), confirmedAt: confirmed ? new Date() : null } });
    const yes = await make("yes@example.co.bw", true);
    await make("no@example.co.bw", false);
    const issue = await db.newsletterIssue.create({ data: { market, month: "2026-08", subject: "Insights", intro: "Hello", items: [{ slug: "backups", title: "Backups", summary: "Test them.", topic: null }] } });

    await expect(sendIssue(db, { ...publisher, websiteRole: "EDITOR" }, issue.id)).rejects.toThrow(/Publisher/);
    expect(await sendIssue(db, publisher, issue.id)).toBe(1);
    await expect(sendIssue(db, publisher, issue.id)).rejects.toThrow(/already been sent/);
    await expect(saveIssue(db, publisher, issue.id, { subject: "Changed", intro: "" })).rejects.toThrow(/sent/);

    const mail = new MemoryEmailAdapter();
    await deliverDue(db, mail, new Date(), 10, { kind: "newsletter.issue", toAddress: yes.email });
    expect(mail.sent).toHaveLength(1);
    const sent = mail.sent[0];
    expect(sent.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.headers?.["List-Unsubscribe"]).toContain(`/api/newsletter/unsubscribe/${yes.unsubscribeToken}`);
    expect(sent.text).toContain(`utm_campaign=newsletter-2026-08`);
    expect(sent.text).toContain(`/${market}/newsletter/unsubscribe/`);

    // After unsubscribing, a copy still queued is not sent.
    await unsubscribe(db, yes.unsubscribeToken);
    expect(await issueEmail(db, "https://console.example", issue.id, yes.id)).toBeNull();
    expect(TEMPLATES["newsletter.issue"]).toBeTypeOf("function");
  });
});
