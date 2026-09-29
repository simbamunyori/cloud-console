import type { ConnectorFamily } from "@prisma/client";
import type { ConnectorRequest, ConnectorResult, ConnectorTx, ProductConnector } from "./connector";

/** Steps staff follow for each family, until that family has an automatic connector. */
const STEPS: Record<ConnectorFamily, Record<ConnectorRequest["work"], (r: ConnectorRequest) => string[]>> = {
  PRODUCTIVITY: {
    provision: (r) => [
      `Create or find the customer tenant for ${r.organisationName}${r.options["Your email domain"] ? ` (${r.options["Your email domain"]})` : ""}.`,
      `Buy ${r.quantity} licence${r.quantity === 1 ? "" : "s"} of ${r.productName} through the partner portal.`,
      "Send the customer the DNS records to prove they own the domain, and check them once added.",
      "Book the email migration with the customer and add the date to the task notes.",
      "Mark this task done when mailboxes work. The customer is told straight away.",
    ],
    change_quantity: (r) => [`Change ${r.productName} from ${r.previousQuantity} to ${r.quantity} licences in the partner portal.`, "Mark this task done once the licence count matches."],
    cancel: (r) => [`Cancel ${r.productName} for ${r.organisationName} at the end of the current term.`],
  },
  PUBLIC_CLOUD: {
    provision: (r) => [`Create the Azure subscription for ${r.organisationName} under our partner account.`, "Apply the standard security baseline and budget alerts.", "Give the customer's admin access and mark this done."],
    change_quantity: (r) => [`Update ${r.productName} to ${r.quantity}.`],
    cancel: (r) => [`Hand over or close the Azure subscription for ${r.organisationName}.`],
  },
  SERVERS: {
    provision: (r) => [`Create ${r.productName} in Proxmox with ${r.options["Operating system"] ?? "the chosen system"}.`, "Add it to monitoring and the snapshot schedule.", "Record the IP address in the task notes, send the customer their access details, and mark this done."],
    change_quantity: (r) => [`Resize ${r.productName} as ordered.`],
    cancel: (r) => [`Take a final snapshot, then shut down ${r.productName} at the end of the term.`],
  },
  WEB_AND_DOMAINS: {
    provision: (r) => [
      r.productName === "Domain name"
        ? `Register ${r.options.Domain ?? "the domain"} for ${r.options.Years ?? "1"} year(s) with the registrar${r.options.Domain?.endsWith(".bw") ? " (BOCRA, through CoCCA)" : " (Openprovider)"}.`
        : `Create ${r.productName} for ${r.options["Website address"] ?? r.options["Your email domain"] ?? r.organisationName} in DirectAdmin.`,
      "Check DNS points to our servers and SSL is working.",
      "Mark this done. The customer is told straight away.",
    ],
    change_quantity: (r) => [`Change ${r.productName} from ${r.previousQuantity} to ${r.quantity}.`],
    cancel: (r) => [`Remove ${r.productName} at the end of the term, after a final backup.`],
  },
  PROTECTION: {
    provision: (r) => [`Set up ${r.productName} for ${r.organisationName}${r.quantity > 1 ? ` covering ${r.quantity}` : ""}.`, "Run the first backup or scan and check it finished.", "Mark this done."],
    change_quantity: (r) => [`Change ${r.productName} coverage from ${r.previousQuantity} to ${r.quantity}.`],
    cancel: (r) => [`Stop ${r.productName} at the end of the term. Keep existing backups for 30 days.`],
  },
  OUR_SOFTWARE: {
    provision: (r) => [`Create the ${r.productName} workspace for ${r.organisationName}.`, "Invite the customer's owner and mark this done."],
    change_quantity: (r) => [`Update ${r.productName} to ${r.quantity}.`],
    cancel: (r) => [`Close the ${r.productName} workspace after 30 days' notice and an export for the customer.`],
  },
  SERVICES: {
    provision: (r) => [`Assign an engineer to ${r.organisationName} for ${r.productName}.`, "Hold the welcome call and mark this done."],
    change_quantity: (r) => [`Update ${r.productName} to ${r.quantity}.`],
    cancel: (r) => [`End ${r.productName} after the notice period.`],
  },
};

const TITLES: Record<ConnectorRequest["work"], (r: ConnectorRequest) => string> = {
  provision: (r) => `Set up ${r.productName}${r.quantity > 1 ? ` x ${r.quantity}` : ""} for ${r.organisationName}`,
  change_quantity: (r) => `Change ${r.productName} to ${r.quantity} for ${r.organisationName}`,
  cancel: (r) => `Cancel ${r.productName} for ${r.organisationName}`,
};

/** The Phase 1 connector: a task for staff, done by hand. */
export class ManualConnector implements ProductConnector {
  readonly automatic = false;
  constructor(readonly family: ConnectorFamily) {}

  async request(tx: ConnectorTx, r: ConnectorRequest, now: Date): Promise<ConnectorResult> {
    const expectedBy = new Date(now.getTime() + r.setupHours * 3_600_000);
    const details = [`Order ${r.orderReference}.`, ...Object.entries(r.options).map(([k, v]) => `${k}: ${v}`), r.billingIds.length ? `Billing ids: ${r.billingIds.join(", ")}` : ""].filter(Boolean);
    const task = await tx.provisioningTask.create({
      data: {
        organisationId: r.organisationId,
        orderId: r.orderId,
        family: this.family,
        kind: r.work,
        title: TITLES[r.work](r),
        instructions: [...details, "", ...STEPS[this.family][r.work](r).map((s, i) => `${i + 1}. ${s}`)].join("\n"),
        expectedBy,
      },
    });
    return { mode: "manual", expectedBy, taskId: task.id };
  }
}
