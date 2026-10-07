import type { PrismaClient } from "@prisma/client";
import type { DomainAvailability } from "@/server/billing/adapter";
import { featureOn } from "@/server/features/features";
import { partnerConfig, registrarFrom, type PartnerConfig } from "@/server/partners/partners";
import type { Registrar, RegistrarKey } from "./registrar";

/**
 * Which registrar handles a domain right now. .bw endings go to the .bw
 * registry, the rest to Openprovider, each only while its partner is
 * switched on in Admin > Partners and its feature in Admin > Features.
 * Otherwise null: the domain is a staff task, as before.
 */

type Db = Pick<PrismaClient, "partnerSetting" | "featureSwitch">;

export const isBwDomain = (name: string) => name.trim().toLowerCase().endsWith(".bw");

export const registrarKeyFor = (name: string): RegistrarKey => (isBwDomain(name) ? "bw-registry" : "openprovider");

const FEATURE = { openprovider: "openprovider-domains", "bw-registry": "bw-registry-domains" } as const;

/** One adapter per saved configuration, so a sign-in token is reused between requests. */
const built = new Map<string, { stamp: string; registrar: Registrar }>();

let override: ((key: RegistrarKey, config: PartnerConfig) => Registrar) | undefined;
/** Tests replace the real registrars with fakes. */
export function useRegistrarFactory(factory: typeof override) {
  override = factory;
  built.clear();
}

export async function registrarByKey(db: Db, key: RegistrarKey): Promise<Registrar | null> {
  const [config, on] = await Promise.all([partnerConfig(db, key), featureOn(db, FEATURE[key])]);
  if (!config?.enabled || !on) return null;
  if (override) return override(key, config);
  const stamp = JSON.stringify([config.settings, config.secrets]);
  const cached = built.get(key);
  if (cached?.stamp === stamp) return cached.registrar;
  const registrar = registrarFrom(config);
  built.set(key, { stamp, registrar });
  return registrar;
}

export function activeRegistrar(db: Db, name: string) {
  return registrarByKey(db, registrarKeyFor(name));
}

/**
 * The availability check for domain search: live from the registrar when
 * one is on for that ending, else the billing engine's check as before.
 * A registrar that doesn't answer falls back to the billing engine.
 */
export function domainCheck(db: Db, fallback: (name: string) => Promise<DomainAvailability>) {
  return async (name: string): Promise<DomainAvailability> => {
    const registrar = await activeRegistrar(db, name).catch(() => null);
    if (registrar) {
      try {
        const [found] = await registrar.check([name]);
        if (found) return { name: found.name, supported: !found.premium, available: found.available && !found.premium };
      } catch (e) {
        console.warn(`Domain check for ${name} at ${registrar.key} failed; asking the billing engine instead.`, (e as Error).message);
      }
    }
    return fallback(name);
  };
}
