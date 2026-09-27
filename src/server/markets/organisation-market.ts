import type { PrismaClient } from "@prisma/client";
import type { BillingAdapter } from "@/server/billing/adapter";
import { audit } from "@/server/org/audit";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";

/**
 * A customer's market and currency are set at sign-up and fixed after
 * that. Staff can move an account to another market, for example after a
 * company moves country. The currency can only change before the first
 * invoice: the billing engine keeps every invoice for a client in one
 * currency, as WHMCS does. The customer sees the change in their log.
 */
export async function changeOrganisationMarket(deps: { db: PrismaClient; adapter: BillingAdapter; staff: StaffActor }, organisationId: string, marketCode: string) {
  assertStaffCan(deps.staff, "manageMarkets");
  const org = await deps.db.organisation.findUnique({ where: { id: organisationId }, include: { market: true, billingAccount: true } });
  if (!org) throw new DomainError("not-found", "No such customer.");
  const market = await deps.db.market.findUnique({ where: { code: marketCode } });
  if (!market) throw new DomainError("invalid", "Choose a market.", "market");
  if (market.code === org.billingMarket) return org;

  const account = org.billingAccount;
  const currencyChanges = market.currency !== org.currency;
  if (currencyChanges && account) {
    const invoices = await deps.adapter.listInvoices(account.externalClientId);
    if (invoices.length) {
      throw new DomainError(
        "invalid",
        `This account already has invoices in ${org.currency}, and ${market.name} bills in ${market.currency}. A change of currency needs a new account.`,
        "market",
      );
    }
    await deps.adapter.updateClient(account.externalClientId, { currency: market.currency });
  }

  return deps.db.$transaction(async (tx) => {
    const updated = await tx.organisation.update({
      where: { id: organisationId },
      data: { billingMarket: market.code, currency: market.currency, timeZone: market.timeZone },
    });
    await audit(
      tx,
      staffAudit(deps.staff, organisationId, {
        action: "organisation.market_changed",
        summary: currencyChanges
          ? `Moved the account from ${org.market.name} to ${market.name}; invoices will be in ${market.currency}`
          : `Moved the account from ${org.market.name} to ${market.name}`,
        targetType: "Organisation",
        targetId: organisationId,
        data: { from: org.billingMarket, to: market.code, currencyFrom: org.currency, currencyTo: market.currency },
      }),
    );
    return updated;
  });
}
