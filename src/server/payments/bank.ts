import "server-only";
import { env } from "@/server/env";

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode?: string;
  swiftCode?: string;
}

/** Our bank account for EFT, from config. Null until all the required parts are set. */
export function bankDetails(): BankDetails | null {
  const e = env();
  if (!e.EFT_BANK_NAME || !e.EFT_ACCOUNT_NAME || !e.EFT_ACCOUNT_NUMBER) return null;
  return { bankName: e.EFT_BANK_NAME, accountName: e.EFT_ACCOUNT_NAME, accountNumber: e.EFT_ACCOUNT_NUMBER, branchCode: e.EFT_BRANCH_CODE, swiftCode: e.EFT_SWIFT_CODE };
}
