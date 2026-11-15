# Zahra Plast user guide

Open the local address printed by `npm run dev` and log in with **admin@zahraplast.com** / **Zahra@123**. The same credentials are displayed below the login button. The overview presents your source catalog and sample business activity.

## Catalog and people

Use Product catalog to search by name, assigned code, or brand. Filter by category/status, or switch to grid view to see photos. Open a product to inspect its original source page and verification notes. Add product creates a local record; existing rates are changed through dated rate-list imports. A product with an unresolved source issue stays inactive until reviewed. Cost price is not supplied.

Customers supports adding/editing business records and groups. Supplier names are source-backed; their contact fields are blank until filled. Sample customer records are visibly marked. Adding your own customer creates a non-sample record.

## Customer pricing

Select a customer in Discount matrix. The matrix resolves each product's current agreement and shows its source. Use the edit action to create a product agreement, or Add pricing rule for brand/category/default rules. Choose a percentage or fixed net price and an effective date. Optional expiry dates are inclusive.

Bulk update can apply one agreement or add percentage points across selected products. Copy rules starts with one customer's agreements and copies to another customer or a selected group's members. Preview the intended scope before applying. When approvals are enabled, changes stay pending until reviewed in the Approvals tab.

## Billing and quotations

Create an invoice or quotation, choose a customer and date, then search/add products. Prices populate automatically. Quantity can be in selling packs or cartons. A multi-piece pack is one selling unit; the piece count is not another multiplier.

An authorized user can change an individual line or all lines. Provide a percentage or a fixed per-selling-unit price and a reason when required. The line shows its original matrix pricing and a Manual override label. Reset resolves the saved agreement as of the document date.

Save draft keeps the document editable. Post invoice locks its pricing. Use Print to print or save a PDF through the browser's print dialog. Save & create invoice converts a quote while retaining the quoted pricing. Changes to the master rules never silently rewrite these documents.

To return items, open a posted invoice and choose Return / credit note. Enter a reason, reduce quantities/remove unreturned lines, then post the credit. The source prices stay locked. Controlled reversal is available with a reason where the lifecycle permits it.

## Imports, exports, and backup

In Import & export, choose the record type and download its CSV or Excel template. Upload the completed file. The preview shows invalid rows and their reasons. Download the error list if needed; only validated rows are applied. Product/customer codes must match. Prices missing from the source must not be entered as zero.

For a price update, select New rate list and supply a new effective date after the latest version. Existing customer rules and invoice snapshots stay unchanged.

In Export & backup, choose PDF for a paginated document or Excel for an editable workbook. PDF exports include all records, repeated table headings and page numbers; the complete matrix is grouped by customer. Large PDFs are prepared in the background with progress shown on the page. Other report and pricing screens retain their own export options. A JSON workspace backup includes all records, settings, and audit history. Changes save automatically; any storage failure appears as an alert. Keep a backup before clearing browser data or moving devices. Use Restore backup to replace a local workspace after reviewing the confirmation.

## Sign-in and workspace data

The single workspace account can maintain products, customers, customer pricing, and documents. Company details and pricing policies use workspace defaults or values retained in a restored backup. Settings, role switching, and team controls are not part of the current UI.

The account dropdown contains Log out. Workspace routes redirect to the login screen when signed out; logging in returns to the page you requested. Sessions last eight hours and survive refresh. Logging out signs out other open tabs without deleting business data. This is local demo authentication, not server-enforced security. Runtime data belongs to the current browser/device; seed files in `database/` remain unchanged. Avoid concurrent editing in multiple tabs, and keep exported backups of work you want to retain.
