import type { IdentityProvider, PrismaClient } from "@prisma/client";
import type { PasskeyRow } from "@/components/auth/passkey-list";
import { formatMoment } from "@/lib/dates";

/** How someone can sign in, for their Security page. */
export async function signInMethods(db: PrismaClient, userId: string, timeZone: string) {
  const [passkeys, identities] = await Promise.all([
    db.passkey.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.externalIdentity.findMany({ where: { userId }, select: { provider: true, email: true } }),
  ]);
  const rows: PasskeyRow[] = passkeys.map((p) => ({
    id: p.id,
    name: p.name,
    detail: `Added ${formatMoment(p.createdAt, timeZone)}${p.lastUsedAt ? `, last used ${formatMoment(p.lastUsedAt, timeZone)}` : ", not used yet"}`,
  }));
  const linked = new Map<IdentityProvider, string>(identities.map((i) => [i.provider, i.email]));
  return { passkeys: rows, linked };
}
