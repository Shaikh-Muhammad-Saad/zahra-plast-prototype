import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui';
import { useApp } from '../../state/AppProvider';
import { uid } from '../../lib/format';
import type { DiscountRule, SalesDocument } from '../../types';

export function PromotePricing({ document }: { document: SalesDocument }) {
  const { state, user, actions, notify } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const overridden = document.lines.filter(line => line.override);
  if (!state.settings.allowSaveToMatrix || user.role !== 'Pricing Manager' || !overridden.length || document.kind === 'Credit Note') return null;
  const promote = () => {
    try {
      const timestamp = new Date().toISOString();
      const overridePrices = new Map<string, string>();
      for (const line of overridden) {
        const signature = `${line.appliedPricing.type}:${line.appliedPricing.value}`;
        if (overridePrices.has(line.productId) && overridePrices.get(line.productId) !== signature) throw new Error('The same product has different overrides on multiple lines. Set its permanent price in Discount Management.');
        overridePrices.set(line.productId, signature);
      }
      const rules: DiscountRule[] = overridden.map(line => {
        const existing = state.rules.find(rule => rule.customerId === document.customerId && rule.scope === 'product' && rule.targetId === line.productId && rule.active && rule.effectiveFrom <= document.date && (!rule.effectiveTo || rule.effectiveTo >= document.date));
        return { id: existing?.id ?? uid('rule'), customerId: document.customerId, scope: 'product', targetId: line.productId, type: line.appliedPricing.type, value: line.appliedPricing.value, effectiveFrom: existing?.effectiveFrom ?? document.date, effectiveTo: existing?.effectiveTo ?? '', active: true, updatedAt: timestamp, updatedBy: user.name };
      });
      actions.saveRules([...new Map(rules.map(rule => [rule.targetId, rule])).values()], `Explicit Save to matrix from ${document.number || 'unsaved document'}`);
      notify(state.settings.approvalRequired ? 'Pricing changes submitted for approval.' : 'Customer pricing updated by your explicit request.', 'success');
      setConfirm(false); setError('');
    } catch (cause) { setError((cause as Error).message); }
  };
  return <div className="sales-matrix-action no-print">{!confirm ? <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>Save overrides to customer pricing <ArrowRight size={15} /></Button> : <div className="sales-confirm-box"><div><strong>Make these customer prices permanent?</strong><p>This separate action updates {overridePricesCount(overridden)} product agreement(s), subject to approval settings. It is not part of saving this invoice.</p>{error && <p className="error-message" role="alert">{error}</p>}</div><div className="row"><Button size="sm" variant="secondary" onClick={() => { setConfirm(false); setError(''); }}>Cancel</Button><Button size="sm" variant="primary" onClick={promote}>Confirm pricing change</Button></div></div>}</div>;
}

function overridePricesCount(lines: SalesDocument['lines']) { return new Set(lines.map(line => line.productId)).size; }
