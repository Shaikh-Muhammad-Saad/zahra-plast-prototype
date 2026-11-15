# Zehra Plast local data

`products.json`, `suppliers.json`, `categories.json`, and `images/` preserve the supplied catalog. Product codes `ZP-001` onward are assigned local identifiers; `sourceSerial` and `sourcePage` retain the original references. Prices are PKR per selling unit, not procurement costs. All cost prices remain `null` because none were supplied.

309 actual images were cropped from the PDF. Eight entries have no product image; there are no generated replacements. The catalog contains 309 numeric rates. Thirteen products are inactive pending confirmation: the eight unpriced products, #106 and #117 packing/pricing checks, #190 and #191 missing carton quantities/suspect rate, and #207 image/name capacity disagreement. Their original values remain intact.

`customers.json`, `users.json`, and the agreements/documents constructed by `index.ts` are explicitly sample data. No real customer names, contacts or pricing agreements were supplied. The 150 sample customer records demonstrate the scope's initial scale. Supplier brand names are real source data; supplier contact information is left blank.

Runtime changes are saved only in this browser's IndexedDB database `zehra-plast-local`. No external database or backend is connected. Writes are atomic and serialized, and pending full snapshots are coalesced so large imports can support the initial 47,550-rule matrix. The header reports saving, saved or a persistent save error. Changes are in memory until the save finishes; export a backup if an error occurs. A loading boundary waits for persisted data before opening the workspace. Existing `zehra-plast.workspace.v1` localStorage data is migrated when no IndexedDB workspace exists, and the original legacy key is left intact.

Local changes do not overwrite these seed files and are not shared between browsers. Backups can be exported/imported in Settings. Clearing browser storage removes local changes. The role selector demonstrates permissions; it is not server authentication. Avoid concurrent editing in multiple tabs; this prototype does not provide multi-user synchronization.

## Documented prototype decisions

- Customer-product rules win; brand versus category priority is configurable, with brand first initially.
- Effective-date endpoints are inclusive. Same-scope active rules cannot overlap.
- Reset re-evaluates the matrix for the document date. Saved lines otherwise keep their pricing snapshots.
- A saved document's date or customer cannot change while its existing lines remain. Remove and re-add lines to select prices for a changed date/customer. Scheduled rate versions become current on their effective date; existing document snapshots are untouched.
- Whole-invoice fixed pricing means the same fixed **per-selling-unit** price on each line.
- Unit prices round to two decimals, then extended line amounts to two decimals. Totals sum rounded lines. No tax configuration is assumed.
- Overrides have no additional managerial percentage cap, but finite 0–100 percentages and positive fixed prices maintain meaningful amounts.
- Quote conversion keeps quoted rates and discounts. The invoice date is the quote date initially; this makes the carried snapshot explicit until a future agreed repricing policy exists.
- Approval workflow is off initially; enabling it queues every matrix change. The demo allows a Pricing Manager/Admin to review a request, including their own.
- Credit notes retain original pricing and permit partial quantities, bounded by quantities not already credited. Controlled reversal keeps the original document in the audit trail.
- The optional Save to matrix action is off and separately permission-controlled; saving invoices never invokes it.

Run `python scripts/extract-catalog.py` from the repository root to rebuild product records/images. It requires `pypdfium2` and Pillow, and leaves the original PDFs unchanged.
