import { discountAmount, documentTotal, sellingQuantity } from '../../lib/pricing';
import { money } from '../../lib/format';
import type { SalesDocument } from '../../types';

export function DocumentTotals({ document }: { document: SalesDocument }) {
  const gross = document.lines.reduce((total, line) => total + line.listRate * sellingQuantity(line), 0);
  const discounts = document.lines.reduce((total, line) => total + discountAmount(line), 0);
  return <div className="sales-totals"><div><span>List value</span><strong>{money(gross, 2)}</strong></div><div><span>Discounts</span><strong className="sales-discount">− {money(discounts, 2)}</strong></div><div className="sales-grand-total"><span>{document.kind === 'Credit Note' ? 'Credit total' : 'Net total'}</span><strong>{money(documentTotal(document), 2)}</strong></div><small>PKR · Before any applicable tax</small></div>;
}
