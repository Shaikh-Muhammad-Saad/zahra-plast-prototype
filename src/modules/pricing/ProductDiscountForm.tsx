import { useState, type FormEvent } from 'react';
import { Layers3 } from 'lucide-react';
import { Button, Field } from '../../components/ui';
import { money } from '../../lib/format';
import { unitNet } from '../../lib/pricing';
import type { Customer, Product } from '../../types';

type Props = {
  customer: Customer; product: Product; discount: number; rate: number | null;
  onSave: (discount: number) => void; onCancel: () => void;
};

export function ProductDiscountForm({ customer, product, discount, rate, onSave, onCancel }: Props) {
  const [value, setValue] = useState(String(discount));
  const [error, setError] = useState('');
  const percentage = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(percentage) && percentage >= 0 && percentage <= 100;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) { setError('Enter a discount between 0 and 100%.'); return; }
    try { onSave(percentage); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this discount.'); }
  }
  return <form className="stack" onSubmit={submit} noValidate>
    <div className="product-discount-context">
      <div><span>Customer</span><strong>{customer.name}</strong><small>{customer.code}</small></div>
      <div className="product-discount-product">
        {product.image ? <img src={product.image} alt="" /> : <Layers3 size={24} aria-hidden="true" />}
        <div><span>Product</span><strong>{product.name}</strong><small>{product.code} · {product.brand} · {product.packing}</small></div>
      </div>
    </div>
    <Field label="Discount (%)" hint="Enter 0 to use the list price. This discount is only for this customer and product.">
      <input autoFocus className="input" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={value}
        aria-invalid={!!error} onChange={event => { setValue(event.target.value); setError(''); }} />
    </Field>
    <dl className="product-discount-preview" aria-live="polite">
      <div><dt>List price</dt><dd>{rate === null ? 'Unavailable' : money(rate, 2)}</dd></div>
      <div><dt>Discount</dt><dd>{valid ? `${percentage}%` : '—'}</dd></div>
      <div className="product-discount-net"><dt>Net selling price<small>Per selling pack or set</small></dt><dd>{rate === null ? 'Unavailable' : valid ? money(unitNet(rate, { type: 'percentage', value: percentage }), 2) : '—'}</dd></div>
    </dl>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="form-actions"><Button onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary">Save discount</Button></div>
  </form>;
}
