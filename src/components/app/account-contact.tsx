import { Mail, Phone } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { ContactCard } from "@/server/experience/experience";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** The colleague who looks after this customer (STRATEGY_ROLLOUT U11). */
export function AccountContactCard({ contact }: { contact: ContactCard }) {
  return (
    <Card aria-labelledby="contact-title">
      <CardHeader id="contact-title" title="Your account contact" />
      <CardBody className="flex items-start gap-4">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-headline font-semibold text-link">
          {initials(contact.name)}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold text-ink">{contact.name}</p>
          {contact.jobTitle ? <p className="text-callout text-ink-muted">{contact.jobTitle}</p> : null}
          <a href={`mailto:${contact.email}`} className="mt-1 flex items-center gap-2 text-callout text-link hover:underline">
            <Mail aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{contact.email}</span>
          </a>
          {contact.phone ? (
            <a href={`tel:${contact.phone.replace(/[^+0-9]/g, "")}`} className="flex items-center gap-2 text-callout text-link hover:underline">
              <Phone aria-hidden className="size-4 shrink-0" />
              {contact.phone}
            </a>
          ) : null}
          <p className="mt-1 text-callout text-ink-muted">For anything urgent, open a support ticket so the whole team sees it.</p>
        </div>
      </CardBody>
    </Card>
  );
}
