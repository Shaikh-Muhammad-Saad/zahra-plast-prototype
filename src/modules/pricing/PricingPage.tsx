import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowRight, Check, CheckCheck, Copy, FileSpreadsheet, Layers3, Pencil, Plus, Search, ShieldCheck, SlidersHorizontal, Tag, X } from 'lucide-react';
import { useApp } from '../../state/AppProvider';
import { Badge, Button, EmptyState, Field, Modal, PageHeader, SearchInput, StatCard } from '../../components/ui';
import { effectiveRate, resolvePrice, unitNet } from '../../lib/pricing';
import { money, number, shortDate, today, uid } from '../../lib/format';
import { exportSpreadsheet } from '../../lib/spreadsheets';
import type { DiscountRule, Product } from '../../types';
import './pricing.css';

type Tab = 'matrix' | 'rules' | 'compare' | 'approvals';
const pageSize = 12;
const priceLabel = (type: string, value: number) => type === 'fixed' ? money(value, 2) : `${value}% off`;

export default function PricingPage() {
  const { state, user, can, actions, notify } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('matrix');
  const [customerId, setCustomerId] = useState(state.customers[0]?.id ?? '');
  const [asOf, setAsOf] = useState(today());
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DiscountRule | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [error, setError] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'percentage' | 'fixed' | 'adjust'>('percentage');
  const [bulkValue, setBulkValue] = useState('10');
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyMode, setCopyMode] = useState<'customer' | 'group'>('customer');
  const [copyTarget, setCopyTarget] = useState('');
  const [compareProductId, setCompareProductId] = useState(state.products[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const customer = state.customers.find(c => c.id === customerId);
  const brands = [...new Set(state.products.map(p => p.brand))].sort();
  const categories = [...new Set(state.products.map(p => p.category))].sort();
  const groups = [...new Set(state.customers.map(c => c.group).filter(Boolean))].sort();
  const products = useMemo(() => state.products.filter(p => (!brand || p.brand === brand) && (!category || p.category === category) && `${p.name} ${p.code}`.toLowerCase().includes(query.toLowerCase())), [state.products, brand, category, query]);
  const customerRules = state.rules.filter(r => r.customerId === customerId);
  const pending = state.approvals.filter(a => a.status === 'Pending');
  const covered = state.products.filter(p => resolvePrice(p, customerId, asOf, state).ruleId).length;
  const comparedProduct = state.products.find(p => p.id === compareProductId);
  const isWritable = can('pricing');
  const changeFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); };
  const changeTab = (value: Tab) => { setTab(value); setPage(1); setQuery(''); };

  function newRule(product?: Product) {
    const existing = product ? customerRules.find(r => r.scope === 'product' && r.targetId === product.id && r.active && r.effectiveFrom <= asOf && (!r.effectiveTo || r.effectiveTo >= asOf)) : undefined;
    setEditing(existing ? { ...existing } : { id: uid('rule'), customerId, scope: product ? 'product' : 'customer', targetId: product?.id ?? '', type: 'percentage', value: 0, effectiveFrom: asOf, effectiveTo: '', active: true, updatedAt: new Date().toISOString(), updatedBy: user.name });
    setError(''); setRuleOpen(true);
  }
  function saveRule() {
    if (!editing) return;
    try { actions.saveRules([editing], 'Pricing rule updated'); notify(state.settings.approvalRequired ? 'Pricing change sent for approval.' : 'Customer pricing updated.', 'success'); setRuleOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this rule.'); }
  }
  function bulkApply() {
    try {
      const value = Number(bulkValue);
      if (!bulkValue.trim() || !Number.isFinite(value)) throw new Error('Enter a numeric value.');
      const rules: DiscountRule[] = [];
      let skipped = 0;
      products.forEach(product => {
        const price = resolvePrice(product, customerId, asOf, state);
        if (bulkMode === 'adjust' && price.type === 'fixed') { skipped++; return; }
        const existing = customerRules.find(r => r.scope === 'product' && r.targetId === product.id && r.active && r.effectiveFrom <= asOf && (!r.effectiveTo || r.effectiveTo >= asOf));
        rules.push({ id: existing?.id ?? uid('rule'), customerId, scope: 'product', targetId: product.id, type: bulkMode === 'fixed' ? 'fixed' : 'percentage', value: bulkMode === 'adjust' ? Math.round((price.value + value) * 100) / 100 : value, effectiveFrom: existing?.effectiveFrom ?? asOf, effectiveTo: existing?.effectiveTo ?? '', active: true, updatedAt: new Date().toISOString(), updatedBy: user.name });
      });
      if (!rules.length) throw new Error('No eligible products match these filters. Fixed-price agreements are skipped for percentage adjustments.');
      actions.saveRules(rules, `Bulk ${bulkMode}: ${rules.length} products`);
      notify(`${rules.length} pricing rules ${state.settings.approvalRequired ? 'sent for approval' : 'updated'}.${skipped ? ` ${skipped} fixed-price rules skipped.` : ''}`, 'success');
      setBulkOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not apply pricing.'); }
  }
  function copyRules() {
    try {
      const targets = state.customers.filter(c => c.id !== customerId && (copyMode === 'group' ? c.group === copyTarget : c.id === copyTarget));
      if (!targets.length) throw new Error('Choose another customer or a group with other members.');
      if (!customerRules.length) throw new Error('This customer has no saved rules to copy.');
      const rules = targets.flatMap(target => customerRules.map(rule => {
        const existing = state.rules.find(r => r.customerId === target.id && r.scope === rule.scope && r.targetId === rule.targetId && r.effectiveFrom === rule.effectiveFrom);
        return { ...rule, id: existing?.id ?? uid('rule'), customerId: target.id, updatedAt: new Date().toISOString(), updatedBy: user.name };
      }));
      actions.saveRules(rules, `Copied ${customer?.name} pricing to ${targets.length} customer(s)`);
      notify(`${rules.length} rules ${state.settings.approvalRequired ? 'submitted for approval' : 'copied'}.`, 'success'); setCopyOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not copy pricing.'); }
  }
  async function exportCustomer() {
    setBusy(true);
    try {
      await exportSpreadsheet(`customer-pricing-${customer?.code ?? 'sheet'}`, state.products.map(p => {
        const price = resolvePrice(p, customerId, asOf, state); const rate = effectiveRate(p, asOf, state);
        return { customerCode: customer?.code, productCode: p.code, product: p.name, brand: p.brand, category: p.category, listRate: rate, type: price.type, value: price.value, netPrice: rate === null ? null : unitNet(rate, price), source: price.sourceLabel, effectiveDate: asOf, packing: p.packing, cartonQuantity: p.cartonQuantity };
      }), 'xlsx');
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'Export failed.', 'error'); }
    finally { setBusy(false); }
  }
  const pagination = (count: number) => <div className="pagination"><span className="text-small text-muted">Showing {count ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, count)} of {number(count)}</span><div className="row"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-small">Page {page}</span><Button size="sm" variant="secondary" disabled={page * pageSize >= count} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>;

  return <div className="page-stack pricing-page">
    <PageHeader eyebrow="PRICING MANAGEMENT" title="Every customer. The right price." description="Manage agreed prices with confidence, down to the individual product." actions={<><Button variant="secondary" onClick={() => navigate('/transfers')}><FileSpreadsheet size={16} /> Import pricing</Button><Button variant="primary" disabled={!isWritable || !customer} onClick={() => newRule()}><Plus size={17} /> Add pricing rule</Button></>} />
    <div className="pricing-stat-grid">
      <StatCard label="Products covered" value={`${covered} / ${state.products.length}`} detail="For the selected customer" icon={Layers3} tone="green" />
      <StatCard label="Saved agreements" value={number(customerRules.filter(r => r.active).length)} detail="Active rules across all levels" icon={Tag} />
      <StatCard label="Awaiting approval" value={number(pending.length)} detail={state.settings.approvalRequired ? 'Approval workflow is enabled' : 'Changes apply immediately'} icon={ShieldCheck} tone="amber" />
    </div>
    <div className="card pricing-context">
      <div className="pricing-customer"><span className="pricing-customer-icon"><Tag size={20} /></span><Field label="Customer"><select className="select" aria-label="Pricing customer" value={customerId} onChange={e => { setCustomerId(e.target.value); setPage(1); }}>{state.customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}</select></Field></div>
      <Field label="Effective on"><input className="input" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></Field>
      <div className="pricing-context-actions">{customer?.sample && <Badge tone="amber">Sample customer</Badge>}<Button variant="secondary" size="sm" disabled={!customer || busy} onClick={exportCustomer}><ArrowDownToLine size={15} /> {busy ? 'Exporting…' : 'Price sheet'}</Button><Button variant="ghost" size="sm" disabled={!isWritable} onClick={() => { setCopyOpen(true); setError(''); setCopyTarget(''); }}><Copy size={15} /> Copy rules</Button></div>
    </div>
    <div className="pricing-hierarchy"><span className="text-small font-medium">Pricing priority</span>{['Product agreement', `${state.settings.brandCategoryPriority === 'brand' ? 'Brand / category' : 'Category / brand'}`, 'Customer default', 'List rate'].map((label, index) => <span key={label} className="hierarchy-step"><span>{index + 1}</span>{label}{index < 3 && <ArrowRight size={13} />}</span>)}</div>
    <section className="card">
      <div className="pricing-tabs" role="tablist" aria-label="Pricing views">
        {([['matrix', 'Customer matrix'], ['rules', 'Saved rules'], ['compare', 'Product comparison'], ['approvals', 'Approvals']] as [Tab, string][]).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => changeTab(key)}>{label}{key === 'approvals' && pending.length > 0 && <span className="pricing-count">{pending.length}</span>}</button>)}
      </div>
      {tab === 'matrix' && <>
        <div className="toolbar"><SearchInput value={query} onChange={changeFilter(setQuery)} placeholder="Search products or codes…" /><select className="select filter-select" aria-label="Filter by brand" value={brand} onChange={e => changeFilter(setBrand)(e.target.value)}><option value="">All brands</option>{brands.map(b => <option key={b}>{b}</option>)}</select><select className="select filter-select" aria-label="Filter by category" value={category} onChange={e => changeFilter(setCategory)(e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select><Button variant="secondary" size="sm" disabled={!isWritable || !products.length} onClick={() => { setBulkOpen(true); setError(''); }}><SlidersHorizontal size={15} /> Bulk update</Button></div>
        <div className="table-wrap"><table className="data-table pricing-table"><thead><tr><th>Product</th><th>List rate</th><th>Agreement</th><th>Net selling price</th><th>Applied from</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {products.slice((page - 1) * pageSize, page * pageSize).map(product => {
            const price = resolvePrice(product, customerId, asOf, state); const rate = effectiveRate(product, asOf, state);
            return <tr key={product.id}><td><div className="pricing-product">{product.image ? <img src={product.image} alt="" loading="lazy" /> : <span className="pricing-product-placeholder"><Layers3 size={18} /></span>}<div><span className="font-medium">{product.name}</span><span className="text-small text-muted">{product.code} · {product.brand} · {product.packing}</span></div></div></td><td className="numeric">{rate === null ? <span className="text-muted">Unavailable</span> : money(rate)}</td><td><Badge tone={price.type === 'fixed' ? 'blue' : price.ruleId ? 'green' : 'gray'}>{priceLabel(price.type, price.value)}</Badge></td><td className="numeric font-medium">{rate === null ? '—' : money(unitNet(rate, price), 2)}</td><td><span className="text-small">{price.sourceLabel ?? 'List rate'}</span>{product.status !== 'Active' && <div className="text-small text-muted">{product.status}</div>}</td><td><Button variant="ghost" size="sm" disabled={!isWritable} aria-label={`Edit pricing for ${product.name}`} onClick={() => newRule(product)}><Pencil size={15} /></Button></td></tr>;
          })}
        </tbody></table></div>
        {!products.length && <EmptyState icon={Search} title="No matching products" description="Try another product name, brand, or category." action={<Button variant="secondary" onClick={() => { setQuery(''); setBrand(''); setCategory(''); }}>Clear filters</Button>} />}
        {pagination(products.length)}
      </>}
      {tab === 'rules' && <>
        <div className="card-header"><div><h2>Saved pricing agreements</h2><p className="text-muted text-small">Date-bound rules for {customer?.name}. Inherited prices appear in the customer matrix.</p></div><Badge tone="gray">{customerRules.length} rules</Badge></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Applies to</th><th>Agreement</th><th>Effective dates</th><th>Status</th><th>Actions</th></tr></thead><tbody>{customerRules.slice((page - 1) * pageSize, page * pageSize).map(rule => <tr key={rule.id}><td><div className="font-medium">{rule.scope === 'product' ? state.products.find(p => p.id === rule.targetId)?.name : rule.scope === 'customer' ? 'All products' : rule.targetId}</div><span className="text-small text-muted">Customer + {rule.scope === 'customer' ? 'default' : rule.scope}</span></td><td><Badge tone={rule.type === 'fixed' ? 'blue' : 'green'}>{priceLabel(rule.type, rule.value)}</Badge></td><td className="text-small">{shortDate(rule.effectiveFrom)}<br /><span className="text-muted">{rule.effectiveTo ? `Until ${shortDate(rule.effectiveTo)}` : 'No end date'}</span></td><td><Badge tone={rule.active ? 'green' : 'gray'}>{rule.active ? 'Active' : 'Inactive'}</Badge></td><td><div className="row"><Button variant="ghost" size="sm" disabled={!isWritable} onClick={() => { setEditing({ ...rule }); setRuleOpen(true); setError(''); }}><Pencil size={14} /> Edit</Button><Button variant="ghost" size="sm" disabled={!isWritable} onClick={() => { try { actions.saveRules([{ ...rule, active: !rule.active }], `${rule.active ? 'Deactivate' : 'Activate'} pricing rule`); notify(state.settings.approvalRequired ? 'Status change sent for approval.' : 'Rule status updated.', 'success'); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Update failed.', 'error'); } }}>{rule.active ? 'Deactivate' : 'Activate'}</Button></div></td></tr>)}</tbody></table></div>
        {!customerRules.length && <EmptyState icon={Tag} title="No saved rules yet" description="Add a customer default or agree a price for specific products." action={<Button variant="primary" disabled={!isWritable} onClick={() => newRule()}>Add first rule</Button>} />}{pagination(customerRules.length)}
      </>}
      {tab === 'compare' && <>
        <div className="toolbar"><Field label="Compare a product"><select className="select pricing-compare-select" value={compareProductId} onChange={e => { setCompareProductId(e.target.value); setPage(1); }}>{state.products.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field><div className="pricing-compare-info"><span className="text-muted text-small">List price per selling unit</span><strong>{comparedProduct && effectiveRate(comparedProduct, asOf, state) !== null ? money(effectiveRate(comparedProduct, asOf, state)!) : 'Unavailable'}</strong></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Customer</th><th>Group</th><th>Agreement</th><th>Net selling price</th><th>Source</th><th></th></tr></thead><tbody>{state.customers.slice((page - 1) * pageSize, page * pageSize).map(c => {
          if (!comparedProduct) return null;
          const price = resolvePrice(comparedProduct, c.id, asOf, state); const rate = effectiveRate(comparedProduct, asOf, state);
          return <tr key={c.id}><td><div className="font-medium">{c.name}</div><span className="text-small text-muted">{c.code}{c.sample ? ' · Sample' : ''}</span></td><td>{c.group || '—'}</td><td><Badge tone={price.ruleId ? 'green' : 'gray'}>{priceLabel(price.type, price.value)}</Badge></td><td className="numeric font-medium">{rate === null ? '—' : money(unitNet(rate, price), 2)}</td><td className="text-small">{price.sourceLabel ?? 'List rate'}</td><td><Button size="sm" variant="ghost" onClick={() => { setCustomerId(c.id); changeTab('matrix'); }}>View customer <ArrowRight size={14} /></Button></td></tr>;
        })}</tbody></table></div>{pagination(state.customers.length)}
      </>}
      {tab === 'approvals' && <div className="card-body">
        <div className="pricing-approval-intro"><ShieldCheck size={21} /><div><h2>A second look before prices change</h2><p className="text-muted text-small">{state.settings.approvalRequired ? 'Submitted changes remain separate from live agreements until approved.' : 'This workspace applies pricing agreements directly without requiring approval.'}</p></div></div>
        {!state.approvals.length ? <EmptyState icon={CheckCheck} title="All caught up" description="Pricing change requests will appear here when approval is enabled." /> : <div className="stack">{[...state.approvals].reverse().map(approval => <div className="pricing-approval" key={approval.id}><div><div className="row"><strong>{approval.reason || 'Pricing change'}</strong><Badge tone={approval.status === 'Pending' ? 'amber' : approval.status === 'Approved' ? 'green' : 'gray'}>{approval.status}</Badge></div><p className="text-small text-muted">{approval.rules.length} rules · {approval.requestedBy} · {shortDate(approval.requestedAt)}</p><details><summary className="text-small">Review proposed changes</summary><div className="pricing-approval-rules">{approval.rules.map(rule => <div key={rule.id}>{state.customers.find(c => c.id === rule.customerId)?.name} · {rule.scope} · {rule.scope === 'product' ? state.products.find(p => p.id === rule.targetId)?.name : rule.targetId || 'All products'} · <strong>{priceLabel(rule.type, rule.value)}</strong> · {rule.active ? 'Active' : 'Inactive'}</div>)}</div></details></div>{approval.status === 'Pending' && can('approve') && <div className="row"><Button size="sm" variant="secondary" onClick={() => { try { actions.reviewApproval(approval.id, false); notify('Change request rejected.', 'info'); } catch (cause) { notify(String(cause), 'error'); } }}><X size={14} /> Reject</Button><Button size="sm" variant="primary" onClick={() => { try { actions.reviewApproval(approval.id, true); notify('Pricing changes approved.', 'success'); } catch (cause) { notify(cause instanceof Error ? cause.message : 'Approval failed.', 'error'); } }}><Check size={14} /> Approve</Button></div>}</div>)}</div>}
      </div>}
    </section>
    <div className="pricing-footer-note"><ShieldCheck size={16} /><span>Saved agreements stay protected. Invoice overrides only affect the individual invoice.</span></div>

    <Modal title={editing && state.rules.some(r => r.id === editing.id) ? 'Edit pricing agreement' : 'New pricing agreement'} description="Set the agreed selling price for this customer. Every change is recorded." open={ruleOpen} onClose={() => setRuleOpen(false)} footer={<><Button variant="secondary" onClick={() => setRuleOpen(false)}>Cancel</Button><Button variant="primary" onClick={saveRule}>{state.settings.approvalRequired ? 'Submit for approval' : 'Save agreement'}</Button></>}>
      {editing && <div className="stack"><div className="pricing-form-customer"><strong>{customer?.name}</strong><span className="text-muted text-small">{customer?.code} · {customer?.group}</span></div><div className="form-grid"><Field label="Rule level"><select className="select" value={editing.scope} onChange={e => setEditing({ ...editing, scope: e.target.value as DiscountRule['scope'], targetId: '' })}><option value="customer">Customer default</option><option value="product">Specific product</option><option value="brand">Brand</option><option value="category">Category</option></select></Field>{editing.scope !== 'customer' && <Field label={editing.scope === 'product' ? 'Product' : editing.scope === 'brand' ? 'Brand' : 'Category'}><select className="select" value={editing.targetId} onChange={e => setEditing({ ...editing, targetId: e.target.value })}><option value="">Select {editing.scope}</option>{editing.scope === 'product' ? state.products.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>) : (editing.scope === 'brand' ? brands : categories).map(value => <option key={value}>{value}</option>)}</select></Field>}<Field label="Agreement type"><select className="select" value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value as DiscountRule['type'] })}><option value="percentage">Percentage discount</option><option value="fixed">Fixed net price</option></select></Field><Field label={editing.type === 'percentage' ? 'Discount (%)' : 'Net price (PKR per selling unit)'}><input className="input" type="number" min={editing.type === 'fixed' ? '0.01' : '0'} max={editing.type === 'percentage' ? '100' : undefined} step="0.01" value={Number.isNaN(editing.value) ? '' : editing.value} onChange={e => setEditing({ ...editing, value: e.target.value === '' ? NaN : Number(e.target.value) })} /></Field><Field label="Effective from"><input className="input" type="date" value={editing.effectiveFrom} onChange={e => setEditing({ ...editing, effectiveFrom: e.target.value })} /></Field><Field label="Effective to" hint="Leave blank for an open-ended agreement."><input className="input" type="date" value={editing.effectiveTo} onChange={e => setEditing({ ...editing, effectiveTo: e.target.value })} /></Field></div><label className="pricing-checkbox"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> Agreement is active</label>{error && <div role="alert" className="error-message">{error}</div>}</div>}
    </Modal>
    <Modal title="Update customer prices in bulk" description={`${products.length} filtered products for ${customer?.name ?? 'the selected customer'}.`} open={bulkOpen} onClose={() => setBulkOpen(false)} footer={<><Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button><Button variant="primary" onClick={bulkApply}>Update {products.length} products</Button></>}>
      <div className="stack"><div className="pricing-bulk-summary"><Layers3 size={20} /><div><strong>{brand || 'All brands'} · {category || 'All categories'}</strong><p className="text-small text-muted">{query ? `Search: ${query}` : 'Includes every product matching your current filters.'}</p></div></div><Field label="Update method"><select className="select" value={bulkMode} onChange={e => setBulkMode(e.target.value as typeof bulkMode)}><option value="percentage">Set percentage discount</option><option value="fixed">Set fixed net price per selling unit</option><option value="adjust">Adjust discount by percentage points</option></select></Field><Field label={bulkMode === 'fixed' ? 'Net selling price (PKR)' : bulkMode === 'adjust' ? 'Percentage points to add or subtract' : 'Discount (%)'} hint={bulkMode === 'adjust' ? '+2 changes a 10% discount to 12%. Fixed-price agreements are skipped.' : 'Creates product-specific rules. Existing active product rules are updated.'}><input className="input" type="number" step="0.01" value={bulkValue} onChange={e => setBulkValue(e.target.value)} /></Field><p className="text-small text-muted">Changes use {shortDate(asOf)} for new agreements. Existing agreement dates are preserved. The entire batch is rejected if any rule is invalid.</p>{error && <div role="alert" className="error-message">{error}</div>}</div>
    </Modal>
    <Modal title="Copy customer agreements" description={`Use ${customer?.name ?? 'this customer'} as the pricing template.`} open={copyOpen} onClose={() => setCopyOpen(false)} footer={<><Button variant="secondary" onClick={() => setCopyOpen(false)}>Cancel</Button><Button variant="primary" onClick={copyRules}>Copy agreements</Button></>}>
      <div className="stack"><Field label="Copy to"><select className="select" value={copyMode} onChange={e => { setCopyMode(e.target.value as typeof copyMode); setCopyTarget(''); }}><option value="customer">Another customer</option><option value="group">Every member of a customer group</option></select></Field><Field label={copyMode === 'customer' ? 'Destination customer' : 'Destination group'}><select className="select" value={copyTarget} onChange={e => setCopyTarget(e.target.value)}><option value="">Choose a destination</option>{copyMode === 'customer' ? state.customers.filter(c => c.id !== customerId).map(c => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>) : groups.map(g => <option key={g}>{g}</option>)}</select></Field><p className="text-small text-muted">Copies all {customerRules.length} saved rules, their dates, and active status. A matching rule with the same start date is replaced. Overlapping agreements are rejected. Group members receive independent copies.</p>{error && <div role="alert" className="error-message">{error}</div>}</div>
    </Modal>
  </div>;
}
