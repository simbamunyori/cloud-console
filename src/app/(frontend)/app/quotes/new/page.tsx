import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { QuoteRequestForm } from "@/components/quotes/request-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { countryOptions } from "@/lib/countries";
import { productBySlug } from "@/server/catalogue/catalogue";
import { audienceFor } from "@/server/catalogue/visibility";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/org/context";
import { requestQuoteFromConsoleAction } from "../actions";

export const metadata: Metadata = { title: "Ask for a quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { actor, organisation, session } = await requireMember();
  const slug = (await searchParams).product;
  const product = slug ? await productBySlug(prisma, slug, audienceFor(organisation)) : null;
  return (
    <>
      <Link href={product ? `/app/marketplace/${product.slug}` : "/app/quotes"} className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> {product ? product.name : "Quotes"}
      </Link>
      <PageHeader title="Ask for a quote" description={`Tell us what you need. We'll email a quote to you and add it to ${organisation.name}'s quotes here.`} />
      <Card className="max-w-3xl">
        <CardBody>
          <QuoteRequestForm
            action={requestQuoteFromConsoleAction}
            countries={countryOptions()}
            defaults={{ name: actor.name, email: session.user.email, company: organisation.name, country: organisation.country, phone: organisation.phone ?? "" }}
            hidden={product ? { product: product.slug } : {}}
            product={product?.name}
            after="It's in your Quotes, and we'll email you when it's priced."
          />
        </CardBody>
      </Card>
    </>
  );
}
