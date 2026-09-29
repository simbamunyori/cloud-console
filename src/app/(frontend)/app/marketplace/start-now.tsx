/** The customer's consent for a service to start before the consumer cooling-off period ends (refunds policy, section 1). */
export function StartNowField({ id, refundsHref, error }: { id: string; refundsHref: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-start gap-3 text-callout text-ink">
        <input
          id={id}
          type="checkbox"
          name="startNow"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-4 shrink-0 accent-brand"
        />
        <span>
          Start this service now. If I&apos;m ordering as a consumer, I understand I can&apos;t cancel it under the seven-day cooling-off period once it has started.{" "}
          <a href={refundsHref} target="_blank" rel="noopener" className="text-link underline">
            Refund policy
          </a>
        </span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="text-callout text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
