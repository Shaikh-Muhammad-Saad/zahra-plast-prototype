import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../../state/AppProvider';
import { Button, Field } from '../../components/ui';
import { today, uid } from '../../lib/format';
import type { Product } from '../../types';
import ProductImageField from './ProductImageField';

export default function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const { state, actions, notify } = useApp();
  const [form, setForm] = useState<Product>(product || { id: uid('product'), code: `ZP-${String(state.products.length + 1).padStart(4, '0')}`, name: '', brand: state.suppliers[0]?.name || '', category: 'School bottle', rate: null, packing: '1pc', packingCount: 1, cartonQuantity: null, status: 'Inactive', costPrice: null, effectiveDate: today(), notes: [] });
  const [error, setError] = useState(''); const [reviewed, setReviewed] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const imageReader = useRef<FileReader | null>(null);
  useEffect(() => () => imageReader.current?.abort(), []);
  function set<K extends keyof Product>(key: K, value: Product[K]) { setForm(f => ({ ...f, [key]: value })); }
  async function attachImage(file?: File) {
    if (!file) return;
    imageReader.current?.abort(); imageReader.current = null; setImageLoading(false);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Choose a JPG, PNG, or WebP image smaller than 2 MB.'); return; }
    const reader = new FileReader(); imageReader.current = reader; setImageLoading(true); setError('');
    reader.onload = () => { set('image', String(reader.result)); setImageLoading(false); imageReader.current = null; };
    reader.onerror = () => { setError('The image could not be read. Please try another file.'); setImageLoading(false); imageReader.current = null; };
    reader.readAsDataURL(file);
  }
  function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (imageLoading) return setError('Wait for the image to finish loading before saving.');
    if (!form.name.trim() || !form.code.trim() || !form.brand || !form.category) return setError('Complete the product name, code, brand, and category.');
    if (state.products.some(p => p.code.toLowerCase() === form.code.toLowerCase() && p.id !== form.id)) return setError('This product code is already in use.');
    if (form.status === 'Active' && (form.rate === null || form.rate <= 0 || !form.cartonQuantity || !form.packingCount)) return setError('An active product needs a positive rate, packing count, and carton quantity.');
    if (form.status === 'Active' && form.notes.length && !reviewed && product?.status !== 'Active') return setError('Confirm you have verified the flagged source details before activating this product.');
    try { actions.saveProduct({ ...form, name: form.name.trim(), code: form.code.trim() }); notify(product ? 'Product updated.' : 'Product added to your catalog.', 'success'); onDone(); } catch (e) { setError((e as Error).message); }
  }
  return <form onSubmit={submit} className="stack"><div className="form-grid"><Field label="Product name"><input required className="input" value={form.name} onChange={e => set('name', e.target.value)} /></Field><Field label="Product code"><input required className="input" value={form.code} onChange={e => set('code', e.target.value)} /></Field><Field label="Brand / supplier"><select className="select" value={form.brand} onChange={e => set('brand', e.target.value)}>{state.suppliers.map(s => <option key={s.id}>{s.name}</option>)}</select></Field><Field label="Category"><input required className="input" list="categories" value={form.category} onChange={e => set('category', e.target.value)} /><datalist id="categories">{[...new Set(state.products.map(p => p.category))].map(c => <option key={c}>{c}</option>)}</datalist></Field><Field label="List price (PKR)" hint={product ? 'Existing list prices are read-only to preserve price history.' : 'Price for one complete selling pack or set.'}><input className="input" type="number" min="0.01" step="0.01" disabled={!!product} value={form.rate ?? ''} onChange={e => set('rate', e.target.value ? Number(e.target.value) : null)} /></Field><Field label="Status"><select className="select" value={form.status} onChange={e => set('status', e.target.value as Product['status'])}><option>Active</option><option>Inactive</option><option>Coming Soon</option></select></Field><Field label="Packing label"><input required className="input" value={form.packing} onChange={e => set('packing', e.target.value)} /></Field><Field label="Packing count" hint="May describe a complete set or its components."><input className="input" type="number" min="1" value={form.packingCount ?? ''} onChange={e => set('packingCount', e.target.value ? Number(e.target.value) : null)} /></Field><Field label="Selling packs per carton"><input className="input" type="number" min="1" value={form.cartonQuantity ?? ''} onChange={e => set('cartonQuantity', e.target.value ? Number(e.target.value) : null)} /></Field><Field label="Effective date"><input className="input" type="date" disabled={!!product} required value={form.effectiveDate} onChange={e => set('effectiveDate', e.target.value)} /></Field></div><ProductImageField image={form.image} productName={form.name} onSelect={file => void attachImage(file)} />{form.notes.length > 0 && <div className="notice notice-amber"><strong>Source details to verify</strong><ul>{form.notes.map(n => <li key={n}>{n}</li>)}</ul>{form.status === 'Active' && product?.status !== 'Active' && <label className="check-label"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I have verified these details against the corrected source.</label>}</div>}{error && <p className="error-message" role="alert">{error}</p>}<div className="form-actions"><Button onClick={onDone}>Cancel</Button><Button type="submit" variant="primary" disabled={imageLoading}>{imageLoading ? 'Loading image...' : product ? 'Save changes' : 'Create product'}</Button></div></form>;
}
