# Change Request 02: website editing and product management

Goal: at launch, staff can change any website content and manage the product catalogue from the admin area, without code changes. Show me your plan before building.

## 1. Website content editing (Payload CMS)

Add Payload CMS (v3) inside the existing Next.js app, storing its content in our Postgres database (its own schema). Check the current Payload docs for installing into an existing app rather than guessing.

Requirements:

- **Staff only.** The editor lives inside the staff admin area. Staff sign in with the same accounts and two-step login as the rest of the admin area. No separate editor passwords.
- **Roles.** Editor (can draft changes) and Publisher (can publish). Every publish is written to the staff audit log.
- **Page builder.** Pages are built from blocks that staff can add, edit, remove and drag to reorder: hero, feature cards, services grid, pricing (reads the price books), text, image and text, FAQ, testimonials, logo strip, call to action, and domain search.
- **Guardrails.** Blocks only use the brand tokens. Editors choose content and options (such as a light or dark section), never colours, fonts or custom code. Prices always come live from the price books and cannot be typed into a page.
- **Live preview** of the page as visitors will see it, on desktop and phone widths, before publishing.
- **Drafts, scheduled publishing and version history** with one-click restore.
- **Per market.** Each page can have different content per market (bw, za, zw, global), with a fallback to the default market when a market has none.
- **Editable everywhere public:** home, pricing page intro, security page, legal pages, header navigation, footer links and contact details, and SEO titles, descriptions and share images for every page.
- **Media library** with automatic image resizing and required alt text.
- **Legal pages** keep the "DRAFT FOR LEGAL REVIEW" banner until a Publisher ticks "Approved by legal", which is recorded in the audit log.
- **Migration.** Move all current public-site copy (and content/legal/ once added) into the CMS as seed content, so the site looks identical after the change.

## 2. Product catalogue management

Staff can create and edit the catalogue in the admin area, without code:

- Product families and products: name, summary, what is included, what is not, category, setup time, minimum term, and availability per market.
- Prices stay in the price books, with the existing approval flow.
- **Fulfilment type** per product: automatic (through a connector), manual (creates a staff task, as now), or **request a quote**. Quote products show a request form instead of an order button, create a lead in the staff console, and let staff send a quote the customer can accept in the console, which then becomes an order.
- **Status** per product: draft (hidden everywhere), internal (visible to staff only), or live. Draft and internal products never appear on the public site, the marketplace or in search results.
- Changes are audited and sync to WHMCS through the existing price sync.

## 3. Future product family: connectivity

Add a "Connectivity" product family with the request-a-quote fulfilment type, set to draft. It stays hidden everywhere until we publish it. Do not mention internet, fibre or wireless services anywhere on the public site or in the console copy.

## Definition of done

- A staff member can change the home page headline, reorder its sections, preview on a phone and publish, with no code change.
- A staff member can create a new product in draft, price it, preview it and publish it.
- A draft product and a draft page are never visible to the public or to customers.
- Tests cover roles, publishing permissions, draft visibility and the price guardrail.
- Updated screenshots of the editor and the catalogue admin.
