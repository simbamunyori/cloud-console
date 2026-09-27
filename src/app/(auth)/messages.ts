function timeIn(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Gaborone" }).format(d);
}

export function lockedMessage(until?: Date | null): string {
  return until && !Number.isNaN(until.getTime())
    ? `Too many attempts. For your safety, sign-in is paused until ${timeIn(until)}.`
    : "Too many attempts. For your safety, sign-in is paused for 15 minutes.";
}

export function rateLimitedMessage(retryAt: Date): string {
  return `Too many tries from this network. Try again after ${timeIn(retryAt)}.`;
}
