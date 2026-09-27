/** A titled block of plain text on the public site's content pages. */
export function ProseSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-title-2 text-ink">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-body text-ink-body">{children}</div>
    </section>
  );
}

export function PageIntro({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <p className="label-kicker text-link">{kicker}</p>
      <h1 className="text-title-1 text-ink sm:text-display">{title}</h1>
      {children ? <p className="text-body text-ink-muted">{children}</p> : null}
    </header>
  );
}

/** The assistant notice required by the Phase 1 go-ahead. Product fact, not legal text. */
export function AssistantNotice({ countryName }: { countryName: string }) {
  return (
    <>
      <p>
        The assistant on the Support page uses an AI service run by Anthropic, hosted outside {countryName}. When you ask it something, it is sent your question, the conversation so far, and only the account details it looks up to answer, such as an invoice&apos;s lines or a list of your services. It is never sent passwords, sign-in codes, card numbers, our bank details or any keys.
      </p>
      <p>
        Every lookup it makes is written to your organisation&apos;s activity log on the Security page. It can&apos;t change anything on your account unless you press Confirm. If you&apos;d rather it didn&apos;t see your data, ask our team instead: a person answers every ticket.
      </p>
    </>
  );
}
