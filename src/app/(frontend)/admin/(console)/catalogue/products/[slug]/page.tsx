import { Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { effectiveStatus } from "@/server/catalogue/visibility";
import { prisma } from "@/server/db";
import { ProductForm } from "../../forms";
import { BackToCatalogue, StatusBadge } from "../../parts";
import { productFormOptions, productValues } from "../options";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ added?: string }> }) {
  await requireStaffCan("manageCatalogue");
  const [{ slug }, { added }] = await Promise.all([params, searchParams]);
  if (slug === DOMAIN_PRODUCT_SLUG) notFound();
  const [p, options, changes] = await Promise.all([
    prisma.product.findUnique({ where: { slug }, include: { category: { include: { family: true } } } }),
    productFormOptions(prisma),
    prisma.staffAuditEvent.findMany({ where: { action: { startsWith: "catalogue.product" }, data: { path: ["product"], equals: slug } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  if (!p) notFound();
  const shown = effectiveStatus(p, p.category.family);

  return (
    <>
      <BackToCatalogue />
      <PageHeader
        eyebrow={p.category.family.name === p.category.name ? p.category.name : `${p.category.family.name}: ${p.category.name}`}
        title={p.name}
        actions={
          <>
            <StatusBadge status={shown} />
            <Button asChild variant="secondary">
              <Link href={`/admin/catalogue/products/${p.slug}/preview`}>
                <Eye aria-hidden /> Preview
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {added ? <Alert tone="positive">Added as a draft. Approve its prices on the Pricing page, preview it, then make it internal or live.</Alert> : null}
        {shown !== p.status ? <Alert tone="info">Its family is {shown === "DRAFT" ? "a draft" : "internal"}, so it shows as {shown === "DRAFT" ? "a draft" : "internal"} whatever its own status.</Alert> : null}
        {p.billingProductId ? null : (
          <Alert tone="info">Not in billing yet, so it can&apos;t be ordered. It is added once it is internal or live (with WHMCS, by the next product sync).</Alert>
        )}
        <Card>
          <CardBody>
            <ProductForm {...options} existing={p.slug} product={productValues(p)} />
          </CardBody>
        </Card>
        <Card aria-labelledby="changes-title">
          <CardHeader id="changes-title" title="Changes" />
          {changes.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No changes since the catalogue moved here.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {changes.map((c) => (
                <li key={c.id} className="flex flex-col px-5 py-3 sm:px-6">
                  <span className="text-ink">{c.summary}</span>
                  <span className="text-callout text-ink-muted">
                    {c.actorLabel}, {formatMoment(c.createdAt, DEFAULT_TIME_ZONE)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
