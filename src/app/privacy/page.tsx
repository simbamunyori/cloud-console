import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { company } from "@/config/app";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Privacy" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title-2 text-ink">{title}</h2>
      <div className="flex flex-col gap-3 text-body text-ink-body">{children}</div>
    </section>
  );
}

/** How the console handles personal data, in plain words. Public: no sign-in needed. */
export default function PrivacyPage() {
  const consoleName = env().CONSOLE_NAME;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-10 sm:py-16">
      <Link href="/" className="self-start rounded-sm">
        <Logo />
      </Link>
      <header className="flex flex-col gap-3">
        <h1 className="text-title-1 text-ink">How we handle your data</h1>
        <p className="text-body text-ink-muted">
          {company.legalName} runs {consoleName}. This page explains what the console keeps about you and your organisation, where it goes, and what you can ask us to do.
        </p>
      </header>

      <Section title="What we keep">
        <p>Your name, email address and role in your organisation; your organisation&apos;s details; the services you buy, your orders, invoices and payments; support tickets and conversations with the assistant; and a record of sign-ins and changes made to your account.</p>
        <p>We never see your full card number: the card company handles it. Passwords are stored only as a one-way hash, and the secret behind your two-step login is encrypted.</p>
      </Section>

      <Section title="Where it's kept">
        <p>The console and its database run on our servers in Botswana, with an encrypted backup copy kept off-site for 30 days.</p>
      </Section>

      <Section title="The assistant">
        <p>
          The assistant on the Support page uses an AI service run by Anthropic, outside Botswana. When you ask it something, it is sent your question, the conversation so far, and only the account details it looks up to answer, such as an invoice&apos;s lines or a list of your services. It is never sent passwords, sign-in codes, card numbers, our bank details or any keys.
        </p>
        <p>Every lookup it makes is written to your organisation&apos;s activity log on the Security page. It can&apos;t change anything on your account unless you press Confirm. If you&apos;d rather it didn&apos;t see your data, ask our team instead: a person answers every ticket.</p>
      </Section>

      <Section title="Our staff">
        <p>Our team can see your account to support you and set up what you order. Anything they change on your account appears in your activity log, with their name. You can&apos;t hide it and neither can they.</p>
      </Section>

      <Section title="Your rights">
        <p>
          Botswana&apos;s Data Protection Act 18 of 2024 gives you the right to see the personal data we hold about you, to have it corrected, and to ask us to delete it. We tell you 30 days before anything is deleted. Write to{" "}
          <a href={`mailto:${company.supportEmail}`} className="text-link underline">
            {company.supportEmail}
          </a>{" "}
          to ask.
        </p>
        <p>If there is ever a breach that affects your data, we will tell you and the Information and Data Protection Commission within 72 hours of finding out.</p>
      </Section>
    </main>
  );
}
