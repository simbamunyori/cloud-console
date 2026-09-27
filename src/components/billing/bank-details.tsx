import { DetailList } from "@/components/ui/card";
import type { BankDetails } from "@/server/payments/bank";

/** Where to pay by EFT. The invoice number is the reference, so we can match the payment. */
export function BankDetailsList({ bank, reference }: { bank: BankDetails; reference?: string }) {
  return (
    <DetailList
      items={[
        ["Bank", bank.bankName],
        ["Account name", bank.accountName],
        ["Account number", <span key="n" className="tabular-nums">{bank.accountNumber}</span>],
        ...(bank.branchCode ? ([["Branch code", bank.branchCode]] as [string, string][]) : []),
        ...(bank.swiftCode ? ([["SWIFT code", bank.swiftCode]] as [string, string][]) : []),
        ["Reference", reference ? <span key="r" className="font-semibold tabular-nums">{reference}</span> : "Your invoice number"],
      ]}
    />
  );
}
