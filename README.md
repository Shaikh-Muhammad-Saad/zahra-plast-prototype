# Zahra Plast

A modular React administration workspace for the Zahra Plast distribution business. The project name is **Zahra Plast**, superseding the earlier working name Zahra Plus.

The app covers the supplied pricing and invoicing scope as a **frontend-only implementation**. It includes the real catalog, local editing and persistence, complete sample workflows, and a responsive interface. No backend, external database, or hosting account is configured.

## Run locally

Use Node.js 24 LTS (the implementation was tested with Node 24.21) and npm.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**. In Windows PowerShell, use `npm.cmd` if the shell blocks `npm.ps1`:

```powershell
npm.cmd install
npm.cmd run dev
```

The app opens at `/login`. Use **admin@zahraplast.com** with password **Zahra@123**; both are displayed below the login button. There is one workspace account, with no role selection or team management. All workspace routes require a valid local session. Login returns to the requested page; sessions last eight hours, survive refresh, and logout signs out other open tabs.

The branding correction includes the demo credentials and storage namespace. Existing browser workspace data migrates automatically; users of the previous version sign in again with the credentials above.

Authentication is a frontend demo gate, not a server security boundary: the displayed credentials and browser storage are client-controlled. Production access control requires a backend. Authentication sessions are separate from workspace data and are never included in workspace backups.

## Included modules

| Module | Working behavior |
| --- | --- |
| Overview | Date-filtered invoice activity, catalog/customer/rule counts, recent invoices, review shortcuts |
| Product catalog | All 317 products, original photographs, search, filters, table/grid views, source details, create/edit, optional image attachment |
| Customers | 150 clearly labeled sample records, groups, payment terms, create/edit, pricing and invoice summaries |
| Suppliers and brands | Eight source brands, catalog counts, editable contacts/terms, add supplier |
| Discount matrix | Percentage/fixed pricing, product/brand/category/customer hierarchy, dates, bulk adjustments, copying, approval review |
| Quotations | Editable drafts, saved pricing snapshots, conversion retaining prices and override labels |
| Invoices | Packs/cartons, per-line/all-line overrides, reasons, reset, draft/post lifecycle, locked posted documents, print/PDF |
| Returns and corrections | Partial/full credit notes using original prices, cumulative return limits, controlled reversal with a reason |
| Reports | Customer discount sheet, product comparison, brand discount/price summaries and coverage, missing rules, override details/frequency/impact, CSV/XLSX export |
| Activity log | Actor/date/action, old and new values, filtering, detail inspection, CSV export |
| Import and export | CSV/XLSX templates, parsed previews, row validation, error downloads, valid-row application, master/rule/matrix PDF and Excel exports |
| Rate lists | Dated price versions, scheduled activation, unchanged customer agreements and old invoices |
| Workspace backup | JSON backup and validated restore through Import & export |
| Sign-in | One demo account, protected workspace routes, expiring local session, logout across tabs |

## Data provenance

- `database/products.json`: all **317 source products**, including **309 numeric list prices**.
- `database/images/`: **309 actual photographs cropped from the provided PDF**, with no generated replacement product pictures.
- `database/suppliers.json` and `categories.json`: **8 source brands and 15 categories**.
- Prices are **PKR per selling pack or set**, not procurement costs. All `costPrice` fields are `null` because no costs were supplied.
- Eight unpriced products and five additional products requiring confirmation are initially inactive: source serials **85, 106, 117, 149, 185, 186, 190, 191, 207, 255, 256, 257, 288**. Their original values are retained with verification notes.
- The generated `ZP-001` product codes are local identifiers; `sourceSerial` and `sourcePage` preserve original catalog references.
- Customer records, users, discount rules, quotations, and invoices are explicitly **sample data**. The PDFs did not include real customer identities or agreements. Supplier contacts remain blank.

Read [database/README.md](database/README.md) for storage and provenance details. The original PDFs and the complete extracted source reference remain in the repository.

## Modular architecture

```text
database/                 Source-backed JSON, sample masters, seed builder, images
src/
  app/                    Routes and lazy-loaded feature modules
  components/
    layout/               Shared shell, sidebar, logout menu, action feedback
    ui/                   Buttons, fields, dialogs, badges, tables, reusable primitives
  modules/
    dashboard/ catalog/ customers/ suppliers/ pricing/
    sales/ reports/ audit/ transfers/ auth/
  state/                  Permission-checked operations, provider, local persistence
  lib/                    Pricing engine, validation, spreadsheet tools, formatting
  types/                  Shared domain contracts
  styles/                 Design tokens, global components, responsive layout
tests/e2e/                Real-browser workflow tests
scripts/                  Reproducible PDF image extraction and visual checks
docs/                     Scope mapping, decisions, and user guide
design-system/            UI/UX Pro Max guidance and application-specific decisions
project-reference/        Original complete document transcription and product index
```

Features share domain types and a centralized action boundary. UI components do not write the database directly. `src/state/operations.ts` enforces permission checks and lifecycle invariants; `src/lib/pricing.ts` resolves dated rules and computes selling-unit/carton totals. Route-level code splitting keeps the spreadsheet engine out of the initial route.

## Local persistence

Seed records and original pictures live in `database/`. Runtime edits are saved to this browser's **IndexedDB**, with atomic serialized writes and visible error feedback. They do not rewrite repository seed files. There is no external database integration or network API.

The local store supports the initial **47,550 customer-product combinations** without relying on the much smaller localStorage quota. Export a JSON backup from Import & export before clearing browser data or moving devices. Concurrent editing across multiple tabs/users is not synchronized; production collaboration will require a backend.

## Pricing guarantees and explicit preview decisions

Ordinary invoice save/post operations never update the discount matrix. Posted invoices are immutable; quotes and credits retain their applicable snapshots. Changes record their actor, time, and old/new values. The optional Save to matrix operation is off by default. If enabled in an existing or restored workspace, it requires explicit confirmation by the signed-in account. Company details, numbering, and pricing policies remain in workspace data and backups; the Settings screen is not included in the current UI.

The scope leaves several choices unresolved. This implementation makes them explicit:

- Brand precedes category when both match by default; restored workspaces retain their saved policy.
- Reset resolves saved rules as of the document date. Existing drafts otherwise keep snapshots.
- Whole-document fixed pricing sets one identical **per-selling-unit** price on each line.
- Quote conversion keeps quoted rates as well as discounts, and initially keeps the quote date.
- Discount dates have inclusive endpoints. Active rules at the same specificity cannot overlap.
- Percentages are finite values from 0 to 100, with no additional managerial cap. Fixed net prices must be positive.
- Unit net prices round to two decimals, then line totals; invoice totals sum the rounded lines.
- Approval is off initially; an existing or restored approval-enabled workspace retains its review workflow, including review of the signed-in account's own requests.
- Existing product rates change through a new dated rate list, not product-master edits.

Brand discount reports resolve the full customer-pricing hierarchy for the chosen date and customer scope. They show coverage, priced pairs, mean/min/max effective discount, and mean net/discount PKR per selling unit. These are unweighted catalog averages across different selling packs and sets, not sales totals; missing rates are excluded and inactive catalog items remain included.

See [scope coverage](docs/SCOPE_COVERAGE.md) and the [user guide](docs/USER_GUIDE.md). Tax changes, margin reports, procurement, stock control, e-commerce, CRM, and unnamed accounting integrations are outside this frontend delivery. Actual customer migration, business-rule confirmation, client UAT sign-off, production authentication, hosting, and go-live remain future work.

## Verification

```sh
npm test
npm run build
npm run test:e2e
```

Unit tests cover hierarchy, dates, numeric validation, permissions, invoice/matrix separation, locked documents, quoted pricing, returns, rate versions, audit behavior, backup validation, full-matrix scale, and real CSV/XLSX parsing. Browser tests cover real user workflows and responsive page bounds.

Latest delivery verification: **42 unit tests passed**, **22 browser scenarios passed** (seven authentication cases and 15 business workflows), and the production build passed. Login, logout, direct-route protection, session expiry, cross-tab logout, removed header controls, and 375/390px mobile layouts were reviewed. Earlier print verification confirmed a five-line invoice on one complete A4 page. The original PDFs' SHA-256 hashes still match the source manifest. Client acceptance against actual customer agreements remains a separate business step.

On Windows, browser tests use installed Microsoft Edge. Elsewhere, install the Playwright Chromium browser with `npx playwright install chromium`. `PLAYWRIGHT_BROWSER_CHANNEL` can select another installed channel. The test runner starts or reuses the local Vite server.

`node scripts/visual-check.mjs` saves local desktop/mobile screenshots in ignored `tmp/qa/`. `python scripts/extract-catalog.py` rebuilds the product/image seeds from the PDF using pypdfium2 and Pillow; normal application use does not require Python.

The project uses the React/Vite client application approach described in the [official React guide](https://react.dev/learn/build-a-react-app-from-scratch) and [Vite documentation](https://vite.dev/guide/).

## Git

This folder is a Git repository on branch `main`, with `origin` pointing to [Shaikh-Muhammad-Saad/zahra-plast-prototype](https://github.com/Shaikh-Muhammad-Saad/zahra-plast-prototype). Generated builds, dependencies, temporary screenshots, browser-test results, and environment files are ignored.
