import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../database';
import { discountAmount, documentTotal, effectiveRate, lineTotal, resolvePrice, sellingQuantity, unitNet } from './pricing';
import { validatePrice, validateRules } from './validation';
import { createOperations, hasPermission, refreshEffectiveRates, validateBackup } from '../state/operations';
import type { AppState, DiscountRule, DocumentLine, SalesDocument } from '../types';

function setup() {
  let state = createInitialState();
  const actions = createOperations(() => state, next => { state = next; }, createInitialState);
  return { get state() { return state; }, actions };
}
function draft(state: AppState, override = false): SalesDocument {
  const product = state.products[0];
  const pricing = resolvePrice(product, 'c-001', '2026-11-16', state);
  const line: DocumentLine = { id: 'test-line', productId: product.id, productCode: product.code, productName: product.name, brand: product.brand, category: product.category,
    packing: product.packing, cartonQuantity: product.cartonQuantity, listRate: effectiveRate(product, '2026-11-16', state)!, quantity: 2, unit: 'pack', originalPricing: pricing,
    appliedPricing: override ? { type: 'percentage', value: 20 } : pricing, override, reason: override ? 'Customer goodwill' : '' };
  return { id: 'test-document', number: '', kind: 'Invoice', status: 'Draft', customerId: 'c-001', customerName: state.customers[0].name, date: '2026-11-16', dueDate: '',
    lines: [line], notes: '', createdBy: '', createdAt: '', updatedAt: '' };
}
function rule(): DiscountRule {
  return { id: 'test-rule', customerId: 'c-150', scope: 'product', targetId: 'p-001', type: 'percentage', value: 12, effectiveFrom: '2026-11-01', effectiveTo: '', active: true, updatedAt: '', updatedBy: '' };
}

describe('source catalog', () => {
  it('retains all 317 source products, eight brands, missing rates, and unavailable costs', () => {
    const state = createInitialState();
    expect(state.products).toHaveLength(317); expect(state.suppliers).toHaveLength(8); expect(state.customers).toHaveLength(150);
    expect(new Set(state.products.map(p => p.category)).size).toBe(15);
    expect(state.products.filter(p => p.rate !== null)).toHaveLength(309);
    expect(state.products.filter(p => p.status === 'Active')).toHaveLength(304);
    expect(state.products.every(p => p.costPrice === null)).toBe(true);
    expect(state.customers.every(c => c.sample)).toBe(true);
    expect(state.products.find(p => p.sourceSerial === 191)?.rate).toBe(105);
    expect(state.products.find(p => p.sourceSerial === 117)?.packingCount).toBe(2);
  });
});
describe('customer product discounts', () => {
  it('uses only a customer-specific product percentage and starts with percentage-only samples', () => {
    const state = createInitialState(); const result = resolvePrice(state.products[0], 'c-001', '2026-11-16', state);
    expect(result.sourceLabel).toBe('Product discount'); expect(result.type).toBe('percentage'); expect(result.value).toBe(18);
    expect(state.rules).toHaveLength(40);
    expect(state.rules.every(rule => rule.scope === 'product' && rule.type === 'percentage')).toBe(true);
    expect(unitNet(200, result)).toBe(164); expect(unitNet(400, result)).toBe(328);
  });
  it('ignores retained brand, category, default and fixed-product agreements without altering them', () => {
    const state = createInitialState(); const base = rule(); state.rules = [
      { ...base, id: 'b', scope: 'brand', targetId: 'SAFARI', value: 12 },
      { ...base, id: 'c', scope: 'category', targetId: 'School bottle', value: 20 },
      { ...base, id: 'd', scope: 'customer', targetId: '', value: 15 },
      { ...base, id: 'f', type: 'fixed', value: 128 },
    ];
    const snapshot = structuredClone(state);
    expect(resolvePrice(state.products[0], 'c-150', '2026-11-16', state)).toEqual({ type: 'percentage', value: 0, sourceLabel: 'List rate' });
    expect(state).toEqual(snapshot);
  });
  it('matches the selected customer and product and respects active status and date boundaries', () => {
    const state = createInitialState(); state.rules = [{ ...rule(), effectiveTo: '2026-11-30' }];
    expect(resolvePrice(state.products[0], 'c-150', '2026-10-31', state).value).toBe(0);
    expect(resolvePrice(state.products[0], 'c-150', '2026-11-01', state).value).toBe(12);
    expect(resolvePrice(state.products[0], 'c-150', '2026-11-30', state).value).toBe(12);
    expect(resolvePrice(state.products[0], 'c-150', '2026-12-01', state).value).toBe(0);
    expect(resolvePrice(state.products[0], 'c-001', '2026-11-16', state).value).toBe(0);
    expect(resolvePrice(state.products[1], 'c-150', '2026-11-16', state).value).toBe(0);
    state.rules = [{ ...state.rules[0], active: false }];
    expect(resolvePrice(state.products[0], 'c-150', '2026-11-16', state).value).toBe(0);
  });
  it('calculates cartons as selling packs without multiplying component count', () => {
    const state = createInitialState(); const line = draft(state).lines[0];
    Object.assign(line, { listRate: 268, packing: '2 pcs', cartonQuantity: 48, quantity: 1, unit: 'carton', appliedPricing: { type: 'percentage', value: 15 } });
    expect(sellingQuantity(line)).toBe(48); expect(lineTotal(line)).toBe(10934.4); expect(discountAmount(line)).toBe(1929.6);
    expect(documentTotal({ lines: [line, line] })).toBe(21868.8);
  });
  it('does not apply future rates or rates before the first list', () => {
    const state = createInitialState(); state.rateVersions.push({ id: 'future', name: 'Future', effectiveDate: '2027-01-01', createdAt: '', rates: { 'p-001': 999 } });
    expect(effectiveRate(state.products[0], '2026-11-16', state)).toBe(156);
    expect(effectiveRate(state.products[0], '2027-01-01', state)).toBe(999);
    expect(effectiveRate(state.products[0], '2026-10-01', state)).toBe(null);
  });
  it('activates a scheduled catalog rate on its date without altering document snapshots', () => {
    const state = createInitialState(); const snapshot = JSON.stringify(state.documents);
    state.rateVersions.push({ id: 'future', name: 'Future', effectiveDate: '2027-01-01', createdAt: '', rates: { 'p-001': 999, 'p-002': null } });
    expect(refreshEffectiveRates(state, '2026-12-31').products[0].rate).toBe(156);
    const refreshed = refreshEffectiveRates(state, '2027-01-01'); expect(refreshed.products[0].rate).toBe(999); expect(refreshed.products[1].status).toBe('Inactive');
    expect(JSON.stringify(refreshed.documents)).toBe(snapshot);
  });
});
describe('product discount validation and saving', () => {
  it('rejects negative / >100 percentages and zero / nonfinite fixed prices', () => {
    expect(validatePrice({ type: 'percentage', value: -1 })).not.toHaveLength(0);
    expect(validatePrice({ type: 'percentage', value: 101 })).not.toHaveLength(0);
    expect(validatePrice({ type: 'fixed', value: 0 })).not.toHaveLength(0);
    expect(validatePrice({ type: 'fixed', value: Infinity })).not.toHaveLength(0);
    expect(validatePrice({ type: 'percentage', value: 100 })).toHaveLength(0);
  });
  it('rejects unknown customers/products and overlapping inclusive dates', () => {
    const state = createInitialState(); const first = { ...rule(), effectiveTo: '2026-11-16' }; const second = { ...rule(), id: 'second', effectiveFrom: '2026-11-16' };
    expect(validateRules([first, second], state).join()).toContain('Overlapping');
    expect(validateRules([{ ...rule(), customerId: 'missing', targetId: 'missing' }], state).join()).toContain('Unknown');
  });
  it('updates by rule ID without self-conflict and records old/new values', () => {
    const s = setup(); s.actions.saveRules([rule()]); s.actions.saveRules([{ ...rule(), value: 17 }]);
    expect(s.state.rules.find(r => r.id === 'test-rule')?.value).toBe(17);
    expect(s.state.audit[0].before).toContain('12'); expect(s.state.audit[0].after).toContain('17');
  });
  it('commits direct and batch product discounts immediately despite a legacy approval setting', () => {
    const s = setup(); s.actions.updateSettings({ approvalRequired: true });
    const documents = structuredClone(s.state.documents);
    s.actions.saveRules([rule()], 'Product discounts imported');
    s.actions.saveProductDiscount('c-150', 'p-002', { type: 'percentage', value: 23 }, '2026-11-16');
    expect(resolvePrice(s.state.products[0], 'c-150', '2026-11-16', s.state).value).toBe(12);
    expect(resolvePrice(s.state.products[1], 'c-150', '2026-11-16', s.state).value).toBe(23);
    expect(s.state.approvals).toHaveLength(0);
    expect(s.state.documents).toEqual(documents);
    expect(s.state.audit[0].action).toBe('Product discount updated');
  });
  it('deactivates a product discount immediately without an approval queue', () => {
    const s = setup(); s.actions.saveRules([rule()]); s.actions.updateSettings({ approvalRequired: true }); s.actions.deleteRule('test-rule');
    expect(s.state.rules.find(r => r.id === 'test-rule')?.active).toBe(false);
    expect(s.state.approvals).toHaveLength(0);
  });
  it('rejects new inherited or fixed matrix writes atomically', () => {
    const s = setup(); const before = structuredClone(s.state);
    for (const scope of ['brand', 'category', 'customer'] as const) {
      expect(() => s.actions.saveRules([{ ...rule(), scope }])).toThrow('Only customer-specific product');
    }
    expect(() => s.actions.saveRules([{ ...rule(), type: 'fixed', value: 120 }])).toThrow('percentage');
    expect(() => s.actions.saveProductDiscount('c-150', 'p-001', { type: 'fixed', value: 120 }, '2026-11-16')).toThrow('percentage');
    expect(s.state).toEqual(before);
  });
  it('updates a matching entry without losing its dates and supports an explicit zero percent reset', () => {
    const s = setup(); s.actions.saveRules([{ ...rule(), effectiveTo: '2026-12-31' }]);
    const saved = s.actions.saveProductDiscount('c-150', 'p-001', { type: 'percentage', value: 0 }, '2026-11-16');
    expect(saved).toMatchObject({ id: 'test-rule', effectiveFrom: '2026-11-01', effectiveTo: '2026-12-31', active: true, value: 0 });
    expect(s.state.rules.filter(rule => rule.id === 'test-rule')).toHaveLength(1);
    expect(resolvePrice(s.state.products[0], 'c-150', '2026-11-16', s.state)).toMatchObject({ type: 'percentage', value: 0, ruleId: 'test-rule' });
    expect(s.state.audit[0].before).toContain('12'); expect(s.state.audit[0].after).toContain('"value":0');
  });
  it('keeps a future product percentage intact when adding one in an earlier gap', () => {
    const s = setup(); s.actions.saveRules([{ ...rule(), effectiveFrom: '2026-12-01' }]);
    const saved = s.actions.saveProductDiscount('c-150', 'p-001', { type: 'percentage', value: 7 }, '2026-11-16');
    expect(saved.effectiveTo).toBe('2026-11-30');
    expect(resolvePrice(s.state.products[0], 'c-150', '2026-11-30', s.state).value).toBe(7);
    expect(resolvePrice(s.state.products[0], 'c-150', '2026-12-01', s.state).value).toBe(12);
    expect(() => validateBackup(s.state)).not.toThrow();
  });
  it('retains legacy fixed prices and approval history when saving a live percent and restoring its backup', () => {
    const s = setup(); const legacy = { ...rule(), id: 'legacy-fixed', type: 'fixed' as const, value: 128 };
    s.state.rules.push(legacy);
    s.state.approvals.push({ id: 'legacy-approval', requestedBy: 'Prior user', requestedAt: '2026-11-01', reason: 'Old request', rules: [rule()], status: 'Pending' });
    const documents = structuredClone(s.state.documents);
    s.actions.saveProductDiscount('c-150', 'p-001', { type: 'percentage', value: 15 }, '2026-11-16');
    expect(s.state.rules.find(rule => rule.id === legacy.id)).toEqual(legacy);
    expect(s.state.approvals[0].status).toBe('Pending');
    expect(resolvePrice(s.state.products[0], 'c-150', '2026-11-16', s.state).value).toBe(15);
    expect(() => validateBackup(s.state)).not.toThrow();
    s.actions.restoreBackup(s.state);
    expect(resolvePrice(s.state.products[0], 'c-150', '2026-11-16', s.state).value).toBe(15);
    expect(s.state.documents).toEqual(documents);
  });
  it('validates manual discount input and permissions before writing any state', () => {
    const s = setup(); const before = structuredClone(s.state);
    expect(() => s.actions.saveProductDiscount('unknown', 'p-001', { type: 'percentage', value: 10 }, '2026-11-16')).toThrow('Unknown customer');
    expect(() => s.actions.saveProductDiscount('c-150', 'unknown', { type: 'percentage', value: 10 }, '2026-11-16')).toThrow('Unknown product');
    expect(() => s.actions.saveProductDiscount('c-150', 'p-001', { type: 'percentage', value: 101 }, '2026-11-16')).toThrow('between');
    expect(() => s.actions.saveProductDiscount('c-150', 'p-001', { type: 'percentage', value: 10 }, 'bad-date')).toThrow('date');
    expect(s.state).toEqual(before);
    s.actions.switchUser('u-finance');
    expect(() => s.actions.saveProductDiscount('c-150', 'p-001', { type: 'percentage', value: 10 }, '2026-11-16')).toThrow('permission');
  });
  it('handles a complete 150 by 317 matrix and all its effective lookups', () => {
    const state = createInitialState(); state.rules = [];
    const matrix = state.customers.flatMap(customer => state.products.map(product => ({ ...rule(), id: `${customer.id}-${product.id}`, customerId: customer.id, targetId: product.id })));
    expect(matrix).toHaveLength(47_550); expect(validateRules(matrix, state)).toHaveLength(0);
    state.rules = matrix;
    let total = 0;
    for (const customer of state.customers) for (const product of state.products) total += resolvePrice(product, customer.id, '2026-11-16', state).value;
    expect(total).toBe(47_550 * 12);
  });
});
describe('invoice invariants', () => {
  it('saving and posting an override never mutate matrix rules', () => {
    const s = setup(); const before = JSON.stringify(s.state.rules); const saved = s.actions.saveDocument(draft(s.state, true));
    expect(saved.number).toMatch(/^ZP-INV-/); s.actions.postDocument(saved.id);
    expect(JSON.stringify(s.state.rules)).toBe(before); expect(s.state.documents.find(d => d.id === saved.id)?.status).toBe('Posted');
  });
  it('stamps override provenance with the actual editor and carries it on conversion', () => {
    const s = setup(); const input = draft(s.state, true); input.lines[0].overrideBy = 'Forged user';
    const saved = s.actions.saveDocument({ ...input, kind: 'Quote' });
    expect(saved.lines[0].overrideBy).toBe('Demo Administrator'); expect(saved.lines[0].overrideAt).toBeTruthy();
    s.actions.switchUser('u-sales'); const invoice = s.actions.convertQuote(saved.id);
    expect(invoice.lines[0].overrideBy).toBe('Demo Administrator');
    const changed = s.actions.saveDocument({ ...invoice, lines: [{ ...invoice.lines[0], appliedPricing: { type: 'percentage', value: 25 } }] });
    expect(changed.lines[0].overrideBy).toBe('Demo Billing User');
    expect(changed.createdBy).toBe('Demo Billing User');
  });
  it('posted documents reject direct edits and are unchanged by future matrix/rate updates', () => {
    const s = setup(); const saved = s.actions.saveDocument(draft(s.state, true)); s.actions.postDocument(saved.id);
    const snapshot = JSON.stringify(s.state.documents.find(d => d.id === saved.id));
    expect(() => s.actions.saveDocument({ ...saved, status: 'Draft', notes: 'edit' })).toThrow('locked');
    s.actions.saveRules([{ ...s.state.rules.find(r => r.id === 'sample-product-0')!, value: 50 }]);
    s.actions.addRateVersion({ id: 'v2', name: 'New rates', effectiveDate: '2026-12-01', rates: { 'p-001': 500 }, createdAt: '' });
    expect(JSON.stringify(s.state.documents.find(d => d.id === saved.id))).toBe(snapshot);
  });
  it('keeps draft snapshot pricing until an explicit reset', () => {
    const s = setup(); const saved = s.actions.saveDocument(draft(s.state)); const oldPrice = saved.lines[0].appliedPricing.value;
    s.actions.saveRules([{ ...s.state.rules.find(r => r.id === 'sample-product-0')!, value: 50 }]);
    const unchanged = s.actions.saveDocument({ ...saved, notes: 'still original' }); expect(unchanged.lines[0].appliedPricing.value).toBe(oldPrice);
    const reset = resolvePrice(s.state.products[0], saved.customerId, saved.date, s.state);
    const updated = s.actions.saveDocument({ ...saved, lines: [{ ...saved.lines[0], originalPricing: reset, appliedPricing: reset }] });
    expect(updated.lines[0].appliedPricing.value).toBe(50);
  });
  it('rejects invoices for inactive products and hidden overrides', () => {
    const s = setup(); const inactive = s.state.products.find(p => p.sourceSerial === 191)!; const document = draft(s.state);
    document.lines[0].productId = inactive.id; expect(() => s.actions.saveDocument(document)).toThrow('inactive');
    const hidden = draft(s.state); hidden.lines[0].appliedPricing = { type: 'percentage', value: 50 };
    expect(() => s.actions.saveDocument(hidden)).toThrow('marked');
  });
  it('rejects unauthorized overrides and missing reasons', () => {
    const s = setup(); s.actions.saveUser({ ...s.state.users.find(u => u.id === 'u-sales')!, canOverride: false }); s.actions.switchUser('u-sales');
    expect(() => s.actions.saveDocument(draft(s.state, true))).toThrow('permission');
    s.actions.switchUser('u-admin'); const document = draft(s.state, true); document.lines[0].reason = '';
    expect(() => s.actions.saveDocument(document)).toThrow('reason');
  });
  it('rejects tampered effective source rates and matrix snapshots on new lines', () => {
    const s = setup(); const document = draft(s.state); document.lines[0].listRate = 1;
    expect(() => s.actions.saveDocument(document)).toThrow('effective list rate');
    document.lines[0].listRate = 156; document.lines[0].originalPricing = { type: 'percentage', value: 99 };
    expect(() => s.actions.saveDocument(document)).toThrow('Original matrix');
  });
  it('ignores spoofed actor/number/post metadata and canonicalizes product names', () => {
    const s = setup(); const input = draft(s.state); input.number = 'FAKE'; input.createdBy = 'Someone else'; input.postedAt = '2026-01-01'; input.lines[0].productName = 'Invented item';
    const saved = s.actions.saveDocument(input); expect(saved.number).not.toBe('FAKE'); expect(saved.createdBy).toBe('Demo Administrator'); expect(saved.postedAt).toBeUndefined();
    expect(saved.lines[0].productName).toBe(s.state.products[0].name);
    saved.lines[0].listRate = 1; expect(s.state.documents.find(d => d.id === saved.id)?.lines[0].listRate).toBe(156);
  });
  it('rejects arbitrary source links and saved date/customer changes on retained lines', () => {
    const s = setup(); expect(() => s.actions.saveDocument({ ...draft(s.state), sourceDocumentId: 'sample-doc-1' })).toThrow('conversion');
    const saved = s.actions.saveDocument(draft(s.state));
    expect(() => s.actions.saveDocument({ ...saved, date: '2026-12-01' })).toThrow('Remove existing lines');
    expect(() => s.actions.saveDocument({ ...saved, customerId: 'c-002' })).toThrow('Remove existing lines');
    expect(() => s.actions.saveDocument({ ...saved, kind: 'Quote' })).toThrow('kind');
  });
  it('quote conversion preserves discounts and labels and can only happen once', () => {
    const s = setup(); const quote = s.actions.saveDocument({ ...draft(s.state, true), kind: 'Quote' }); const before = JSON.stringify(s.state.rules);
    const invoice = s.actions.convertQuote(quote.id); expect(invoice.lines).toEqual(quote.lines); expect(invoice.status).toBe('Draft');
    expect(JSON.parse(s.state.audit[0].before!).status).toBe('Draft'); expect(JSON.parse(s.state.audit[0].after!).quote.status).toBe('Converted');
    expect(JSON.stringify(s.state.rules)).toBe(before); expect(() => s.actions.convertQuote(quote.id)).toThrow('unconverted');
  });
});
describe('returns, permissions and rate history', () => {
  it('credit notes preserve original pricing and reject excess cumulative returns', () => {
    const s = setup(); const original = s.actions.saveDocument(draft(s.state, true)); s.actions.postDocument(original.id);
    const credit = s.actions.creditDocument(original.id, 'Return one pack'); credit.lines[0].quantity = 1;
    s.actions.saveDocument(credit); s.actions.postDocument(credit.id);
    const second = s.actions.creditDocument(original.id, 'Return remainder'); expect(second.lines[0].quantity).toBe(1);
    expect(second.lines[0].appliedPricing).toEqual(original.lines[0].appliedPricing);
    expect(() => s.actions.saveDocument({ ...second, lines: [{ ...second.lines[0], quantity: 2 }] })).toThrow('unreturned');
    expect(() => s.actions.saveDocument({ ...second, lines: [{ ...second.lines[0], listRate: 2 }] })).toThrow('original invoice');
  });
  it('bounds returns by original line when the same product has different discounts', () => {
    const s = setup(); const input = draft(s.state, true);
    input.lines.push({ ...input.lines[0], id: 'second-source-line', quantity: 5, appliedPricing: { type: 'percentage', value: 90 } });
    const original = s.actions.saveDocument(input); s.actions.postDocument(original.id);
    const credit = s.actions.creditDocument(original.id, 'Partial return');
    credit.lines = [{ ...credit.lines[0], quantity: 3 }];
    expect(() => s.actions.saveDocument(credit)).toThrow('unreturned');
  });
  it('controlled reversal locks the original and requires a reason', () => {
    const s = setup(); const saved = s.actions.saveDocument(draft(s.state)); s.actions.postDocument(saved.id);
    expect(() => s.actions.reverseDocument(saved.id, '')).toThrow('reason'); s.actions.reverseDocument(saved.id, 'Entered in error');
    expect(s.state.documents.find(d => d.id === saved.id)?.status).toBe('Reversed');
    expect(() => s.actions.saveDocument(saved)).toThrow('locked');
  });
  it('Finance is view-only at the operation boundary', () => {
    const s = setup(); s.actions.switchUser('u-finance');
    expect(hasPermission(s.state.users.find(u => u.id === 'u-finance')!, 'billing')).toBe(false);
    expect(() => s.actions.saveRules([rule()])).toThrow('permission'); expect(() => s.actions.saveDocument(draft(s.state))).toThrow('permission');
    expect(() => s.actions.updateSettings({ approvalRequired: true })).toThrow('permission');
  });
  it('rejects direct rate overwrites, invalid/backdated versions, preserves old rates', () => {
    const s = setup(); expect(() => s.actions.saveProduct({ ...s.state.products[0], rate: 999 })).toThrow('rate list');
    expect(() => s.actions.addRateVersion({ id: 'bad', name: 'Bad', effectiveDate: '2026-10-20', rates: { 'p-001': 200 }, createdAt: '' })).toThrow('after');
    s.actions.addRateVersion({ id: 'good', name: 'December', effectiveDate: '2026-12-01', rates: { 'p-001': 200 }, createdAt: '' });
    expect(effectiveRate(s.state.products[0], '2026-11-16', s.state)).toBe(156);
    expect(effectiveRate(s.state.products[0], '2026-12-01', s.state)).toBe(200);
  });
  it('validates backup schema and preserves no invented costs', () => {
    const s = setup(); expect(() => validateBackup(s.state)).not.toThrow();
    expect(() => validateBackup({ ...s.state, schemaVersion: 99 })).toThrow('compatible');
    const broken = structuredClone(s.state); broken.products[0].rate = -4; expect(() => validateBackup(broken)).toThrow('positive');
  });
});
