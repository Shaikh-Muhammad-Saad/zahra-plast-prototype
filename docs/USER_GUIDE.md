# Zahra Plast user guide

Open the local address printed by `npm run dev` and log in with **admin@zahraplast.com** / **Zahra@123**. The same credentials are displayed below the login button. The overview presents your source catalog and sample business activity.

## Catalog and people

Use Product catalog to search by name, assigned code, or brand. Filter by category/status, or switch to grid view to see photos. Open a product to inspect its original source page and verification notes. Add product creates a local record; existing product rates are read-only in the current UI. A product with an unresolved source issue stays inactive until reviewed. Cost price is not supplied.

Customers supports adding/editing business records and groups. Supplier names are source-backed; their contact fields are blank until filled. Sample customer records are visibly marked. Adding your own customer creates a non-sample record. Open a customer and choose View invoices to see only their posted invoices; the customer and Posted filters stay selected when you open a document or reload. View product discounts opens their discount matrix.

Customer dropdowns in pricing, invoices, and quotations include a search box. Open the dropdown and type a customer name or code, then select the matching customer. Customer filters also offer All customers to clear the selection.

## Customer pricing

Select a customer in Discount matrix, then find a product using the name/code search and brand/category filters. Choose Edit discount on that product, enter a percentage from 0 to 100, review the net selling price, and save. Enter 0 to use the list price. The discount belongs only to that customer and product. New invoice lines for the same customer/product automatically use that percentage as of the invoice date.

The Discounted products tab lists only products with an active discount greater than 0% for the selected customer and date, with their list price, discount and net price. Search and brand/category filters work in this tab too. Editing a discount to 0 removes it from this list; the product remains available in Products. This replaces the previous product comparison tab.

Bulk update saves a separate percentage for each product matching the current filters, or adjusts those percentages by a number of points. Changes apply immediately. Brand/category filters only help find products; they do not create ongoing brand/category discounts. Add pricing rule, Saved rules, Copy rules, the priority hierarchy, and approvals have been removed. Older brand, category, customer-default, and fixed-price matrix records remain in stored workspace data but no longer affect live prices. Saved invoice/quotation prices are retained.

## Billing and quotations

Create an invoice or quotation, choose a customer and date, then search/add products. Prices populate automatically. Quantity can be in selling packs or cartons. A multi-piece pack is one selling unit; the piece count is not another multiplier.

An authorized user can change an individual line or all lines. Choose a percentage discount or a fixed discount amount in PKR per selling unit, and provide a reason when required. For example, a PKR 300 discount on a PKR 1,200 list price leaves PKR 900 payable per selling unit. Applying an amount to all lines subtracts that amount from each selling unit, rather than once from the document total. The amount cannot exceed any affected line's list price. The line shows its original matrix pricing and a Manual override label. Reset resolves the saved product percentage as of the document date. Older saved fixed net prices retain their original meaning and totals.

Save draft keeps the document editable. Post invoice locks its pricing. Use Print to print or save a PDF through the browser's print dialog. Save & create invoice converts a quote while retaining the quoted pricing. Changes to product discounts never silently rewrite these documents.

To return items, open a posted invoice and choose Return / credit note. Enter a reason, reduce quantities/remove unreturned lines, then post the credit. The source prices stay locked. Controlled reversal is available with a reason where the lifecycle permits it.

## Available downloads

Use Price sheet in Discount matrix to download the selected customer's product prices as an Excel workbook. In an invoice or quotation, use Print / PDF to print or save the document.

Reports & analytics, Activity log, and Import & export were removed on 20 November 2026. The current UI does not offer bulk data imports, rate-list imports/history, or workspace backup/restore. Existing workspace records and saved document prices remain intact; changes continue to save automatically in this browser.

## Sign-in and workspace data

The single workspace account can maintain products, customers, customer pricing, and documents. Company details and pricing policies use workspace defaults or previously saved values. Settings, role switching, and team controls are not part of the current UI.

The account dropdown contains Log out. Workspace routes redirect to the login screen when signed out; logging in returns to the page you requested. The session is saved in localStorage and lasts 24 hours from login, including across refreshes and browser restarts. Using or reopening the app does not extend that deadline. After 24 hours, the session is removed and you are logged out automatically; if the app was closed, you must log in when you return. Logging out signs out other open tabs without deleting business data. This is local demo authentication, not server-enforced security. Runtime data belongs to the current browser/device; seed files in `database/` remain unchanged. Avoid concurrent editing in multiple tabs. Clearing this browser's site data removes the local workspace; the current UI has no backup/restore screen.
