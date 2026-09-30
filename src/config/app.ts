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
  /** Botswana company registration, on the footer and legal pages. */
  registrationNumber: "BW00001816431",
  country: "BW",
  tagline: "Managed cloud for business.",
  /** How the admin console writes amounts and dates for staff, in whatever currency. */
  staffLocale: "en-BW",
} as const;

/**
 * Where the team works: the admin console, scheduled jobs and the billing
 * engine's calendar use it. Customers see their own market's time zone.
 */
export const DEFAULT_TIME_ZONE = "Africa/Gaborone";

/** Nothing customers own is removed sooner than this after they are told. */
export const DELETION_NOTICE_DAYS = 30;
