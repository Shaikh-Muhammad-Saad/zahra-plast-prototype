import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { Button, Field } from '../../components/ui';
import type { Price } from '../../types';
import { validateOverride } from './sales-utils';

const reasons = ['Customer agreement', 'Sales adjustment', 'Damaged packaging', 'Manager approval', 'Other'];

export function OverridePanel({ allLines, productName, reasonRequired, onApply, onCancel }: { allLines: boolean; productName?: string; reasonRequired: boolean; onApply: (price: Price, reason: string) => void; onCancel: () => void }) {
  const [type, setType] = useState<Price['type']>('percentage');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const apply = () => {
    const invalid = validateOverride(type, value);
    const combined = [reason, note.trim()].filter(Boolean).join(' — ');
    if (invalid) { setError(invalid); return; }
    if (reasonRequired && !combined) { setError('Add an override reason before applying this change.'); return; }
    onApply({ type, value: Number(value), sourceLabel: 'Manual override' }, combined);
  };
  return <section className="sales-override-panel" aria-label="Invoice discount override">
    <div className="sales-section-heading"><div><strong>{allLines ? 'Apply a discount to all lines' : `Adjust ${productName}`}</strong><p>Only this document changes. The customer’s saved pricing stays the same.</p></div><button type="button" className="sales-icon-button" aria-label="Cancel override" onClick={onCancel}><X size={18} /></button></div>
    <div className="sales-override-fields">
      <Field label="Discount type"><select className="select" value={type} onChange={event => { setType(event.target.value as Price['type']); setValue(''); setError(''); }}><option value="percentage">Percentage discount</option><option value="fixed">Fixed net price per selling unit</option></select></Field>
      <Field label={type === 'percentage' ? 'Discount (%)' : 'Net price (PKR)'}><input className="input" aria-label={type === 'percentage' ? 'Override percentage' : 'Override fixed net price'} type="number" step="0.01" min={type === 'percentage' ? 0 : 0.01} max={type === 'percentage' ? 100 : undefined} placeholder={type === 'percentage' ? 'e.g. 12.5' : 'e.g. 180.00'} value={value} onChange={event => setValue(event.target.value)} /></Field>
      <Field label={`Reason${reasonRequired ? ' *' : ' (optional)'}`}><select className="select" value={reason} onChange={event => setReason(event.target.value)}><option value="">Select a reason</option>{reasons.map(item => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Additional note"><input className="input" placeholder="Add useful context" value={note} onChange={event => setNote(event.target.value)} /></Field>
    </div>
    {allLines && type === 'fixed' && <p className="sales-inline-note">The same net price will be applied to one selling unit of every line. This is not a fixed total for the whole document.</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="sales-override-footer"><span><ShieldCheck size={15} aria-hidden="true" /> Saved pricing is protected</span><div className="row"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="button" variant="primary" onClick={apply}>Apply {allLines ? 'to all lines' : 'override'}</Button></div></div>
  </section>;
}
