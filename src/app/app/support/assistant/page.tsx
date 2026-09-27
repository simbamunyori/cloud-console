import type { AssistantAction } from "@prisma/client";
import { ArrowLeft, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { assertCan } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { assistantModel } from "@/server/support/assistant/model";
import { decideAction } from "../actions";
import { AskForm } from "../forms";

export const metadata: Metadata = { title: "Assistant" };

function ActionCard({ action, conversationId }: { action: AssistantAction; conversationId: string }) {
  const result = (action.result ?? {}) as { orderReference?: string; ticketReference?: string };
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-strong bg-surface-1 p-4">
      <span className="label-kicker text-ink-muted">{action.kind === "handover" ? "Pass to our team" : "Suggested change"}</span>
      <p className="text-ink">{action.summary}</p>
      {action.status === "PROPOSED" ? (
        <form action={decideAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="actionId" value={action.id} />
          <input type="hidden" name="conversationId" value={conversationId} />
          <Button type="submit" name="decision" value="confirm">
            Confirm
          </Button>
          <Button type="submit" name="decision" value="decline" variant="secondary">
            No thanks
          </Button>
        </form>
      ) : action.status === "CONFIRMED" ? (
        <p className="text-callout text-positive">
          Done.{" "}
          {result.orderReference ? (
            <Link href={`/app/orders/${result.orderReference}`} className="underline">
              Follow order {result.orderReference}
            </Link>
          ) : result.ticketReference ? (
            <Link href={`/app/support/tickets/${result.ticketReference}`} className="underline">
              Open ticket {result.ticketReference}
            </Link>
          ) : null}
        </p>
      ) : (
        <p className="text-callout text-ink-muted">You said no to this.</p>
      )}
    </div>
  );
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; action?: string }> }) {
  const { db, actor, organisation } = await requireMember();
  assertCan(actor, "support");
  const { c, action } = await searchParams;
  const on = assistantModel() !== null;
  const [conversation, recent] = await Promise.all([
    c ? db.assistantConversation.findFirst({ where: { id: c, userId: actor.userId, deletedAt: null }, include: { messages: { orderBy: { createdAt: "asc" } }, actions: { orderBy: { createdAt: "asc" } }, ticket: true } }) : null,
    db.assistantConversation.findMany({ where: { userId: actor.userId, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 8 }),
  ]);
  if (c && !conversation) notFound();

  // Each suggestion goes under the answer it came with.
  const turns = (conversation?.messages ?? []).map((m, i, all) => {
    const prev = all.slice(0, i).findLast((x) => x.role === "ASSISTANT");
    const actions = m.role === "ASSISTANT" ? (conversation?.actions ?? []).filter((a) => a.createdAt <= m.createdAt && (!prev || a.createdAt > prev.createdAt)) : [];
    return { m, actions, last: i === all.length - 1 };
  });

  return (
    <>
      <Link href="/app/support" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Support
      </Link>
      <PageHeader title="Assistant" description="It looks up your own account to answer, and never changes anything unless you confirm." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_var(--layout-aside)] [&>*]:min-w-0">
        <div className="flex flex-col gap-4">
          {!on ? <Alert tone="info">The assistant isn&apos;t switched on yet. <Link href="/app/support/new" className="font-semibold underline">Ask our team</Link> instead.</Alert> : null}
          {action === "failed" ? <Alert>That couldn&apos;t be done. It may have changed since the assistant suggested it. Ask again, or ask our team.</Alert> : null}
          {conversation?.handedOverAt && conversation.ticket ? (
            <Alert tone="info">
              This conversation is with our team now.{" "}
              <Link href={`/app/support/tickets/${conversation.ticket.reference}`} className="font-semibold underline">
                Open ticket {conversation.ticket.reference}
              </Link>
            </Alert>
          ) : null}
          {turns.length === 0 ? (
            <Card>
              <CardBody className="flex items-start gap-3">
                <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-link" />
                <div className="flex flex-col gap-2 text-callout text-ink-body">
                  <p>Try asking:</p>
                  <ul className="list-disc pl-5">
                    <li>Why is this month&apos;s invoice higher than last month&apos;s?</li>
                    <li>When does our domain expire?</li>
                    <li>Add two users to Microsoft 365.</li>
                  </ul>
                </div>
              </CardBody>
            </Card>
          ) : (
            <ol className="flex flex-col gap-4" aria-label="Conversation">
              {turns.map(({ m, actions, last }) => (
                <li key={m.id} id={last ? "latest" : undefined} className={cn("flex flex-col gap-3", m.role === "USER" ? "items-end" : "items-start")}>
                  <div className={cn("max-w-xl rounded-lg px-4 py-3", m.role === "USER" ? "bg-navy text-on-navy" : "border border-border bg-surface-1 text-ink-body")}>
                    <p className="text-body whitespace-pre-wrap">{m.text}</p>
                  </div>
                  {actions.map((a) => (
                    <div key={a.id} className="w-full max-w-xl">
                      <ActionCard action={a} conversationId={conversation!.id} />
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          )}
          {on && !conversation?.handedOverAt ? <AskForm conversationId={conversation?.id} /> : null}
          <p className="text-caption text-ink-muted">
            The assistant uses an AI service hosted outside your country. It only sees what it looks up to answer you, never your passwords or payment details, and everything it looks up is in your{" "}
            <Link href="/app/security" className="underline">
              activity log
            </Link>
            . <Link href="/privacy" className="underline">How we handle your data</Link>
          </p>
        </div>
        <Card aria-labelledby="recent-title" className="self-start">
          <CardHeader id="recent-title" title="Your conversations" action={conversation ? <Link href="/app/support/assistant" className="text-callout text-link hover:underline">New</Link> : undefined} />
          {recent.length === 0 ? (
            <CardBody>
              <p className="text-callout text-ink-muted">None yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/app/support/assistant?c=${r.id}`} aria-current={r.id === conversation?.id ? "page" : undefined} className="flex flex-col gap-0.5 px-5 py-3 hover:bg-surface-2 aria-[current=page]:bg-surface-2 sm:px-6">
                    <span className="truncate text-callout text-ink">{r.title ?? "Conversation"}</span>
                    <span className="flex items-center gap-2 text-caption text-ink-muted">
                      {formatMoment(r.updatedAt, organisation.timeZone)}
                      {r.handedOverAt ? <Badge>With our team</Badge> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
