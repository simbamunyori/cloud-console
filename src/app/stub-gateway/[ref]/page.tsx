import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { formatMoney } from "@/lib/domain/money";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { STUB_CARDS, stubCharge } from "@/server/payments/stub-card";
import { stubCancelAction } from "./actions";
import { StubPayForm } from "./pay-form";

export const metadata: Metadata = { title: "Test card payment", robots: { index: false } };

const spaced = (n: string) => n.replace(/(\d{4})(?=\d)/g, "$1 ");

/** Stands in for a card company's payment page until a gateway is chosen. */
export default async function StubGatewayPage({ params }: { params: Promise<{ ref: string }> }) {
  if (env().PAYMENT_ADAPTER !== "stub") notFound();
  const { ref } = await params;
  const charge = await stubCharge(prisma, decodeURIComponent(ref));
  if (!charge || charge.status !== "pending") notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-10">
      <div className="flex items-start gap-3 rounded-md bg-warning-soft px-4 py-3 text-callout text-warning">
        <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0" />
        <p>
          This is a test payment page. No card is charged. Use {spaced(STUB_CARDS.pays)} to pay, or {spaced(STUB_CARDS.declined)} to see a decline, with any future expiry and any 3 digits.
        </p>
      </div>
      <Card>
        <CardBody className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-callout text-ink-muted">{charge.description}</span>
            <span className="text-title-1 text-ink tabular-nums">{formatMoney(charge.amount)}</span>
          </div>
          <StubPayForm reference={charge.id} label={`Pay ${formatMoney(charge.amount)}`} />
        </CardBody>
      </Card>
      <form action={stubCancelAction} className="self-center">
        <input type="hidden" name="ref" value={charge.id} />
        <Button type="submit" variant="ghost">
          Cancel and go back
        </Button>
      </form>
    </main>
  );
}
