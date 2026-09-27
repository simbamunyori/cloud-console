import { describe, expect, it } from "vitest";
import { MemoryEmailAdapter, type EmailAdapter } from "../src/server/email/adapter";
import { deliverDue, queueEmail } from "../src/server/email/outbox";
import { inviteMember, revokeInvitation } from "../src/server/org/members";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

describe.skipIf(!hasDb)("email outbox", () => {
  it("sends an invitation with a link minted at send time", async () => {
    const org = await makeOrganisation("Maun Safaris");
    const email = uniqueEmail("guest");
    const inv = await inviteMember(org.tenant, org.organisationId, org.owner, { email, role: "ADMIN" });
    expect((await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).tokenHash).toBeNull();

    const adapter = new MemoryEmailAdapter();
    await deliverDue(db, adapter, new Date(), 50, { toAddress: email });
    const [message] = adapter.sent.filter((m) => m.to === email);
    expect(message.to).toBe(email);
    expect(message.subject).toContain("Maun Safaris");
    expect(message.text).toMatch(/\/invite\/[\w-]+/);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).tokenHash).not.toBeNull();
    // The stored row keeps no link.
    const row = await db.outboundEmail.findFirstOrThrow({ where: { toAddress: email } });
    expect(JSON.stringify(row.payload)).not.toMatch(/invite\//);
    expect(row.status).toBe("SENT");
  });

  it("drops an invitation withdrawn before it went out", async () => {
    const org = await makeOrganisation();
    const email = uniqueEmail("gone");
    const inv = await inviteMember(org.tenant, org.organisationId, org.owner, { email, role: "ADMIN" });
    await revokeInvitation(org.tenant, org.organisationId, org.owner, inv.id);
    const adapter = new MemoryEmailAdapter();
    await deliverDue(db, adapter, new Date(), 50, { toAddress: email });
    expect(adapter.sent.filter((m) => m.to === email)).toEqual([]);
    expect((await db.outboundEmail.findFirstOrThrow({ where: { toAddress: email } })).status).toBe("FAILED");
  });

  it("retries with backoff, then gives up", async () => {
    const org = await makeOrganisation();
    const to = uniqueEmail("flaky");
    await queueEmail(db, { organisationId: org.organisationId, to, kind: "security.locked", payload: { until: new Date().toISOString() } });
    const broken: EmailAdapter = { send: async () => { throw new Error("Mail server down"); } };
    let now = new Date(Date.now() + 1000);
    for (let i = 0; i < 6; i++) {
      await deliverDue(db, broken, now, 50, { toAddress: to });
      now = new Date(now.getTime() + 60 * 60_000);
    }
    const row = await db.outboundEmail.findFirstOrThrow({ where: { toAddress: to } });
    expect(row.attempts).toBe(6);
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toBe("Mail server down");
  });

  it("refuses a kind with no template", async () => {
    await expect(queueEmail(db, { to: "a@example.co.bw", kind: "nope", payload: {} })).rejects.toThrow(/template/);
  });
});
