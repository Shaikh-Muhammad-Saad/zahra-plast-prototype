# Zahra Plast local data

`products.json`, `suppliers.json`, `categories.json`, and `images/` preserve the supplied catalog. Product codes `ZP-001` onward are assigned local identifiers; `sourceSerial` and `sourcePage` retain the original references. Prices are PKR per selling unit, not procurement costs. All cost prices remain `null` because none were supplied.

309 actual images were cropped from the PDF. Eight entries have no product image; there are no generated replacements. The catalog contains 309 numeric rates. Thirteen products are inactive pending confirmation: the eight unpriced products, #106 and #117 packing/pricing checks, #190 and #191 missing carton quantities/suspect rate, and #207 image/name capacity disagreement. Their original values remain intact.

`customers.json`, `users.json`, and the product discounts/documents constructed by `index.ts` are explicitly sample data. No real customer names, contacts or pricing agreements were supplied. The 150 sample customer records demonstrate the scope's initial scale. Supplier brand names are real source data; supplier contact information is left blank.

Runtime changes are saved only in this browser's IndexedDB database `zahra-plast-local`. No external database or backend is connected. Writes are atomic and serialized, and pending full snapshots are coalesced so large imports can support the initial 47,550-customer/product matrix. The header reports saving, saved or a persistent save error. Changes are in memory until the save finishes; export a backup if an error occurs. A loading boundary waits for persisted data before opening the workspace. Existing workspaces from the previous spelling's IndexedDB database or legacy localStorage keys are migrated when no current workspace exists; the original storage remains intact. The old default company name is corrected on load and backup restore, while custom company names are preserved.

Local changes do not overwrite these seed files and are not shared between browsers. Backups can be exported/imported from Import & export. Clearing browser storage removes local changes. `auth.ts` contains the public demo credentials shown on the login screen. The single account uses a 24-hour session saved in localStorage under `zahra-plast.auth.v1`, separate from workspace backups. Its expiry is fixed at login and is not extended by refresh or activity. Expired sessions are removed and the user is automatically signed out. This frontend gate is not server authentication. Legacy user records remain for backup/audit compatibility, but they cannot be selected or used to sign in. Avoid concurrent editing in multiple tabs; this prototype does not provide multi-user synchronization.

## Documented prototype decisions

- Live matrix pricing uses percentage discounts for each customer/product only. New seeds contain 40 sample product discounts. Legacy broader and fixed-price matrix records remain stored for compatibility but are ignored for live pricing.
- Effective-date endpoints are inclusive. Active percentage discounts for the same customer/product cannot overlap.
- Reset re-evaluates the matrix for the document date. Saved lines otherwise keep their pricing snapshots.
- A saved document's date or customer cannot change while its existing lines remain. Remove and re-add lines to select prices for a changed date/customer. Scheduled rate versions become current on their effective date; existing document snapshots are untouched.
- Whole-invoice fixed discounts subtract the same PKR amount from each selling unit on every line. PKR 300 off a PKR 1,200 unit leaves PKR 900; quantity and carton conversion then determine the line total.
- Unit prices round to two decimals, then extended line amounts to two decimals. Totals sum rounded lines. No tax configuration is assumed.
- Overrides accept finite percentages from 0 to 100 and PKR deductions from zero up to the selling-unit list price. New currency deductions use the amount price type; legacy fixed records remain net prices so saved documents, conversions, and credits retain their original totals.
- Quote conversion keeps quoted rates and discounts. The invoice date is the quote date initially; this makes the carried snapshot explicit until a future agreed repricing policy exists.
- Product discount changes apply immediately even when a restored workspace retains a legacy approval flag. Historical approval records remain stored without being automatically applied.
- Credit notes retain original pricing and permit partial quantities, bounded by quantities not already credited. Controlled reversal keeps the original document in the audit trail.
- The optional Save to matrix action is off and separately permission-controlled; saving invoices never invokes it.

Run `python scripts/extract-catalog.py` from the repository root to rebuild product records/images. It requires `pypdfium2` and Pillow, and leaves the original PDFs unchanged.
