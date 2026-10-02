/**
 * Does the "odoo-import" job's work once. CI runs the console with
 * background jobs off, so the migration browser test calls this after
 * approving a dry run. Run with: tsx --conditions=react-server
 */
import { prisma } from "@/server/db";
import { billingAdapter, linkProductsToBilling } from "@/server/billing";
import { runApprovedImports } from "@/server/migration/run";

runApprovedImports({ db: prisma, adapter: billingAdapter(), linkProducts: linkProductsToBilling })
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
