/**
 * Names and fixed facts about the company. Values that change per
 * deployment (the console's name, its address, bank details) come from
 * the environment; see src/server/env.ts.
 */
export const company = {
  /** How the company appears in the console. */
  name: "Fourth Generation Technologies",
  /** How it appears on invoices and statements. */
  legalName: "Fourth Generation Technologies (Pty) Ltd",
  country: "BW",
  supportEmail: "support@localhost",
  tagline: "Managed cloud for business.",
} as const;

/** Every amount carries a currency; this is the one new organisations start with. */
export const DEFAULT_CURRENCY = "BWP";
export const DEFAULT_TIME_ZONE = "Africa/Gaborone";

/** Nothing customers own is removed sooner than this after they are told. */
export const DELETION_NOTICE_DAYS = 30;
