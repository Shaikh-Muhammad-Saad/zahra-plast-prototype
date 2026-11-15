import { PencilLine, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui';
import { discountAmount, lineTotal, sellingQuantity, unitNet } from '../../lib/pricing';
import { money } from '../../lib/format';
import type { DocumentLine } from '../../types';
import { priceLabel } from './sales-utils';

export function InvoiceLineRow({ line, index, canOverride, isCredit, onChange, onOverride, onReset, onRemove }: { line: DocumentLine; index: number; canOverride: boolean; isCredit: boolean; onChange: (patch: Partial<DocumentLine>) => void; onOverride: () => void; onReset: () => void; onRemove: () => void }) {
  return <tr>
    <td className="sales-line-index">{String(index + 1).padStart(2, '0')}</td>
    <td className="sales-line-product"><strong>{line.productName}</strong><span>{line.productCode} · {line.brand}</span><small>{line.packing} / selling unit · {line.cartonQuantity === null ? 'Carton quantity unavailable' : `${line.cartonQuantity} packs / carton`}</small></td>
    <td><div className="sales-quantity-control"><input className="input" type="number" aria-label={`Quantity for ${line.productName}`} min="1" step="1" value={line.quantity || ''} onChange={event => onChange({ quantity: Number(event.target.value) })} /><select className="select" aria-label={`Order unit for ${line.productName}`} value={line.unit} onChange={event => onChange({ unit: event.target.value as 'pack' | 'carton' })}><option value="pack">Pack</option><option value="carton" disabled={!line.cartonQuantity}>Carton</option></select></div>{line.unit === 'carton' && <small className="text-muted">{sellingQuantity(line)} selling packs</small>}</td>
    <td className="sales-money">{money(line.listRate, 2)}</td>
    <td className="sales-line-pricing"><div className="sales-pricing-value"><strong>{priceLabel(line.appliedPricing)}</strong>{canOverride && !isCredit && <button type="button" className="sales-icon-button" aria-label={`Change discount for ${line.productName}`} onClick={onOverride}><PencilLine size={15} /></button>}</div><Badge tone={line.override ? 'amber' : 'green'}>{line.override ? 'Manual override' : 'Matrix'}</Badge>{line.override && <small>Original: {priceLabel(line.originalPricing)}</small>}<small>{money(discountAmount(line), 2)} line discount</small>{line.override && line.reason && <small className="sales-reason" title={line.reason}>{line.reason}</small>}</td>
    <td className="sales-money">{money(unitNet(line.listRate, line.appliedPricing), 2)}</td>
    <td className="sales-money sales-line-total">{money(lineTotal(line), 2)}</td>
    <td><div className="sales-row-tools">{!isCredit && <button type="button" className="sales-icon-button" aria-label={`Reset ${line.productName} to matrix`} title="Reset to matrix" onClick={onReset}><RotateCcw size={15} /></button>}<button type="button" className="sales-icon-button sales-icon-danger" aria-label={`Remove ${line.productName}`} onClick={onRemove}><Trash2 size={16} /></button></div></td>
  </tr>;
}
