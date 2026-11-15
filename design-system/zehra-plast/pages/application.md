# Zehra Plast application design

This application-specific interpretation applies to every administration route. The generated master supplies verified data-dense dashboard guidance; its generic marketing/enterprise gateway pattern is not used for this internal admin application.

- Palette: forest green primary `#176b54`, warm-neutral surface `#f5f7f6`, white cards, charcoal text `#1e2c2a`, muted text `#627167`. Semantic green/amber/red/blue states always carry visible labels.
- Typography: bundled Inter Variable, clear 25-29px page titles, 12-14px operational content, tabular prices. Secondary metadata remains readable; core actions and table cells are not tiny decorative text.
- Structure: persistent 238px sidebar, compact topbar, clear page title/actions, responsive content cards. Feature modules share the same form, dialog, button and badge primitives.
- Catalog: actual source photographs, no invented substitute images. Show missing data and inactive states explicitly.
- Interaction: keyboard focus rings, native labeled controls, native modal dialogs, accessible button names, reversible forms, meaningful validation, and save feedback.
- Responsive: sidebar becomes an accessible drawer; cards stack; wide data tables scroll within their own container without widening the page.
- Motion: restrained state transitions, no decorative movement, reduced-motion support. Charts have meaningful names, tooltips and a report/table alternative.
- Product honesty: clearly mark sample accounts/customer agreements/transactions; display local save status and persistence errors. Do not show invented growth percentages or payment balances.

Implementation tokens and shared styles live in `src/styles/global.css`. Module styles are limited to pricing, sales, and import layouts.
