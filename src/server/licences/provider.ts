import type { LicenceChangeKind, Prisma, TenantVendor } from "@prisma/client";
import { env } from "@/server/env";

/**
 * Who carries out a change in a customer's Microsoft 365 or Google
 * Workspace tenant. The stub applies it at once, as an API would; the
 * manual provider hands it to staff as a task, and the change waits until
 * that task is done. The Microsoft (CSP, Graph) and Google (Reseller,
 * Directory) providers join here once those accounts are signed.
 */

export interface SubmittedChange {
  organisationId: string;
  organisationName: string;
  vendor: TenantVendor;
  primaryDomain: string;
  kind: LicenceChangeKind;
  /** The person, by name and email. */
  userName: string;
  userEmail: string;
  /** The licence, by name, when the change involves one. */
  licenceName?: string;
  /** Other licences the person holds, freed by REMOVE_USER. */
  freedLicences?: string[];
}

/** The part of a transaction a provider may write to. */
export type ProviderTx = { provisioningTask: { create: (args: { data: Prisma.ProvisioningTaskUncheckedCreateInput }) => Promise<{ id: string }> } };

export interface TenantProvider {
  readonly name: "stub" | "manual";
  /** Whether a change is done in the vendor's system as soon as it is submitted. */
  readonly automatic: boolean;
  /** Called inside the change's transaction. */
  submit(tx: ProviderTx, change: SubmittedChange, now: Date): Promise<{ applied: boolean; taskId?: string }>;
}

/** How long staff have for a licence change, in working hours. */
export const MANUAL_CHANGE_HOURS = 4;

const PORTAL: Record<TenantVendor, string> = {
  MICROSOFT: "the Microsoft 365 admin centre (admin.microsoft.com), signed in through our partner access",
  GOOGLE: "the Google Admin console (admin.google.com), through our reseller access",
};

export const VENDOR_LABEL: Record<TenantVendor, string> = { MICROSOFT: "Microsoft 365", GOOGLE: "Google Workspace" };

function steps(c: SubmittedChange): { title: string; steps: string[] } {
  const who = `${c.userName} (${c.userEmail})`;
  switch (c.kind) {
    case "ASSIGN":
      return { title: `Give ${c.userName} a ${c.licenceName} licence`, steps: [`Open ${PORTAL[c.vendor]} for ${c.primaryDomain}.`, `Assign a ${c.licenceName} licence to ${who}.`, "Mark this task done. The console updates straight away and the customer sees it."] };
    case "UNASSIGN":
      return { title: `Take back ${c.userName}'s ${c.licenceName} licence`, steps: [`Open ${PORTAL[c.vendor]} for ${c.primaryDomain}.`, `Remove the ${c.licenceName} licence from ${who}. Check with the customer first if their mailbox would be lost.`, "Mark this task done."] };
    case "ADD_USER":
      return {
        title: `Add ${c.userName} to ${c.primaryDomain}`,
        steps: [
          `Open ${PORTAL[c.vendor]} for ${c.primaryDomain}.`,
          `Create the user ${who}${c.licenceName ? ` with a ${c.licenceName} licence` : " with no licence"}.`,
          "Send the temporary password to the customer's admin by a separate channel, never in the ticket.",
          "Mark this task done.",
        ],
      };
    case "REMOVE_USER":
      return {
        title: `Remove ${c.userName} from ${c.primaryDomain}`,
        steps: [
          `Open ${PORTAL[c.vendor]} for ${c.primaryDomain}.`,
          `Block sign-in for ${who} and sign them out everywhere.`,
          c.freedLicences?.length ? `Remove their licences (${c.freedLicences.join(", ")}) so they can go to someone else.` : "They hold no licences.",
          "Keep the mailbox and files as the customer asks; don't delete the account without their word.",
          "Mark this task done.",
        ],
      };
  }
}

export class StubTenantProvider implements TenantProvider {
  readonly name = "stub" as const;
  readonly automatic = true;
  async submit(): Promise<{ applied: boolean }> {
    return { applied: true };
  }
}

export class ManualTenantProvider implements TenantProvider {
  readonly name = "manual" as const;
  readonly automatic = false;
  async submit(tx: ProviderTx, c: SubmittedChange, now: Date): Promise<{ applied: boolean; taskId: string }> {
    const { title, steps: list } = steps(c);
    const task = await tx.provisioningTask.create({
      data: {
        organisationId: c.organisationId,
        family: "PRODUCTIVITY",
        kind: "licence_change",
        title: `${title} (${c.organisationName})`,
        instructions: [`${VENDOR_LABEL[c.vendor]} tenant ${c.primaryDomain}.`, "", ...list.map((s, i) => `${i + 1}. ${s}`)].join("\n"),
        expectedBy: new Date(now.getTime() + MANUAL_CHANGE_HOURS * 3_600_000),
      },
    });
    return { applied: false, taskId: task.id };
  }
}

export function tenantProvider(): TenantProvider {
  return env().TENANT_PROVIDER === "manual" ? new ManualTenantProvider() : new StubTenantProvider();
}
