import { useState } from 'react';
import { ArrowRight, CornerDownLeft, FileCheck2, LockKeyhole, PencilLine, Printer, RotateCcw, ShieldCheck } from 'lucide-react';
import { Badge, Button, Field, Modal } from '../../components/ui';
import { useApp } from '../../state/AppProvider';
import { discountAmount, lineTotal, sellingQuantity, unitNet } from '../../lib/pricing';
import { money, shortDate } from '../../lib/format';
import type { SalesDocument } from '../../types';
import { DocumentTotals } from './DocumentTotals';
import { PromotePricing } from './PromotePricing';
import { priceLabel, statusTone } from './sales-utils';

export function DocumentPreview({ document, onClose, onEdit, onOpenCreated }: { document: SalesDocument; onClose: () => void; onEdit: () => void; onOpenCreated: (document: SalesDocument) => void }) {
  const { state, can, actions, notify } = useApp();
  const [operation, setOperation] = useState<'credit' | 'reverse' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const customer = state.customers.find(item => item.id === document.customerId);
  const original = state.documents.find(item => item.id === document.sourceDocumentId);
  const related = state.documents.filter(item => item.sourceDocumentId === document.id);
  const run = (action: () => void) => { try { setError(''); action(); } catch (cause) { setError((cause as Error).message); } };
  const confirmOperation = () => {
    if (!reason.trim()) { setError('Add a reason so this correction can be traced.'); return; }
    run(() => {
      if (operation === 'credit') {
        const credit = actions.creditDocument(document.id, reason.trim());
        notify('Credit note prepared with the original invoice pricing.', 'success');
        onOpenCreated(credit);
      } else {
        actions.reverseDocument(document.id, reason.trim());
        notify('Invoice reversed. Its original record is preserved.', 'success');
        setOperation(null);
      }
    });
  };
  return <Modal open title={document.number} description={`${document.kind} · ${shortDate(document.date)}`} onClose={onClose} wide footer={<div className="sales-preview-footer"><div className="sales-protection"><ShieldCheck size={17} /><span>{document.status === 'Draft' ? 'Draft values are preserved until explicitly changed.' : 'Issued pricing is preserved in this document.'}</span></div><div className="row"><Button variant="secondary" onClick={() => window.print()}><Printer size={16} /> Print / PDF</Button>{document.status === 'Draft' && can('billing') && <Button variant="primary" onClick={onEdit}><PencilLine size={16} /> Edit draft</Button>}</div></div>}>
    <div className="sales-preview">
      <div className="sales-document-actions no-print"><div className="row"><Badge tone={statusTone(document.status)}>{document.status}</Badge>{customer?.sample && <Badge tone="gray">Sample transaction</Badge>}{document.status === 'Posted' && <span className="sales-lock-note"><LockKeyhole size={14} /> Pricing locked</span>}</div><div className="row">{document.kind === 'Quote' && document.status === 'Draft' && can('billing') && <Button size="sm" variant="primary" onClick={() => run(() => { const invoice = actions.convertQuote(document.id); notify('Invoice created with the quote’s saved pricing.', 'success'); onOpenCreated(invoice); })}>Convert to invoice <ArrowRight size={16} /></Button>}{document.kind === 'Invoice' && document.status === 'Posted' && can('billing') && <><Button variant="secondary" size="sm" onClick={() => { setOperation('credit'); setReason(''); setError(''); }}><CornerDownLeft size={15} /> Return / credit note</Button><Button variant="ghost" size="sm" onClick={() => { setOperation('reverse'); setReason(''); setError(''); }}><RotateCcw size={15} /> Reverse</Button></>}{document.status === 'Draft' && document.kind !== 'Quote' && can('billing') && <Button size="sm" variant="secondary" onClick={() => run(() => { actions.postDocument(document.id); notify(`${document.kind} posted and locked.`, 'success'); })}><FileCheck2 size={16} />Post document</Button>}</div></div>
      {operation && <div className="sales-operation-panel no-print"><strong>{operation === 'credit' ? 'Create a return / credit note' : 'Reverse this invoice'}</strong><p>{operation === 'credit' ? 'A draft credit note will copy the original prices. You can reduce quantities for a partial return before posting.' : 'The original invoice remains in the audit trail with a Reversed status. It will no longer contribute to posted invoice value.'}</p><Field label="Reason *"><textarea className="textarea" rows={2} value={reason} onChange={event => setReason(event.target.value)} placeholder="Describe the return or correction" /></Field><div className="sales-operation-buttons"><Button variant="ghost" size="sm" onClick={() => setOperation(null)}>Cancel</Button><Button variant={operation === 'reverse' ? 'danger' : 'primary'} size="sm" onClick={confirmOperation}>{operation === 'credit' ? 'Prepare credit note' : 'Confirm reversal'}</Button></div></div>}
      {error && <p className="error-message no-print" role="alert">{error}</p>}
      <article className="sales-print-sheet">
        <header className="sales-print-header"><div><div className="sales-print-brand">{state.settings.companyName || 'Zehra Plast'}<span>PRODUCTS. PEOPLE. PARTNERSHIPS.</span></div>{state.settings.address && <p>{state.settings.address}</p>}{state.settings.phone && <p>{state.settings.phone}</p>}{state.settings.email && <p>{state.settings.email}</p>}</div><div className="sales-print-document-title"><span>{document.kind}</span><strong>{document.number}</strong><p>{document.status}</p></div></header>
        <div className="sales-print-meta"><div><small>BILL TO</small><strong>{document.customerName}</strong>{customer?.code && <span>{customer.code}</span>}{customer?.address && <span>{customer.address}</span>}{customer?.phone && <span>{customer.phone}</span>}{customer?.sample && <span className="sales-sample-watermark">Sample customer · demonstration document</span>}</div><dl><div><dt>Document date</dt><dd>{shortDate(document.date)}</dd></div>{document.dueDate && <div><dt>{document.kind === 'Quote' ? 'Valid until' : 'Due date'}</dt><dd>{shortDate(document.dueDate)}</dd></div>}<div><dt>Payment terms</dt><dd>{customer?.paymentTerms || 'Not specified'}</dd></div>{original && <div><dt>Reference</dt><dd>{original.number}</dd></div>}<div><dt>Currency</dt><dd>PKR</dd></div></dl></div>
        <div className="table-wrap sales-print-table"><table className="data-table"><thead><tr><th>Product</th><th>Qty</th><th>List rate</th><th>Discount</th><th>Discount amount</th><th>Net / unit</th><th>Total</th></tr></thead><tbody>{document.lines.map(line => <tr key={line.id}><td><strong>{line.productName}</strong><small>{line.productCode} · {line.packing} / pack</small><small>{line.cartonQuantity === null ? 'Carton qty not specified' : `${line.cartonQuantity} packs / carton`}</small></td><td>{line.quantity} {line.unit}{line.quantity === 1 ? '' : 's'}{line.unit === 'carton' && <small>{sellingQuantity(line)} packs</small>}</td><td>{money(line.listRate, 2)}</td><td>{priceLabel(line.appliedPricing)}<small>{line.override ? 'Manual override' : 'Matrix'}</small></td><td>{money(discountAmount(line), 2)}</td><td>{money(unitNet(line.listRate, line.appliedPricing), 2)}</td><td><strong>{money(lineTotal(line), 2)}</strong></td></tr>)}</tbody></table></div>
        <div className="sales-print-bottom"><div>{document.notes && <><small className="sales-print-note-label">NOTES</small><p>{document.notes}</p></>}<p className="sales-print-thanks">Thank you for choosing Zehra Plast.</p></div><DocumentTotals document={document} /></div>
        <footer className="sales-print-footer"><span>{document.number}</span><span>Prices are per selling pack or set. Generated from Zehra Plast.</span></footer>
      </article>
      {document.lines.some(line => line.override) && <section className="sales-original-pricing no-print"><h3>Pricing traceability</h3><p className="text-muted text-small">Original agreements and reasons are retained for internal review.</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Original agreement</th><th>Applied</th><th>Reason</th></tr></thead><tbody>{document.lines.filter(line => line.override).map(line => <tr key={line.id}><td>{line.productName}</td><td>{priceLabel(line.originalPricing)}</td><td>{priceLabel(line.appliedPricing)}</td><td>{line.reason || 'No reason recorded'}</td></tr>)}</tbody></table></div></section>}
      <PromotePricing document={document} />
      {related.length > 0 && <div className="sales-related-documents no-print"><strong>Related documents</strong>{related.map(item => <span key={item.id}>{item.number} · {item.kind} · {item.status}</span>)}</div>}
    </div>
  </Modal>;
}
