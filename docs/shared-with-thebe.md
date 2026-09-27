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
| `src/server/auth/service.ts` | `src/server/auth/service.ts` | Separate customer and staff sessions (`audience`); sign-in history rows; security emails queued in the same transaction; invitations minted at send time and stored only as a hash |
| `src/server/auth/next.ts` | `src/server/auth/next.ts` | Two cookies (customer, and staff with SameSite strict); `__Host-` prefix in production; staff idle timeout |
| `src/server/auth/tokens.ts` | part of `src/server/auth/service.ts` | Split out so invitations and sessions share it |
| `src/server/org/access.ts` | `src/server/org/access.ts` | Console roles (Owner, Admin, Billing only, Read only) and permissions |
| `src/server/org/audit.ts` | `src/server/org/audit.ts` | Actor kinds include staff and the assistant; staff events can never be hidden |
| `src/server/org/context.ts`, `src/server/org/members.ts` | same paths | Console roles; removing someone ends their sessions |
| `src/app/(auth)/*` (sign-in, code, authenticator set-up, sign-up, invitation) and `src/components/auth/*` | same paths | Brand pack styling; the staff console reuses the forms |
| `src/server/db.ts` | `src/server/db.ts` (`tenantDb`, `scopeArgs`) | Console models; `updateManyAndReturn` and `upsert` updates also refuse to move rows between organisations |
| `src/lib/domain/money.ts` | `src/lib/domain/money.ts` | Every amount carries a currency; currency table with decimal places; arithmetic refuses to mix currencies |
| `src/lib/dates.ts`, `src/lib/cn.ts`, `src/lib/initials.ts` | same paths | Nothing of substance |
| `src/components/ui/*` (button, field, inputs, alert, dialog, code input, password field, empty state, page header) | same paths | Restyled through theme tokens; select chevron is an icon instead of an inline SVG colour |
| `Dockerfile`, `Caddyfile`, `.github/workflows/ci.yml` | same paths | Names; CI adds `npm audit` and the copy check |
