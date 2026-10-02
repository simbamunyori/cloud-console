import { requireStaffCan } from "@/server/admin/context";
import { ODOO_TEMPLATES, type OdooFile } from "@/server/migration/odoo";

/** An example file for one of the Odoo exports, as CSV. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  await requireStaffCan("migrateClients");
  const { file } = await params;
  const key = file.replace(/\.csv$/, "") as OdooFile;
  if (!(key in ODOO_TEMPLATES)) return new Response("Not found", { status: 404 });
  return new Response(`${ODOO_TEMPLATES[key]}\n`, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${key}.csv"` },
  });
}
