import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../../database';
import { buildBrandSummary } from './ReportsPage';
import type { DiscountRule } from '../../types';

function fixture() {
  const state = createInitialState();
  state.customers = state.customers.slice(0, 2);
  state.suppliers = state.suppliers.filter(supplier => supplier.name === 'SAFARI');
  state.products = state.products.slice(0, 3).map((product, index) => ({ ...product, rate: index === 2 ? null : (index + 1) * 100, packing: index === 0 ? '2 pcs' : '6 pcs', status: index === 2 ? 'Inactive' as const : 'Active' as const }));
  state.rateVersions = [{ id: 'test-rate', name: 'Test rate list', effectiveDate: '2026-10-20', createdAt: '2026-10-20', rates: { 'p-001': 100, 'p-002': 200, 'p-003': null } }];
  const base: DiscountRule = { id: 'base', customerId: 'c-001', scope: 'brand', targetId: 'SAFARI', type: 'percentage', value: 10, effectiveFrom: '2026-10-20', effectiveTo: '', active: true, updatedAt: '', updatedBy: 'Test' };
  state.rules = [base, { ...base, id: 'fixed', scope: 'product', targetId: 'p-001', type: 'fixed', value: 75 }, { ...base, id: 'customer', customerId: 'c-002', scope: 'customer', targetId: '', value: 20 }];
  return state;
}

describe('brand discount summary', () => {
  it('resolves product, brand, and default rules and excludes unpriced pairs from averages', () => {
    const [row] = buildBrandSummary(fixture(), '2026-11-16');
    expect(row).toMatchObject({
      Products: 3, Active: 2, 'Priced products': 2, 'Covered combinations': 6, 'Possible combinations': 6,
      'Priced customer-product pairs': 4, 'Mean effective discount (%)': 18.75,
      'Minimum discount (%)': 10, 'Maximum discount (%)': 25,
      'Mean net / selling unit (PKR)': 123.75, 'Mean discount / selling unit (PKR)': 26.25,
    });
  });
  it('honors selected customer and effective date, including fixed-price effects after rate changes', () => {
    const state = fixture();
    state.rateVersions.push({ id: 'new-rate', name: 'New rates', effectiveDate: '2026-12-01', createdAt: '', rates: { 'p-001': 200, 'p-002': 200, 'p-003': null } });
    const [before] = buildBrandSummary(state, '2026-11-16', 'c-001');
    const [after] = buildBrandSummary(state, '2026-12-01', 'c-001');
    expect(before['Mean effective discount (%)']).toBe(17.5);
    expect(after['Mean effective discount (%)']).toBe(36.25);
    expect(after['Possible combinations']).toBe(3);
    expect(after['Priced customer-product pairs']).toBe(2);
    expect(after['Customer scope']).toBe(state.customers[0].name);
    const [noPrices] = buildBrandSummary(state, '2026-10-01', 'c-001');
    expect(noPrices['Mean effective discount (%)']).toBeNull();
    expect(noPrices['Priced customer-product pairs']).toBe(0);
  });
});
