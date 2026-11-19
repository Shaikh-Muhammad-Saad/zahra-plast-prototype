import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { Button, Field } from '../../components/ui';
import type { Price } from '../../types';
import { money } from '../../lib/format';
import { unitNet } from '../../lib/pricing';
import { validateOverride } from './sales-utils';

const reasons = ['Customer agreement', 'Sales adjustment', 'Damaged packaging', 'Manager approval', 'Other'];

export function OverridePanel({ revealRequest, maxDiscount, allLines, productName, reasonRequired, onApply, onCancel }: { revealRequest: number; maxDiscount: number; allLines: boolean; productName?: string; reasonRequired: boolean; onApply: (price: Price, reason: string) => void; onCancel: () => void }) {
  const [type, setType] = useState<Price['type']>('percentage');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const scroller = panel?.closest<HTMLElement>('.modal-content');
    if (!panel || !scroller) return;

    valueRef.current?.focus({ preventScroll: true });
    // Scroll the modal body only, keeping its header and footer in place.
    scroller.scrollTo({
      top: Math.max(0, scroller.scrollTop + panel.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [revealRequest]);

  const apply = () => {
    const invalid = validateOverride(type, value, maxDiscount);
    const combined = [reason, note.trim()].filter(Boolean).join(' — ');
    if (invalid) { setError(invalid); return; }
    if (reasonRequired && !combined) { setError('Add an override reason before applying this change.'); return; }
    onApply({ type, value: Number(value), sourceLabel: 'Manual override' }, combined);
  };
  return <section ref={panelRef} className="sales-override-panel" aria-label="Invoice discount override">
    <div className="sales-section-heading"><div><strong>{allLines ? 'Apply a discount to all lines' : `Adjust ${productName}`}</strong><p>Only this document changes. The customer’s saved pricing stays the same.</p></div><button type="button" className="sales-icon-button" aria-label="Cancel override" onClick={onCancel}><X size={18} /></button></div>
    <div className="sales-override-fields">
      <Field label="Discount type"><select className="select" value={type} onChange={event => { setType(event.target.value as Price['type']); setValue(''); setError(''); }}><option value="percentage">Percentage discount</option><option value="amount">Fixed discount per selling unit</option></select></Field>
      <Field label={type === 'percentage' ? 'Discount (%)' : 'Discount (PKR)'}><input ref={valueRef} className="input" aria-label={type === 'percentage' ? 'Override percentage' : 'Override fixed discount'} type="number" step="0.01" min={0} max={type === 'percentage' ? 100 : maxDiscount} placeholder={type === 'percentage' ? 'e.g. 12.5' : 'e.g. 180.00'} value={value} onChange={event => setValue(event.target.value)} /></Field>
      <Field label={`Reason${reasonRequired ? ' *' : ' (optional)'}`}><select className="select" value={reason} onChange={event => setReason(event.target.value)}><option value="">Select a reason</option>{reasons.map(item => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Additional note"><input className="input" placeholder="Add useful context" value={note} onChange={event => setNote(event.target.value)} /></Field>
    </div>
    {type === 'amount' && <p className="sales-inline-note">{allLines
      ? `Subtract this amount from the list rate of every selling pack or set. Maximum discount: ${money(maxDiscount, 2)} (the lowest list rate).`
      : <>Discount per selling pack or set. {value.trim() && !validateOverride(type, value, maxDiscount)
        ? <strong>{money(maxDiscount, 2)} minus {money(Number(value), 2)} = {money(unitNet(maxDiscount, { type, value: Number(value) }), 2)} net.</strong>
        : `Maximum discount: ${money(maxDiscount, 2)}.`}</>}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="sales-override-footer"><span><ShieldCheck size={15} aria-hidden="true" /> Saved pricing is protected</span><div className="row"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="button" variant="primary" onClick={apply}>Apply {allLines ? 'to all lines' : 'override'}</Button></div></div>
  </section>;
}
