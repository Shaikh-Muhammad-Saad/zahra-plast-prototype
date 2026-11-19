import { useState } from 'react';
import { Check, FileText, PackagePlus, Percent, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { Badge, Button, CustomerSelect, Field, Modal } from '../../components/ui';
import { useModalClose } from '../../components/ui/useModalClose';
import { useApp } from '../../state/AppProvider';
import { resolvePrice } from '../../lib/pricing';
import type { DocumentLine, Price, Product, SalesDocument } from '../../types';
import { DocumentTotals } from './DocumentTotals';
import { InvoiceLineRow } from './InvoiceLineRow';
import { OverridePanel } from './OverridePanel';
import { UnsavedChangesNotice } from './UnsavedChangesNotice';
import { ProductPicker } from './ProductPicker';
import { PromotePricing } from './PromotePricing';
import { newLine } from './sales-utils';

export function DocumentEditor({ document, onClose, onSaved }: { document: SalesDocument; onClose: () => void; onSaved: (document: SalesDocument) => void }) {
  const { state, can, actions, notify } = useApp();
  const { open, close, onExited, isClosing } = useModalClose();
  const [draft, setDraft] = useState<SalesDocument>(() => structuredClone(document));
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);
  const [overrideRequest, setOverrideRequest] = useState(0);
  const openOverride = (target: string) => {
    setOverrideTarget(target);
    setOverrideRequest(request => request + 1);
  };
  const [error, setError] = useState('');
  const [discardRequest, setDiscardRequest] = useState(0);
  const [dirty, setDirty] = useState(false);
  const requestClose = () => {
    if (isClosing()) return;
    if (dirty) setDiscardRequest(request => request + 1);
    else close(onClose);
  };
  const isCredit = draft.kind === 'Credit Note';
  const overrideCount = draft.lines.filter(line => line.override).length;
  const maxOverrideDiscount = overrideTarget === 'all'
    ? draft.lines.reduce((lowest, line) => Math.min(lowest, line.listRate), draft.lines[0]?.listRate ?? 0)
    : draft.lines.find(line => line.id === overrideTarget)?.listRate ?? 0;
  const customer = state.customers.find(item => item.id === draft.customerId);
  const update = (patch: Partial<SalesDocument>) => { setDraft(current => ({ ...current, ...patch })); setDirty(true); setError(''); };
  const updateLine = (id: string, patch: Partial<DocumentLine>) => { setDraft(current => ({ ...current, lines: current.lines.map(line => line.id === id ? { ...line, ...patch } : line) })); setDirty(true); setError(''); };
  const addProduct = (product: Product) => {
    try {
      const line = newLine(product, draft.customerId, draft.date, state);
      update({ lines: [...draft.lines, line] });
    } catch (cause) { setError((cause as Error).message); }
  };
  const reset = (id?: string) => {
    update({ lines: draft.lines.map(line => {
      if (id && line.id !== id) return line;
      const product = state.products.find(item => item.id === line.productId);
      if (!product) return line;
      const pricing = resolvePrice(product, draft.customerId, draft.date, state);
      return { ...line, originalPricing: { ...pricing }, appliedPricing: { ...pricing }, override: false, reason: '' };
    }) });
    notify(id ? 'Line restored to the applicable matrix discount.' : 'All lines restored to the applicable matrix discounts.');
  };
  const applyOverride = (price: Price, reason: string) => {
    update({ lines: draft.lines.map(line => overrideTarget === 'all' || line.id === overrideTarget ? { ...line, appliedPricing: { ...price }, override: true, reason } : line) });
    setOverrideTarget(null);
  };
  const save = (post = false) => {
    if (isClosing()) return;
    if (!draft.customerId) { setError('Choose a customer before saving.'); return; }
    if (!draft.date) { setError('Choose a document date.'); return; }
    if (!draft.lines.length) { setError('Add at least one product to this document.'); return; }
    if (draft.lines.some(line => !Number.isFinite(line.quantity) || line.quantity < 1 || !Number.isInteger(line.quantity))) { setError('All quantities must be whole numbers greater than zero.'); return; }
    if (draft.dueDate && draft.dueDate < draft.date) { setError('The due or validity date cannot be before the document date.'); return; }
    if (state.settings.overrideReasonRequired && draft.lines.some(line => line.override && !line.reason.trim())) { setError('An override reason is required on every manually adjusted line.'); return; }
    try {
      const saved = actions.saveDocument({ ...draft, customerName: customer?.name ?? draft.customerName, updatedAt: new Date().toISOString() });
      if (post && draft.kind === 'Quote') {
        const invoice = actions.convertQuote(saved.id);
        notify(`Invoice ${invoice.number} created with the saved quote pricing.`, 'success');
        close(() => onSaved(invoice));
        return;
      }
      if (post) actions.postDocument(saved.id);
      notify(post ? `${saved.kind} ${saved.number} posted and locked.` : `${saved.kind} ${saved.number} saved as a draft.`, 'success');
      close(() => onSaved(post ? { ...saved, status: 'Posted' } : saved));
    } catch (cause) { setError((cause as Error).message); }
  };


  return <Modal open={open} onExited={onExited} title={draft.number || `New ${draft.kind.toLowerCase()}`} description={isCredit ? 'Return quantities use the original invoice’s rate and discount.' : 'Customer pricing is applied automatically. Every exception is traceable.'} onClose={requestClose} wide footer={<div className="sales-editor-footer"><div className="sales-protection"><ShieldCheck size={17} aria-hidden="true" /><span>Saved customer pricing stays protected</span></div><div className="row"><Button variant="ghost" onClick={requestClose}>Cancel</Button><Button variant="secondary" onClick={() => save()}><Save size={16} /> Save draft</Button><Button variant="primary" onClick={() => save(true)}><Check size={16} />{draft.kind === 'Quote' ? 'Save & create invoice' : isCredit ? 'Post credit note' : 'Post invoice'}</Button></div></div>}>
    <div className="sales-editor">
      {discardRequest > 0 && <UnsavedChangesNotice revealRequest={discardRequest} onKeepEditing={() => setDiscardRequest(0)} onDiscard={() => close(onClose)} />}
      <div className="sales-editor-meta">
        <CustomerSelect label="Customer *" customers={state.customers.filter(item => item.status === 'Active' || item.id === draft.customerId)} value={draft.customerId} disabled={draft.lines.length > 0 || isCredit} hint={draft.lines.length > 0 && !isCredit ? 'Remove lines first to change the customer.' : undefined} onChange={id => { const selected = state.customers.find(item => item.id === id); update({ customerId: id, customerName: selected?.name ?? '' }); }} />
        <Field label={`${draft.kind === 'Quote' ? 'Quote' : 'Document'} date *`} hint={draft.lines.length && !isCredit ? 'Rate date is fixed while lines are present.' : undefined}><input className="input" type="date" value={draft.date} disabled={draft.lines.length > 0 || isCredit} onChange={event => update({ date: event.target.value })} /></Field>
        <Field label={draft.kind === 'Quote' ? 'Valid until' : 'Due date'}><input className="input" type="date" min={draft.date} value={draft.dueDate} onChange={event => update({ dueDate: event.target.value })} /></Field>
      </div>
      {customer && <div className="sales-customer-strip"><span><strong>{customer.name}</strong><span>{customer.paymentTerms || 'No payment terms set'} · {customer.group || 'Ungrouped'}</span></span>{customer.sample && <Badge tone="gray">Sample customer</Badge>}</div>}
      {isCredit && <div className="sales-info-banner"><FileText size={18} aria-hidden="true" /><span>Adjust quantities or remove lines for a partial return. Original invoice prices are locked, and quantities cannot exceed the remaining returnable amount.</span></div>}
      <div className="sales-line-heading"><div><h3>Line items <span>{draft.lines.length}</span></h3><p>Each pack or set is one selling unit.</p></div>{draft.lines.length > 0 && !isCredit && <div className="row"><Button size="sm" variant="ghost" onClick={() => reset()}><RotateCcw size={15} /> Reset all to matrix</Button>{can('override') && <Button size="sm" variant="secondary" onClick={() => openOverride('all')}><Percent size={15} /> Adjust all lines</Button>}</div>}</div>
      {!isCredit && <ProductPicker date={draft.date} disabled={!draft.customerId || !draft.date} onAdd={addProduct} />}
      {overrideTarget && <OverridePanel key={overrideTarget} revealRequest={overrideRequest} maxDiscount={maxOverrideDiscount} allLines={overrideTarget === 'all'} productName={draft.lines.find(line => line.id === overrideTarget)?.productName} reasonRequired={state.settings.overrideReasonRequired} onApply={applyOverride} onCancel={() => setOverrideTarget(null)} />}
      {draft.lines.length ? <div className="table-wrap sales-lines-table"><table className="data-table"><thead><tr><th>#</th><th>Product / packing</th><th>Quantity</th><th>List rate</th><th>Discount</th><th>Net / unit</th><th>Line total</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{draft.lines.map((line, index) => <InvoiceLineRow key={line.id} line={line} index={index} canOverride={can('override')} isCredit={isCredit} onChange={patch => updateLine(line.id, patch)} onOverride={() => openOverride(line.id)} onReset={() => reset(line.id)} onRemove={() => update({ lines: draft.lines.filter(item => item.id !== line.id) })} />)}</tbody></table></div> : <div className="sales-empty-lines"><div><PackagePlus size={27} /></div><strong>Your document starts here</strong><p>Choose a customer, then add products from the catalog.</p></div>}
      <div className="sales-editor-bottom"><div className="sales-editor-notes"><Field label="Document notes" hint="These notes appear on the printed document."><textarea className="textarea" rows={3} placeholder="Delivery instructions, reference or agreed terms…" value={draft.notes} onChange={event => update({ notes: event.target.value })} /></Field>{overrideCount > 0 && <div className="sales-override-summary"><Badge tone="amber">{overrideCount} manual {overrideCount === 1 ? 'override' : 'overrides'}</Badge><span>Original pricing remains on the audit record.</span></div>}</div><DocumentTotals document={draft} /></div>
      <PromotePricing document={draft} />
      {error && <p className="error-message sales-form-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}
