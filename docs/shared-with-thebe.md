# Code shared with Thebe

These modules were copied from `simbamunyori/thebe` at commit `c0dae47`
and adapted. When a security fix lands in one project, check the same
module in the other.

| Console file | From Thebe | What changed |
| --- | --- | --- |
| `src/server/auth/password.ts` | `src/server/auth/password.ts` | Nothing |
| `src/server/auth/totp.ts` | `src/server/auth/totp.ts` | The issuer name is passed in (the console name is in config) |
| `src/server/auth/recovery-codes.ts` | `src/server/auth/recovery-codes.ts` | Nothing |
| `src/server/auth/secret-box.ts` | `src/server/auth/secret-box.ts` | Nothing |
| `src/server/db.ts` | `src/server/db.ts` (`tenantDb`, `scopeArgs`) | Console models; `updateManyAndReturn` and `upsert` updates also refuse to move rows between organisations |
| `src/lib/domain/money.ts` | `src/lib/domain/money.ts` | Every amount carries a currency; currency table with decimal places; arithmetic refuses to mix currencies |
| `src/lib/dates.ts`, `src/lib/cn.ts`, `src/lib/initials.ts` | same paths | Nothing of substance |
| `src/components/ui/*` (button, field, inputs, alert, dialog, code input, password field, empty state, page header) | same paths | Restyled through theme tokens; select chevron is an icon instead of an inline SVG colour |
| `Dockerfile`, `Caddyfile`, `.github/workflows/ci.yml` | same paths | Names; CI adds `npm audit` and the copy check |
