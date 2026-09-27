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
