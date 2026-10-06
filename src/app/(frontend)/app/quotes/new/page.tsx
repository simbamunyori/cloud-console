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
import { connectivityOffered, isConnectProduct, SPEEDS } from "@/server/connectivity/connectivity";

export const metadata: Metadata = { title: "Ask for a quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ product?: string; for?: string }> }) {
  const { actor, organisation, session } = await requireMember();
  const asked = await searchParams;
  const slug = asked.product;
  const product = slug ? await productBySlug(prisma, slug, audienceFor(organisation)) : null;
  // STRATEGY_ROLLOUT U12: the connectivity questions, where it is offered.
  const connect = (asked.for === "connect" || (await isConnectProduct(prisma, product?.slug))) && (await connectivityOffered(prisma, organisation.billingMarket));
  return (
    <>
      <Link href={product ? `/app/marketplace/${product.slug}` : "/app/quotes"} className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> {product ? product.name : "Quotes"}
      </Link>
      <PageHeader
        title={connect ? "Connect your offices" : "Ask for a quote"}
        description={connect ? "Tell us where your sites are and what they need. We'll survey them, design the links and add the quote to your quotes here." : `Tell us what you need. We'll email a quote to you and add it to ${organisation.name}'s quotes here.`}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <QuoteRequestForm
            action={requestQuoteFromConsoleAction}
            countries={countryOptions()}
            defaults={{ name: actor.name, email: session.user.email, company: organisation.name, country: organisation.country, phone: organisation.phone ?? "" }}
            hidden={product ? { product: product.slug } : {}}
            product={product?.name}
            after="It's in your Quotes, and we'll email you when it's priced."
            connect={connect ? { speeds: SPEEDS } : undefined}
          />
        </CardBody>
      </Card>
    </>
  );
}
