# Zehra Plast scope coverage

This is the frontend implementation of the scope dated 15 November 2026. Source requirements are product specifications, not instructions granting permission to publish, integrate services, or incur costs. The user's later direction sets the name to **Zehra Plast** and limits the build to React with local data. The Settings screen is omitted by later user direction; existing company and pricing policies remain in workspace data and backups.

| Scope section | Implementation | Verification or remaining business work |
| --- | --- | --- |
| 1 Objectives and scale | Dashboard, matrix, invoices; 317 products and 150 sample customers | Tests cover a full 47,550-rule matrix. Actual customer agreements must be supplied. |
| 2.1 Product master | Catalog editor, images, status, packing, carton counts, source identifiers | All source rates preserved; flagged products inactive; costs unavailable. |
| 2.2 Supplier/customer masters | Dedicated modules and import/export | Source brands loaded; real contact/customer data still needed. |
| 2.3 Versioned rates | Rate import/history, effective-date resolution, scheduled activation | Existing documents and agreements remain unchanged. |
| 3.1 Pricing types | Percentage and fixed net unit price, dates and status | Unit tests and real-browser edits. |
| 3.2 Hierarchy | Product, brand/category, customer default, list rate | Stored brand/category policy retained; brand wins by default. No policy editor in the current UI. |
| 3.3 Bulk operations | Rules import/export, full resolved matrix export, mass updates, customer/group copies | Invalid rows rejected with error output; percentage-point semantics explicit. |
| 3.4 Permissions/audit | Central actions, optional approvals, old/new values | Current user direction replaces role selection with one locally authenticated workspace account. |
| 4 Requirements 1-8 | Automatic fill, individual/all-line overrides, original/applied values, labels, reset, reasons | Browser tests verify matrix unchanged on save/post. |
| 4 Requirements 9-12 | Posted lock, stable drafts, quote conversion, original-price credits/returns | Tests verify persistence, quote snapshots, original pricing and cumulative return limits. |
| 4 Requirement 13 | Optional deliberate Save to matrix, off by default | Signed-in account explicitly confirms; ordinary save/post never calls it. |
| 4.1 Override reporting | Detail, frequency by user/customer/product, value impact | Actor/time tracked per override; only posted invoice lines used in financial reports. |
| 5.1 Invoice presentation | List price, agreement, discount amount, net price, totals, packing and cartons | Print layout and browser Save as PDF; inactive products excluded. |
| 5.2 Reports | Customer sheet, comparison, dated brand discount/net-price summaries with customer filters and coverage, missing-rule report, audit, overrides | CSV/XLSX include effective discount mean/range and mean net/discount per selling unit; unweighted catalog averages, not sales totals. Missing means no applicable rule at any level. |
| 5.3 Roles | Deferred by later user direction: one account with login/logout | All private routes require a valid local session; role and team UI removed. Legacy records retained for compatibility. |
| 6 Technical approach | Modular React/TypeScript, shared contracts, secure-input practices | Central server/database/login deliberately deferred by user. |
| 6.1 Costs/margins | Optional nullable cost field retained | No fabricated costs; margin functionality excluded. |
| 7 Migration | Complete source transcription, source image extraction, validation and inactive exceptions | Real client pricing and corrected disputed fields remain required. |
| 8 Exclusions | Tax configuration, margin/procurement/promotion/integration features omitted | No unrelated ERP/e-commerce modules added. |
| 9 Deliverables | Working frontend, templates, reports, audit, tests, standalone user guide and documentation | Commercial sign-off, training sessions, production go-live support remain future delivery steps. |
| 10-13 Timeline and responsibilities | Preserved in original project reference | Original 9-14 week indicative estimate is not a new delivery promise. |
| 14 Acceptance | Automated unit and real-browser tests; manual visual review | Client UAT and >=5% matching against actual agreement sources await supplied client data. |
| 15-16 Change/approval | Explicit decisions and original unsigned scope preserved | No signature or acceptance was inferred from the filename. |

## Suggested client acceptance walkthrough

1. Verify the original 317 entries, eight brands, 15 categories, and unavailable rates. Compare source serial #191: the original 105 stays intact and inactive.
2. Replace sample customer records/agreements through reviewed imports. Reconcile at least 5% of actual loaded discount records against the supplied source.
3. Set a customer-product percentage and fixed price; test inheritance and the configured brand/category tie-break.
4. Override one invoice line and then all lines. Inspect original/applied values and the reason. Confirm the saved rules are identical before and after.
5. Reset a draft to matrix; update master pricing and confirm other saved drafts remain unchanged without a reset.
6. Post the invoice, reload the page, and verify its pricing is locked.
7. Convert an overridden quote; verify preserved rates, agreements, and labels.
8. Issue a partial credit, verify original prices, and verify over-return quantities are rejected.
9. Import a new dated rate list. Verify old invoices stay unchanged and later documents use the new rate.
10. In an existing or restored approval-enabled workspace, confirm a submitted rule remains pending until review.
11. Log out, open a private route directly, and confirm redirection to login. Log in and verify return to the intended page; confirm logout also signs out another open tab.
12. Review/export reports, audit changes, save a backup, and restore it into a separate local preview.

## Boundaries before production

Server authentication/authorization, protected shared persistence, concurrency controls, server audit retention, backups/recovery, deployment, account provisioning, and any accounting integration need a future backend phase. The current frontend uses a single demo login, route guards, expiring browser sessions, and IndexedDB. The user explicitly requested displayed credentials; this local sign-in is not a production security boundary.
