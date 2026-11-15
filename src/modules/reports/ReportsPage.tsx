import { useMemo, useState } from 'react';
import { ChartNoAxesCombined, Download, FileSpreadsheet, Fingerprint, Layers, Package, ShieldCheck, Users } from 'lucide-react';
import { useApp } from '../../state/AppProvider';
import { effectiveRate, resolvePrice, unitNet, sellingQuantity, documentTotal, overrideImpact, roundMoney } from '../../lib/pricing';
import { money, today } from '../../lib/format';
import { exportSpreadsheet, type SheetRow } from '../../lib/spreadsheets';
import { Badge, Button, EmptyState, Field, PageHeader, Pagination, SearchInput, StatCard } from '../../components/ui';
import type { AppState } from '../../types';

const reports = [
  { id: 'customer', label: 'Customer discount sheet', description: 'Every product and its agreed price for one customer.', icon: Users },
  { id: 'product', label: 'Product comparison', description: 'Compare one product’s pricing across customers.', icon: Package },
  { id: 'brand', label: 'Brand discount summary', description: 'Compare resolved customer discounts, selling-unit prices, and agreement coverage by brand.', icon: Layers },
  { id: 'missing', label: 'Missing discounts', description: 'Products with no applicable pricing rule for a customer.', icon: FileSpreadsheet },
  { id: 'overrides', label: 'Invoice overrides', description: 'Review exceptions to agreed customer pricing.', icon: ShieldCheck },
  { id: 'frequency', label: 'Override frequency', description: 'Find recurring exceptions by user, customer, or product.', icon: Fingerprint },
];
export function buildBrandSummary(state: AppState, asOf: string, customerId = ''): SheetRow[] {
  const customers = state.customers.filter(customer => !customerId || customer.id === customerId);
  const customerIds = new Set(customers.map(customer => customer.id));
  const customerScope = customerId ? customers[0]?.name ?? 'Unknown customer' : `All ${customers.length} customers`;
  return state.suppliers.map(supplier => {
    const products = state.products.filter(product => product.brand === supplier.name);
    const productIds = new Set(products.map(product => product.id));
    const direct = state.rules.filter(rule => customerIds.has(rule.customerId) && rule.active && rule.effectiveFrom <= asOf && (!rule.effectiveTo || rule.effectiveTo >= asOf) && (rule.scope === 'brand' && rule.targetId === supplier.name || rule.scope === 'product' && productIds.has(rule.targetId)));
    let covered = 0; let pricedProducts = 0; let pairs = 0; let percentageSum = 0; let netSum = 0; let discountSum = 0; let minimum = Infinity; let maximum = -Infinity;
    for (const product of products) {
      const rate = effectiveRate(product, asOf, state);
      const priced = rate !== null && Number.isFinite(rate) && rate > 0;
      if (priced) pricedProducts++;
      for (const customer of customers) {
        const price = resolvePrice(product, customer.id, asOf, state);
        if (price.ruleId) covered++;
        if (!priced) continue;
        const net = unitNet(rate!, price);
        const amount = roundMoney(rate! - net);
        const percentage = amount / rate! * 100;
        pairs++; percentageSum += percentage; netSum += net; discountSum += amount;
        minimum = Math.min(minimum, percentage); maximum = Math.max(maximum, percentage);
      }
    }
    return {
      Brand: supplier.name, 'Customer scope': customerScope, 'Pricing as of': asOf,
      Products: products.length, Active: products.filter(product => product.status === 'Active').length,
      'Priced products': pricedProducts, 'Brand / product rules': direct.length,
      'Covered combinations': covered, 'Possible combinations': products.length * customers.length,
      'Priced customer-product pairs': pairs,
      'Mean effective discount (%)': pairs ? roundMoney(percentageSum / pairs) : null,
      'Minimum discount (%)': pairs ? roundMoney(minimum) : null,
      'Maximum discount (%)': pairs ? roundMoney(maximum) : null,
      'Mean net / selling unit (PKR)': pairs ? roundMoney(netSum / pairs) : null,
      'Mean discount / selling unit (PKR)': pairs ? roundMoney(discountSum / pairs) : null,
    };
  });
}
export default function ReportsPage() {
  const { state, notify } = useApp(); const [report, setReport] = useState('customer'); const [customerId, setCustomerId] = useState(state.customers[0]?.id || ''); const [productId, setProductId] = useState(state.products[0]?.id || ''); const [asOf, setAsOf] = useState(today()); const [from, setFrom] = useState('2026-10-20'); const [to, setTo] = useState(today()); const [search, setSearch] = useState(''); const [groupBy, setGroupBy] = useState('customer'); const [page, setPage] = useState(1);
  const [brandCustomerId, setBrandCustomerId] = useState('');
  const overrideRows = state.documents.filter(d => d.kind === 'Invoice' && d.status === 'Posted' && d.date >= from && d.date <= to).flatMap(d => d.lines.filter(l => l.override).map(l => ({ document: d, line: l })));
  const selected = reports.find(r => r.id === report)!;
  const rows = useMemo<SheetRow[]>(() => {
    if (report === 'customer' || report === 'missing') return state.products.flatMap(p => { const price = resolvePrice(p, customerId, asOf, state); if (report === 'missing' && price.ruleId) return []; const rate = effectiveRate(p, asOf, state); return [{ 'Product code': p.code, Product: p.name, Brand: p.brand, 'List price (PKR)': rate, 'Pricing rule': price.sourceLabel || 'List rate', Agreement: price.type === 'percentage' ? `${price.value}%` : money(price.value, 2), 'Net price (PKR)': rate === null ? null : unitNet(rate, price), Status: p.status }]; });
    if (report === 'product') { const p = state.products.find(p => p.id === productId); if (!p) return []; const rate = effectiveRate(p, asOf, state); return state.customers.map(c => { const price = resolvePrice(p, c.id, asOf, state); return { Code: c.code, Customer: c.name, Group: c.group, Agreement: price.type === 'percentage' ? `${price.value}%` : money(price.value, 2), 'Net price (PKR)': rate === null ? null : unitNet(rate, price), 'Pricing rule': price.sourceLabel || 'List rate' }; }); }
    if (report === 'brand') return buildBrandSummary(state, asOf, brandCustomerId);
    if (report === 'overrides') return overrideRows.map(({ document: d, line: l }) => ({ Invoice: d.number, Date: d.date, Customer: d.customerName, Product: l.productName, 'Matrix agreement': l.originalPricing.type === 'percentage' ? `${l.originalPricing.value}%` : money(l.originalPricing.value, 2), 'Applied agreement': l.appliedPricing.type === 'percentage' ? `${l.appliedPricing.value}%` : money(l.appliedPricing.value, 2), 'Selling packs': sellingQuantity(l), 'Impact (PKR)': overrideImpact(l), User: l.overrideBy || d.createdBy, Reason: l.reason || 'Not provided' }));
    const grouped = new Map<string, { count: number; impact: number; invoices: Set<string> }>();
    for (const { document: d, line: l } of overrideRows) { const key = groupBy === 'user' ? (l.overrideBy || d.createdBy) : groupBy === 'product' ? l.productName : d.customerName; const entry = grouped.get(key) || { count: 0, impact: 0, invoices: new Set<string>() }; entry.count++; entry.impact += overrideImpact(l); entry.invoices.add(d.id); grouped.set(key, entry); }
    return [...grouped].sort((a, b) => b[1].count - a[1].count).map(([key, value]) => ({ [groupBy === 'user' ? 'User' : groupBy === 'product' ? 'Product' : 'Customer']: key, 'Override lines': value.count, Invoices: value.invoices.size, 'Impact (PKR)': Math.round(value.impact * 100) / 100 }));
  }, [state, report, customerId, productId, asOf, from, to, groupBy, brandCustomerId]);
  const filtered = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase()))); const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15))); const headers = Object.keys(rows[0] || {}); const financial = report === 'overrides' || report === 'frequency';
  async function exportReport(format: 'csv' | 'xlsx') { try { await exportSpreadsheet(`zahra-plast-${report}-${asOf}`, filtered, format); notify('Report exported.', 'success'); } catch (e) { notify((e as Error).message, 'error'); } }
  return <div className="page-stack"><PageHeader eyebrow="INSIGHTS THAT MATTER" title="Reports & analytics" description="Understand your pricing, spot exceptions, and make confident decisions." actions={<><Button disabled={!filtered.length} onClick={() => exportReport('csv')}><Download size={16} />CSV</Button><Button variant="primary" disabled={!filtered.length} onClick={() => exportReport('xlsx')}><FileSpreadsheet size={17} />Export Excel</Button></>} /><div className="stats-grid"><StatCard label="Posted invoice value" value={money(state.documents.filter(d => d.kind === 'Invoice' && d.status === 'Posted' && d.date >= from && d.date <= to).reduce((s, d) => s + documentTotal(d), 0))} detail={`${from} to ${to}`} icon={ChartNoAxesCombined} /><StatCard label="Override lines" value={overrideRows.length} detail="On posted invoices in the date range" icon={Fingerprint} tone="amber" /><StatCard label="Override impact" value={money(overrideRows.reduce((s, r) => s + overrideImpact(r.line), 0), 2)} detail="Positive = additional discount given" icon={ShieldCheck} /><StatCard label="Saved pricing rules" value={state.rules.length} detail="Including inactive historical rules" icon={Layers} tone="blue" /></div>
    <div className="report-chooser">{reports.map(r => <button className={`report-choice ${r.id === report ? 'selected' : ''}`} key={r.id} onClick={() => { setReport(r.id); setSearch(''); setPage(1); }}><r.icon size={20} /><span>{r.label}</span></button>)}</div>
    <section className="card"><div className="card-header"><div><h2>{selected.label}</h2><p className="text-small text-muted">{selected.description}</p></div><Badge tone="green">{rows.length} records</Badge></div><div className="report-filters">{(report === 'customer' || report === 'missing') && <Field label="Customer"><select className="select" value={customerId} onChange={e => { setCustomerId(e.target.value); setPage(1); }}>{state.customers.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>}{report === 'brand' && <Field label="Customer scope"><select className="select" value={brandCustomerId} onChange={e => { setBrandCustomerId(e.target.value); setPage(1); }}><option value="">All customers</option>{state.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.code} - {customer.name}</option>)}</select></Field>}{report === 'product' && <Field label="Product"><select className="select" value={productId} onChange={e => { setProductId(e.target.value); setPage(1); }}>{state.products.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field>}{financial ? <><Field label="From"><input className="input" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></Field><Field label="To"><input className="input" type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></Field></> : <Field label="Pricing as of"><input className="input" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></Field>}{report === 'frequency' && <Field label="Group by"><select className="select" value={groupBy} onChange={e => setGroupBy(e.target.value)}><option value="customer">Customer</option><option value="user">User</option><option value="product">Product</option></select></Field>}<SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search report…" /></div>{report === 'brand' && <div className="card-body"><p className="text-small text-muted">Discounts resolve the full pricing hierarchy on the selected date. Averages give each numeric-priced customer/product pair equal weight and include inactive catalog products. Missing rates are excluded. PKR values are per listed selling pack or set, whose contents vary; these are catalog averages, not sales totals or volume-weighted savings. A negative discount means a fixed net price above the list rate.</p></div>}{!filtered.length ? <EmptyState icon={ShieldCheck} title={report === 'missing' ? 'Every product has an applicable rule' : 'No records in this report'} description={report === 'missing' ? 'This includes inherited customer, brand, and category agreements.' : 'Change the filters or complete a transaction to see it here.'} /> : <div className="table-wrap"><table className="data-table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.slice((currentPage - 1) * 15, currentPage * 15).map((r, i) => <tr key={i}>{headers.map(h => <td key={h} className={typeof r[h] === 'number' ? 'tabular' : ''}>{r[h] === null ? 'Not available' : h.includes('(PKR)') ? money(Number(r[h]), 2) : String(r[h] ?? '—')}</td>)}</tr>)}</tbody></table></div>}<Pagination page={currentPage} total={filtered.length} pageSize={15} onChange={setPage} /></section><p className="source-note"><ShieldCheck size={15} />Financial reports include posted invoices only. Credits are separate documents. Sample transactions are for exploring the workspace.</p>
  </div>;
}
