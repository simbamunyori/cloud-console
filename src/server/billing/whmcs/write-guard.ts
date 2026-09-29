/**
 * The hard stop on test writes to a production WHMCS. The write suite
 * (WHMCS_TEST_WRITES=yes) creates clients, orders, invoices and payments,
 * so it refuses to start when WHMCS_ENVIRONMENT is production, whatever
 * else is set.
 */
export function assertWritesAllowed(e: { WHMCS_ENVIRONMENT?: string }) {
  if (e.WHMCS_ENVIRONMENT?.trim().toLowerCase() === "production") {
    throw new Error("Refusing to run the WHMCS write tests: WHMCS_ENVIRONMENT is production. They create clients, orders, invoices and payments, so they only run against the test install.");
  }
}
