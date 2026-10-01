import "server-only";

/**
 * Every secret the console holds: API keys and vendor credentials. They
 * are read here and nowhere else, never logged and never sent to the
 * browser or to the assistant.
 *
 * Today they come from environment variables. To move to a vault, add a
 * SecretSource that reads from it and pass it to useSecretSource() at
 * start-up; nothing else changes.
 */

export type SecretName =
  | "TOTP_ENCRYPTION_KEY"
  | "ANTHROPIC_API_KEY"
  | "WHMCS_API_IDENTIFIER"
  | "WHMCS_API_SECRET"
  | "WHMCS_ACCESS_KEY"
  | "WHMCS_SYNC_SECRET"
  | "MICROSOFT_CLIENT_SECRET"
  | "GOOGLE_CLIENT_SECRET";

export interface SecretSource {
  get(name: SecretName): string | undefined;
}

const envSource: SecretSource = {
  get: (name) => {
    const v = process.env[name];
    return v === "" ? undefined : v;
  },
};

let source: SecretSource = envSource;

export function useSecretSource(next: SecretSource) {
  source = next;
}

export function secret(name: SecretName): string | undefined {
  return source.get(name);
}

export function requireSecret(name: SecretName): string {
  const v = source.get(name);
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

/** The key that seals authenticator secrets: exactly 32 random bytes, base64. */
export function totpKey(): string {
  const key = requireSecret("TOTP_ENCRYPTION_KEY");
  if (Buffer.from(key, "base64").length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must be 32 random bytes, base64 encoded.");
  return key;
}
