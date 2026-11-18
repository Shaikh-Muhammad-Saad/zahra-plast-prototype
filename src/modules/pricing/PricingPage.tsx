import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, FileSpreadsheet, Layers3, Pencil, Search, ShieldCheck, SlidersHorizontal, Tag } from 'lucide-react';
import { useApp } from '../../state/AppProvider';
import { Badge, Button, EmptyState, Field, Modal, PageHeader, SearchInput, StatCard } from '../../components/ui';
import { effectiveRate, resolvePrice, unitNet } from '../../lib/pricing';
import { money, number, shortDate, today, uid } from '../../lib/format';
import { exportSpreadsheet } from '../../lib/spreadsheets';
import { ProductDiscountForm } from './ProductDiscountForm';
import type { DiscountRule, Product } from '../../types';
import './pricing.css';

type Tab = 'matrix' | 'discounted';
const pageSize = 12;

export default function PricingPage() {
  const { state, user, can, actions, notify } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('matrix');
  const [customerId, setCustomerId] = useState(() => state.customers.find(c => c.id === searchParams.get('customer'))?.id ?? state.customers[0]?.id ?? '');
  const [asOf, setAsOf] = useState(today());
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'percentage' | 'adjust'>('percentage');
  const [bulkValue, setBulkValue] = useState('10');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const customer = state.customers.find(c => c.id === customerId);
  const brands = [...new Set(state.products.map(p => p.brand))].sort();
  const categories = [...new Set(state.products.map(p => p.category))].sort();
  const discountedProducts = useMemo(() => state.products.filter(product => resolvePrice(product, customerId, asOf, state).value > 0), [state, customerId, asOf]);
  const products = useMemo(() => (tab === 'discounted' ? discountedProducts : state.products).filter(p => (!brand || p.brand === brand) && (!category || p.category === category) && `${p.name} ${p.code}`.toLowerCase().includes(query.trim().toLowerCase())), [state.products, discountedProducts, tab, brand, category, query]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(products.length / pageSize)));
  const isWritable = can('pricing');
  const changeFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); };
  const changeTab = (value: Tab) => { setTab(value); setPage(1); };
  const clearFilters = () => { setQuery(''); setBrand(''); setCategory(''); setPage(1); };

  function saveDiscount(discount: number) {
    if (!editingProduct || !customer) return;
    actions.saveProductDiscount(customer.id, editingProduct.id, { type: 'percentage', value: discount }, asOf);
    notify('Product discount saved.', 'success');
    setEditingProduct(null);
  }

  function bulkApply() {
    try {
      const value = Number(bulkValue);
      if (!bulkValue.trim() || !Number.isFinite(value)) throw new Error('Enter a numeric discount.');
      const discounts: DiscountRule[] = products.map(product => {
        const price = resolvePrice(product, customerId, asOf, state);
        const existing = state.rules.find(item => item.id === price.ruleId);
        return { id: existing?.id ?? uid('discount'), customerId, scope: 'product', targetId: product.id,
          type: 'percentage', value: bulkMode === 'adjust' ? Math.round((price.value + value) * 100) / 100 : value,
          effectiveFrom: existing?.effectiveFrom ?? asOf, effectiveTo: existing?.effectiveTo ?? '', active: true,
          updatedAt: new Date().toISOString(), updatedBy: user.name };
      });
      if (!discounts.length) throw new Error('No products match these filters.');
      if (discounts.some(discount => discount.value < 0 || discount.value > 100)) throw new Error('Every product discount must be between 0 and 100%. No products were changed.');
      actions.saveRules(discounts, `Updated discounts for ${discounts.length} products`);
      notify(`${discounts.length} product discounts updated.`, 'success');
      setBulkOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update discounts.'); }
  }

  async function exportCustomer() {
    setBusy(true);
    try {
      await exportSpreadsheet(`customer-pricing-${customer?.code ?? 'sheet'}`, state.products.map(p => {
        const price = resolvePrice(p, customerId, asOf, state);
        const rate = effectiveRate(p, asOf, state);
        return { customerCode: customer?.code, productCode: p.code, product: p.name, brand: p.brand, category: p.category,
          listRate: rate, discountPercent: price.value, netPrice: rate === null ? null : unitNet(rate, price), effectiveDate: asOf,
          packing: p.packing, cartonQuantity: p.cartonQuantity };
      }), 'xlsx');
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'Export failed.', 'error'); }
    finally { setBusy(false); }
  }

  const pagination = (count: number) => <div className="pagination">
    <span className="text-small text-muted">Showing {count ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, count)} of {number(count)}</span>
    <div className="row"><Button size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-small">Page {currentPage}</span><Button size="sm" disabled={currentPage * pageSize >= count} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
  </div>;

  return <div className="page-stack pricing-page">
    <PageHeader eyebrow="PRICING MANAGEMENT" title="Every customer. The right price." description="Choose a customer and set a discount percentage for each product."
      actions={<Button onClick={() => navigate('/transfers')}><FileSpreadsheet size={16} />Import discounts</Button>} />
    <div className="pricing-stat-grid">
      <StatCard label="Products" value={number(state.products.length)} detail="Available in your catalog" icon={Layers3} tone="green" />
      <StatCard label="Discounted products" value={number(discountedProducts.length)} detail="For the selected customer and date" icon={Tag} />
      <StatCard label="Without a discount" value={number(state.products.length - discountedProducts.length)} detail="Use the product list price" icon={ShieldCheck} tone="blue" />
    </div>
    <div className="card pricing-context">
      <div className="pricing-customer"><span className="pricing-customer-icon"><Tag size={20} /></span><Field label="Customer"><select className="select" aria-label="Pricing customer" value={customerId} onChange={e => { setCustomerId(e.target.value); setPage(1); }}>{state.customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}</select></Field></div>
      <Field label="Effective on"><input className="input" type="date" value={asOf} onChange={e => { setAsOf(e.target.value); setPage(1); }} /></Field>
      <div className="pricing-context-actions">{customer?.sample && <Badge tone="amber">Sample customer</Badge>}<Button size="sm" disabled={!customer || busy} onClick={exportCustomer}><ArrowDownToLine size={15} />{busy ? 'Exporting…' : 'Price sheet'}</Button></div>
    </div>
    <section className="card">
      <div className="pricing-tabs" role="tablist" aria-label="Pricing views">
        {([['matrix', 'Products'], ['discounted', 'Discounted products']] as [Tab, string][]).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => changeTab(key)}>{label}</button>)}
      </div>
      <>
        <div className="toolbar"><SearchInput value={query} onChange={changeFilter(setQuery)} placeholder="Search products or codes…" />
          <select className="select filter-select" aria-label="Filter by brand" value={brand} onChange={e => changeFilter(setBrand)(e.target.value)}><option value="">All brands</option>{brands.map(b => <option key={b}>{b}</option>)}</select>
          <select className="select filter-select" aria-label="Filter by category" value={category} onChange={e => changeFilter(setCategory)(e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
          <Button size="sm" disabled={!isWritable || !customer || !products.length || !asOf} onClick={() => { setBulkOpen(true); setError(''); }}><SlidersHorizontal size={15} />Bulk update</Button>
        </div>
        <div className="table-wrap"><table className="data-table pricing-table"><thead><tr><th>Product</th><th>List rate</th><th>Discount (%)</th><th>Net selling price</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {products.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(product => {
            const price = resolvePrice(product, customerId, asOf, state);
            const rate = effectiveRate(product, asOf, state);
            return <tr key={product.id}>
              <td><div className="pricing-product">{product.image ? <img src={product.image} alt="" loading="lazy" /> : <span className="pricing-product-placeholder"><Layers3 size={18} /></span>}<div><span className="font-medium">{product.name}</span><span className="text-small text-muted">{product.code} · {product.brand} · {product.packing}</span>{product.status !== 'Active' && <span className="text-small text-muted">{product.status}</span>}</div></div></td>
              <td className="numeric">{rate === null ? <span className="text-muted">Unavailable</span> : money(rate)}</td>
              <td><Badge tone={price.value > 0 ? 'green' : 'gray'}>{price.value}% off</Badge></td>
              <td className="numeric font-medium">{rate === null ? '—' : money(unitNet(rate, price), 2)}</td>
              <td><Button variant="ghost" size="sm" disabled={!isWritable || !customer || !asOf} aria-label={`Edit discount for ${product.name}`} onClick={() => setEditingProduct(product)}><Pencil size={15} /><span>Edit discount</span></Button></td>
            </tr>;
          })}
        </tbody></table></div>
        {!products.length && (tab === 'discounted' && !discountedProducts.length
          ? <EmptyState icon={Tag} title="No discounted products yet" description={`${customer?.name ?? 'This customer'} has no product discounts greater than 0% on the selected date.`} action={<Button onClick={() => { clearFilters(); changeTab('matrix'); }}>View all products</Button>} />
          : <EmptyState icon={Search} title="No matching products" description="Try another product name, brand, or category." action={<Button onClick={clearFilters}>Clear filters</Button>} />)}
        {pagination(products.length)}
      </>
    </section>
    <div className="pricing-footer-note"><ShieldCheck size={16} /><span>Each discount is for one customer and product. Saved invoices keep their original prices.</span></div>
    <Modal title="Edit product discount" description={`This percentage will apply when you add this product to ${customer?.name ?? 'this customer'}'s invoice.`} open={!!editingProduct} onClose={() => setEditingProduct(null)}>
      {editingProduct && customer && <ProductDiscountForm key={`${customer.id}-${editingProduct.id}-${asOf}`} customer={customer} product={editingProduct}
        discount={resolvePrice(editingProduct, customerId, asOf, state).value} rate={effectiveRate(editingProduct, asOf, state)} onSave={saveDiscount} onCancel={() => setEditingProduct(null)} />}
    </Modal>
    <Modal title="Update product discounts in bulk" description={`${products.length} filtered products for ${customer?.name ?? 'the selected customer'}.`} open={bulkOpen} onClose={() => setBulkOpen(false)}
      footer={<><Button onClick={() => setBulkOpen(false)}>Cancel</Button><Button variant="primary" onClick={bulkApply}>Update {products.length} products</Button></>}>
      <div className="stack"><div className="pricing-bulk-summary"><Layers3 size={20} /><div><strong>{brand || 'All brands'} · {category || 'All categories'}</strong><p className="text-small text-muted">{query ? `Search: ${query}` : 'Includes every product matching your filters.'}</p></div></div>
        <Field label="Update method"><select className="select" value={bulkMode} onChange={e => setBulkMode(e.target.value as typeof bulkMode)}><option value="percentage">Set percentage discount</option><option value="adjust">Adjust discount by percentage points</option></select></Field>
        <Field label={bulkMode === 'adjust' ? 'Percentage points to add or subtract' : 'Discount (%)'} hint={bulkMode === 'adjust' ? '+2 changes a 10% discount to 12%.' : 'Enter 0 to use the list price for these products.'}><input className="input" type="number" step="0.01" value={bulkValue} onChange={e => setBulkValue(e.target.value)} /></Field>
        <p className="text-small text-muted">Saves a separate percentage for each listed product, for this customer only. New discounts start on {shortDate(asOf)}.</p>
        {error && <div role="alert" className="error-message">{error}</div>}
      </div>
    </Modal>
  </div>;
}
