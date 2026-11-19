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

The app opens at `/login`. Use **admin@zahraplast.com** with password **Zahra@123**; both are displayed below the login button. There is one workspace account, with no role selection or team management. All workspace routes require a valid local session. Login returns to the requested page and saves the session in localStorage for 24 hours from login. Refreshing or reopening the app preserves the original expiry. At expiry, the saved session is removed and the user is automatically returned to login; logout also signs out other open tabs.

The branding correction includes the demo credentials and storage namespace. Existing browser workspace data migrates automatically; users of the previous version sign in again with the credentials above.

Authentication is a frontend demo gate, not a server security boundary: the displayed credentials and browser storage are client-controlled. Production access control requires a backend. Authentication sessions are separate from workspace data.

## Included modules

| Module | Working behavior |
| --- | --- |
| Overview | Date-filtered invoice activity, catalog/customer/product-discount counts, recent invoices, review shortcuts |
| Product catalog | All 317 products, original photographs, search, filters, table/grid views, source details, create/edit, optional image attachment |
| Customers | 150 clearly labeled sample records, groups, payment terms, create/edit, pricing and invoice summaries |
| Suppliers and brands | Eight source brands, catalog counts, editable contacts/terms, add supplier |
| Discount matrix | Customer-specific product percentages, discounted-product list, search and brand/category filters, immediate saves, dated pricing, bulk adjustments and Excel price sheets |
| Quotations | Editable drafts, saved pricing snapshots, conversion retaining prices and override labels |
| Invoices | Packs/cartons, per-line/all-line overrides, reasons, reset, draft/post lifecycle, locked posted documents, print/PDF |
| Returns and corrections | Partial/full credit notes using original prices, cumulative return limits, controlled reversal with a reason |
| Sign-in | One demo account, protected workspace routes, expiring local session, logout across tabs |

Reports & analytics, Activity log, and Import & export were removed from the application on 20 November 2026 at the user's request. Their routes and navigation shortcuts are unavailable. Invoice Print/PDF and the discount matrix's Price sheet download remain available. Existing rate versions and audit records are retained in local workspace data.

## Data provenance

- `database/products.json`: all **317 source products**, including **309 numeric list prices**.
- `database/images/`: **309 actual photographs cropped from the provided PDF**, with no generated replacement product pictures.
- `database/suppliers.json` and `categories.json`: **8 source brands and 15 categories**.
- Prices are **PKR per selling pack or set**, not procurement costs. All `costPrice` fields are `null` because no costs were supplied.
- Eight unpriced products and five additional products requiring confirmation are initially inactive: source serials **85, 106, 117, 149, 185, 186, 190, 191, 207, 255, 256, 257, 288**. Their original values are retained with verification notes.
- The generated `ZP-001` product codes are local identifiers; `sourceSerial` and `sourcePage` preserve original catalog references.
- Customer records, users, product discounts, quotations, and invoices are explicitly **sample data**. The PDFs did not include real customer identities or agreements. Supplier contacts remain blank.

Read [database/README.md](database/README.md) for storage and provenance details. The original PDFs and the complete extracted source reference remain in the repository.

## Modular architecture

```text
database/                 Source-backed JSON, sample masters, seed builder, images
src/
  app/                    Routes and lazy-loaded feature modules
  components/
    layout/               Shared shell, sidebar, logout menu, action feedback
    ui/                   Buttons, fields, dialogs, badges, tables, reusable primitives
  modules/                Active UI modules listed below
    dashboard/ catalog/ customers/ suppliers/ pricing/
    sales/ auth/
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

Features share domain types and a centralized action boundary. UI components do not write the database directly. `src/state/operations.ts` enforces permission checks and lifecycle invariants; `src/lib/pricing.ts` resolves dated product percentages and computes selling-unit/carton totals. Route-level code splitting keeps the spreadsheet engine out of the initial route.

## Local persistence

Seed records and original pictures live in `database/`. Runtime edits are saved to this browser's **IndexedDB**, with atomic serialized writes and visible error feedback. They do not rewrite repository seed files. There is no external database integration or network API.

The local store supports the initial **47,550 customer-product combinations** without relying on the much smaller localStorage quota. The current UI has no workspace backup/restore or data migration page; local changes remain tied to this browser and device. Concurrent editing across multiple tabs/users is not synchronized; production collaboration will require a backend.

## Pricing guarantees and explicit preview decisions

Ordinary invoice save/post operations never update the discount matrix. Posted invoices are immutable; quotes and credits retain their applicable snapshots. Changes record their actor, time, and old/new values. The optional Save to matrix operation is off by default. If enabled in an existing or restored workspace, it requires explicit confirmation by the signed-in account. Company details, numbering, and pricing policies remain in workspace data and backups; the Settings screen is not included in the current UI.

The scope leaves several choices unresolved. This implementation makes them explicit:

- The discount matrix accepts percentages for one customer and one product only. Legacy brand, category, customer-default, and fixed-price matrix records stay stored for compatibility but do not determine live pricing.
- New invoice lines automatically receive the saved percentage for their customer/product and document date. Reset re-evaluates that percentage; existing saved lines otherwise keep snapshots.
- A fixed discount subtracts a PKR amount from each selling unit's list rate: PKR 1,200 less PKR 300 leaves PKR 900. Applying it to all lines uses the same deduction per selling unit, not a single deduction from the document total.
- Quote conversion keeps quoted rates as well as discounts, and initially keeps the quote date.
- Discount dates have inclusive endpoints. Active percentage discounts for the same customer/product cannot overlap.
- Matrix percentages are finite values from 0 to 100. Manual invoice/quotation overrides also support PKR amount discounts from zero up to the affected selling-unit list price. Legacy saved fixed net prices keep their original meaning and totals.
- Unit net prices round to two decimals, then line totals; invoice totals sum the rounded lines.
- Product discounts save immediately, including in restored workspaces with a legacy approval flag. Historical approval records remain stored but no approvals UI or automatic approval is used.
- Existing product rates remain read-only in the catalog editor. Stored dated rate versions still resolve prices, but the rate-list import/history UI has been removed.

See [scope coverage](docs/SCOPE_COVERAGE.md) and the [user guide](docs/USER_GUIDE.md). Tax changes, margin reports, procurement, stock control, e-commerce, CRM, and unnamed accounting integrations are outside this frontend delivery. Actual customer migration, business-rule confirmation, client UAT sign-off, production authentication, hosting, and go-live remain future work.

## Verification

```sh
npm test
npm run build
npm run test:e2e
```

Unit tests cover product-only percentages, legacy record compatibility, dates, numeric validation, permissions, invoice/matrix separation, locked documents, quoted pricing, returns, rate versions, audit behavior, backup validation, full-matrix scale, and real CSV/XLSX parsing. Browser tests cover real user workflows and responsive page bounds.

Historical pricing simplification verification (before the report/import pages were removed): **49 unit tests passed**, **13 pricing, invoice, and responsive browser scenarios passed**, and the production build passed. Tests cover customer/product percentage isolation, automatic invoice pricing, invalid percentage rejection, zero reset, retained historical snapshots, legacy pricing compatibility, imports/exports and mobile layouts. The renamed product-discount PDF was also downloaded and visually checked. Client acceptance against actual customer discount data remains a separate business step.

On Windows, browser tests use installed Microsoft Edge. Elsewhere, install the Playwright Chromium browser with `npx playwright install chromium`. `PLAYWRIGHT_BROWSER_CHANNEL` can select another installed channel. The test runner starts or reuses the local Vite server.

`node scripts/visual-check.mjs` saves local desktop/mobile screenshots in ignored `tmp/qa/`. `python scripts/extract-catalog.py` rebuilds the product/image seeds from the PDF using pypdfium2 and Pillow; normal application use does not require Python.

The project uses the React/Vite client application approach described in the [official React guide](https://react.dev/learn/build-a-react-app-from-scratch) and [Vite documentation](https://vite.dev/guide/).

## Git

This folder is a Git repository on branch `main`, with `origin` pointing to [Shaikh-Muhammad-Saad/zahra-plast-prototype](https://github.com/Shaikh-Muhammad-Saad/zahra-plast-prototype). Generated builds, dependencies, temporary screenshots, browser-test results, and environment files are ignored.
