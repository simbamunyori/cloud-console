"use server";

import { revalidatePath } from "next/cache";
import { field, run, type ActionState } from "@/server/action-state";
import { zonedTime } from "@/lib/dates";
import { prisma } from "@/server/db";
import { pushLicenceChange, requestConsent } from "@/server/licences/automation";
import { requestLicenceChange, type ChangeInput } from "@/server/licences/licences";
import { bookMigration, checkDns, requestTransfer, tickCustomerItem } from "@/server/licences/onboarding";
import { tenantProvider } from "@/server/licences/provider";
import { requireRecentCheck } from "@/server/auth/next";
import { requireMember } from "@/server/org/context";

const DONE: Record<ChangeInput["kind"], string> = {
  ASSIGN: "Licence given.",
  UNASSIGN: "Licence taken back. It's free for someone else.",
  ADD_USER: "Added.",
  REMOVE_USER: "Removed, and their licences are free.",
};

const ASKED = "Sent to our team. You'll see it here once it's done.";

async function submit(input: ChangeInput, values?: Record<string, string>): Promise<ActionState> {
  const { db, organisation, actor, session } = await requireMember();
  await requireRecentCheck(session, "CUSTOMER", "/app/licences");
  const result = await run(async () => {
    const { change, applied } = await requestLicenceChange(db, { organisationId: organisation.id, organisationName: organisation.name, actor, provider: tenantProvider() }, input);
    if (applied) return DONE[input.kind];
    // With the partner's automation on (U6) it is done now; otherwise, or if the partner refuses, our team does it.
    return (await pushLicenceChange(prisma, change.id)) === "done" ? DONE[input.kind] : ASKED;
  }, values);
  if (result.ok) {
    revalidatePath("/app/licences");
    revalidatePath("/app");
  }
  return result;
}

/** Give or take back one licence, or remove the person: which one is the button pressed. */
export async function changeLicenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const intent = field(form, "intent");
  const tenantUserId = field(form, "tenantUserId");
  if (intent === "remove") return submit({ kind: "REMOVE_USER", tenantUserId });
  const [kind, licenceId] = intent.split(":");
  return submit({ kind: kind === "take" ? "UNASSIGN" : "ASSIGN", tenantUserId, licenceId });
}

export async function addPersonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { name: field(form, "name"), email: field(form, "email"), licenceId: field(form, "licenceId") };
  return submit({ kind: "ADD_USER", tenantId: field(form, "tenantId"), name: values.name, email: values.email, licenceId: values.licenceId || undefined }, values);
}

// ─── Setting up ──────────────────────────────────────────────────────

async function setupContext() {
  const { db, organisation, actor } = await requireMember();
  return { db, organisation, ctx: { organisationId: organisation.id, organisationName: organisation.name, actor } };
}

function refreshed(result: ActionState) {
  if (result.ok) revalidatePath("/app/licences");
  return result;
}

export async function checkDnsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, ctx } = await setupContext();
  return refreshed(
    await run(async () => {
      const { found, records } = await checkDns(db, ctx, field(form, "onboardingId"));
      const now = records.filter((r) => r.when === "now");
      const missing = now.filter((r) => !found[r.key]).length;
      return now.length === 0 ? "Checked." : missing ? `Checked. ${missing === 1 ? "1 record isn't" : `${missing} records aren't`} showing yet. Changes can take up to an hour to appear.` : "Checked. Your domain is proven.";
    }),
  );
}

export async function bookMigrationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, organisation, ctx } = await setupContext();
  const values = { day: field(form, "day"), time: field(form, "time"), source: field(form, "source"), notes: field(form, "notes") };
  return refreshed(
    await run(async () => {
      await bookMigration(db, ctx, field(form, "onboardingId"), { startsAt: zonedTime(values.day, values.time, organisation.timeZone), source: values.source, notes: values.notes });
      return "Booked. We'll be in touch two days before.";
    }, values),
  );
}

export async function tickAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, ctx } = await setupContext();
  return refreshed(await run(async () => void (await tickCustomerItem(db, ctx, field(form, "onboardingId"), field(form, "key"), field(form, "done") === "yes"))));
}

export async function transferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, ctx } = await setupContext();
  const values = { vendor: field(form, "vendor"), domain: field(form, "domain"), people: field(form, "people") };
  return refreshed(
    await run(async () => {
      await requestTransfer(db, ctx, values);
      return "Thanks. We'll send you an invitation to accept us as your partner.";
    }, values),
  );
}

// ─── Admin access (U6) ───────────────────────────────────────────────

export async function requestConsentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, organisation, actor } = await requireMember();
  const result = await run(async () => {
    const { link } = await requestConsent(db, { root: prisma, organisationId: organisation.id, organisationName: organisation.name, actor }, field(form, "tenantId"));
    return link ? "Open the link below, sign in as a global admin and accept." : "We'll email you the invitation to accept. It shows here once access is given.";
  });
  return refreshed(result);
}
