/**
 * Before sign-in we don't know the person's time zone, so waits are given
 * as a length of time, never as a clock time in one country.
 */
function wait(until: Date, now = new Date()): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

export function lockedMessage(until?: Date | null, now?: Date): string {
  return until && !Number.isNaN(until.getTime())
    ? `Too many attempts. For your safety, sign-in is paused for ${wait(until, now)}.`
    : "Too many attempts. For your safety, sign-in is paused for 15 minutes.";
}

export function rateLimitedMessage(retryAt: Date, now?: Date): string {
  return `Too many tries from this network. Try again in ${wait(retryAt, now)}.`;
}

type Notice = { tone: "info" | "negative" | "positive"; text: string };

/** After a Microsoft or Google round trip that didn't sign the person in. */
export function oauthMessage(reason: string, slug: string | undefined): Notice {
  const p = slug === "google" ? "Google" : "Microsoft";
  switch (reason) {
    case "cancelled":
      return { tone: "info", text: `The ${p} sign-in was cancelled.` };
    case "no-email":
      return { tone: "negative", text: `Your ${p} account didn't share an email address, so we can't match it to an account. Sign in with your email instead.` };
    case "unverified":
      return { tone: "negative", text: `${p} hasn't confirmed that this email address is yours, so we can't use it to sign in. Sign in with your email instead.` };
    case "deactivated":
      return { tone: "negative", text: "That account can't sign in here. Contact us if you think that's wrong." };
    case "unknown-staff":
      return { tone: "negative", text: "That Microsoft account isn't a staff account here. Use your Fourth Generation Technologies account." };
    case "busy":
      return { tone: "negative", text: "Too many tries from this network. Try again in a few minutes." };
    default:
      return { tone: "negative", text: `The ${p} sign-in didn't finish. Try again.` };
  }
}
