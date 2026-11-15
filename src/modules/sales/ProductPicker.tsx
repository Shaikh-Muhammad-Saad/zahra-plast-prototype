import { useMemo, useState } from 'react';
import { Box, ChevronDown, Plus, Search, X } from 'lucide-react';
import { useApp } from '../../state/AppProvider';
import { effectiveRate } from '../../lib/pricing';
import { money } from '../../lib/format';
import type { Product } from '../../types';

export function ProductPicker({ date, disabled, onAdd }: { date: string; disabled: boolean; onAdd: (product: Product) => void }) {
  const { state } = useApp();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState('');
  const products = useMemo(() => state.products.filter(product => product.status === 'Active' && effectiveRate(product, date, state) !== null && (!brand || product.brand === brand) && `${product.code} ${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(query.toLowerCase())), [state, date, query, brand]);
  const brands = [...new Set(state.products.map(product => product.brand))];

  return <div className="sales-product-picker">
    <div className="sales-product-search">
      <Search size={18} aria-hidden="true" />
      <input aria-label="Find a product to add" placeholder={disabled ? 'Choose a customer to start adding products' : 'Search product name, code or brand to add a line…'} value={query} disabled={disabled} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }} />
      <button type="button" className="sales-icon-button" aria-label={open ? 'Close product results' : 'Show product results'} disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={17} /> : <ChevronDown size={17} />}</button>
    </div>
    {open && !disabled && <div className="sales-product-results">
      <div className="sales-product-results-header"><span>{products.length} available products</span><select className="select" aria-label="Filter products by brand" value={brand} onChange={event => setBrand(event.target.value)}><option value="">All brands</option>{brands.map(item => <option key={item}>{item}</option>)}</select></div>
      <div className="sales-product-options">
        {products.slice(0, 30).map(product => <button type="button" className="sales-product-option" key={product.id} onClick={() => { onAdd(product); setQuery(''); setOpen(false); }}>
          <span className="sales-product-thumb">{product.image ? <img src={product.image} alt="" loading="lazy" /> : <Box size={20} />}</span>
          <span className="sales-product-option-copy"><strong>{product.name}</strong><small>{product.code} · {product.brand} · {product.packing}</small></span>
          <span className="sales-product-option-price">{money(effectiveRate(product, date, state) ?? 0, 2)}<small>per selling unit</small></span>
          <Plus size={17} aria-hidden="true" />
        </button>)}
        {products.length === 0 && <p className="sales-picker-empty">No available products match your search.</p>}
        {products.length > 30 && <p className="sales-picker-empty">Showing 30 results. Refine your search to find a specific product.</p>}
      </div>
    </div>}
  </div>;
}
