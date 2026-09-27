# Design audit

Change Request 01, section 5 sets the bar for every screen. This is the audit of every Phase 1 screen against that list, what was wrong, and what changed. The checks that keep it true run in CI (see "Kept true by" at the end).

## The standard, point by point

| Point | Before | Fix |
| --- | --- | --- |
| Colours, sizes, radii and shadows from the brand tokens only | Mostly true. Thirteen one-off values: `text-[14px]` on five auth screens, `max-w-[440px]` (auth form), `w-[calc(100%-32px)] max-w-[520px]` (dialog), `max-w-[85vw]` (mobile menu), `size-[18px]` (nav and sign-out icons), `size-[176px]` (authenticator QR code), `max-w-[36rem]` and `grid-cols-[1fr_16rem]` (assistant), `grid-cols-[1fr_24rem]` (product), `grid-cols-[7rem_1fr_8rem_8rem]` (statement), `grid-cols-[1fr_220px]` (team invite), `min-w-[60rem]` (admin pricing table), `duration-150` (country switcher). Two checkboxes used `accent-[var(--brand)]`, a variable that doesn't exist, so they showed the browser's default blue. | Each one now uses a token: `text-callout`, new layout tokens (`form`, `dialog`, `drawer`, `aside`, `asideWide`, `columnDate`, `columnAmount`), the 4 px spacing scale (`size-44`, `min-w-240`), `accent-brand`, and motion tokens. A test fails the build on any new hex or rgb colour, arbitrary Tailwind value or numeric duration (`tests/design-tokens.test.ts`). |
| One type scale | True. Eight sizes from `tokens.json`, hero added for the site. | None. `cn()` now knows the hero size so it merges correctly. |
| 4 and 8 px spacing grid | True in practice: Tailwind's spacing unit is the 4 px token, so every `p-*`, `gap-*` and size is a multiple of 4 px (half steps such as `py-0.5` are 2 px, used only inside badges). | None. Note: the brand pack's `space` list names seven steps (4, 8, 12, 16, 24, 32, 48, 64); Tailwind's numbered scale is the same grid with every step in between, and `space-5` in the pack is `6` in Tailwind. |
| One icon set | True. Lucide only; the only other SVGs are the logo files. | None. |
| One component library | True. Buttons, fields, cards, badges, alerts, dialogs and empty states come from `src/components/ui`. | Added `Skeleton`, `LoadingPage`, `SectionError` and `ThemeSwitch` there. |
| Designed loading states, skeletons not spinners | Missing. No console page had a `loading.tsx`, so navigation froze on the old page until the new one arrived. | A `loading.tsx` for every customer and staff page, drawn with skeletons in the page's own shape (home, list, cards, detail, form), sized like the real content so nothing shifts when it lands. Skeletons pulse gently and hold still under reduced motion. |
| Designed empty states | Mostly present. Missing on the marketplace (a market with no approved prices showed only the search box) and staff orders (an empty card). | Both now use `EmptyState` with what to do next. |
| Designed error states | One `error.tsx` for the whole customer console; nothing for staff, sign-in or the site; a bare Next.js 404. | An `error.tsx` per section in both consoles naming what failed, one for sign-in pages and the site, a `global-error.tsx`, and a designed 404 with a way home. |
| No layout shift | Fonts load through `next/font` with `display: swap` and metric fallbacks; images have width and height. | Skeletons match page shapes (above). The theme is rendered on the server from a cookie, so there is no flash of the wrong theme. |
| Motion 150 to 250 ms, respecting reduced motion | Transitions used Tailwind's built-in 150 ms default; no motion tokens. The reduced-motion rule shortened durations but left looping animations running. | Motion tokens `fast` 150 ms, `base` 200 ms, `slow` 250 ms and one easing curve. The default transition uses `fast`; `duration-fast`, `duration-base` and `duration-slow` are the only durations allowed. Reduced motion now also stops repeating animations and smooth scrolling. |
| Light and dark themes | Both themes existed, following the device only. | A light, dark or "match device" switch at the bottom of both consoles' sidebars (and mobile menus) and in the site footer. The choice is a cookie, read by the root layout, so every page renders in it from the first byte; the browser bar colour follows it too. |
| WCAG 2.2 AA contrast | axe found three colour pairs below 4.5:1 across the consoles and site (below). | Fixed, below. |
| Full keyboard use, visible focus | Skip links, visible focus rings and native controls throughout. | The theme switch is a real radio group, so arrow keys move between options and the focus ring shows on the option. |
| Links distinguishable without colour | axe found links inside grey text (customer name in staff orders, tasks and tickets; "contact support" on a service; statement invoice links) marked only by colour. | Inline links are underlined. Standalone links (card actions such as "See all") keep underline on hover. |
| Performance at Google's good thresholds | Not measured. | Lighthouse runs in CI on the public pages with budgets (milestone 7). |
| Real product imagery | The site hero uses real console screenshots with demo data. | None. |

## Contrast fixes

The brand pack's colours are unchanged. Three screen tokens, which `tokens.json` keeps under `console` so the brand block stays as supplied, were nudged just enough to pass AA:

| Where | Was | Contrast | Now | Contrast |
| --- | --- | --- | --- | --- |
| White labels on filled blue buttons, count badges | Electric Blue `#2F6BFF` | 4.49:1 (BRAND.md rounds this to 4.5; axe does not) | `#2E68F7`, hover `#2458E0` | 4.73:1, 5.92:1 |
| Blue text on the pale blue tint in dark mode (current nav item, badges) | `#5B8CFF` | 4.03:1 | `#7AA2FF` | 5.13:1 |
| Red text on the pale red tint in light mode (overdue badges, errors) | `#C8373D` | 4.32:1 | `#B83238` | 4.90:1 |

Electric Blue itself still carries the brand: the logo, focus rings, accents, charts and the gradient. The button blue is 3% darker and looks the same side by side. Hover used to lighten buttons (blue at 90% opacity on white), which lowered contrast further; it now darkens. Emails use the same button blue.

## Screen by screen

Every screen below passes axe (WCAG 2.0, 2.1 and 2.2 A and AA rules) in light and dark after the fixes, and has loading, empty and error states.

**Public site** (home, pricing, security, legal pages): built in milestone 5 to this standard. Added the theme switch to the footer.

**Sign-in, sign-up, sign-in code, authenticator setup, invitation, staff sign-in:** the five one-off 14 px text sizes became `text-callout`; the QR code size is now on the grid; the "I've saved these codes" checkbox now uses the brand colour instead of the browser default. Added an error page.

**Home:** loading skeleton with the three totals and two panels; statement links underlined; "To pay now" button contrast.

**Marketplace, product, domain search:** loading skeletons (cards, detail, form); empty state when a market has nothing priced; product page aside width is a token.

**Services, service detail, order detail:** loading skeletons; "contact support" link underlined; error page.

**Billing, invoice, statement, payment methods:** loading skeletons; statement column widths are tokens; error page.

**Support, new ticket, ticket, assistant:** loading skeletons; assistant bubble and side column widths are tokens; error page.

**Team, security, settings:** loading skeletons; the role picker's radio buttons use the brand colour (they used an inline variable); invite form columns are a ratio, not a pixel width; error pages.

**Staff console** (overview, customers, customer, setup queue, tickets, ticket, orders, EFT payments, pricing, markets, market, waiting list): loading skeletons and an error page for every section; nav count badges and the current nav item pass contrast in both themes; customer links in lists are underlined; orders has an empty state; the pricing table's minimum width is on the grid.

**Dialogs and the mobile menu:** widths are tokens capped by the screen, so they never touch its edges.

## Kept true by

- `tests/design-tokens.test.ts`: no hex or rgb colours, arbitrary values or numeric durations outside `src/config/theme/`.
- `e2e/a11y.spec.ts`: axe on every page in both themes (milestone 7 runs it in CI).
- Lighthouse budgets on the public pages (milestone 7).
