import { describe, expect, it } from 'vitest';
import { validateImport, exportRows, parseSpreadsheet, parseWorkspaceBackup, MAX_BACKUP_BYTES } from '../../lib/spreadsheets';
import type { AppState, DiscountRule } from '../../types';
import { validateBackup } from '../../state/operations';

function fixture(): AppState {
  return {
    schemaVersion: 1, currentUserId: 'admin',
    products: [{ id: 'p1', code: 'ZP-001', name: 'Grip Bottle Small', brand: 'SAFARI', category: 'School bottle', rate: 156, packing: '1pc', packingCount: 1, cartonQuantity: 96, status: 'Active', costPrice: null, effectiveDate: '2026-10-20', notes: [] }],
    customers: [{ id: 'c1', code: 'C-001', name: 'Sample Customer', contact: '', email: '', phone: '', address: '', paymentTerms: '', group: 'Retail', status: 'Active', sample: true }],
    suppliers: [{ id: 's1', code: 'S-001', name: 'SAFARI', contact: '', email: '', phone: '', terms: '' }],
    users: [{ id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'Admin', canOverride: true, active: true }],
    rules: [], documents: [], audit: [], approvals: [],
    rateVersions: [{ id: 'v1', name: 'Original catalog', effectiveDate: '2026-10-20', rates: { p1: 156 }, createdAt: '2026-10-20T00:00:00Z' }],
    settings: { companyName: 'Zahra Plast', address: '', phone: '', email: '', approvalRequired: false, overrideReasonRequired: false, allowSaveToMatrix: false, brandCategoryPriority: 'brand', invoicePrefix: 'INV', quotePrefix: 'QUO' },
  };
}
const ruleRow = { customerCode: 'C-001', scope: 'product', target: 'ZP-001', type: 'percentage', value: '10', effectiveFrom: '2026-11-01', effectiveTo: '', active: 'true' };

describe('spreadsheet validation', () => {
  it('reads quoted CSV values without losing commas or blank fields', async () => {
    const file = new File(['code,name,rate\r\nP-1,"Bottle, large",\r\n'], 'products.csv', { type: 'text/csv' });
    expect(await parseSpreadsheet(file)).toEqual([{ code: 'P-1', name: 'Bottle, large', rate: '' }]);
  });
  it('reads an actual Excel workbook with numeric cells and dates', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Rates');
    sheet.addRow(['productCode', 'rate', 'effectiveDate']);
    sheet.addRow(['ZP-001', 165, new Date('2026-12-01T00:00:00Z')]);
    const bytes = await workbook.xlsx.writeBuffer();
    const file = new File([bytes as BlobPart], 'rates.xlsx');
    expect(await parseSpreadsheet(file)).toEqual([{ productCode: 'ZP-001', rate: '165', effectiveDate: '2026-12-01' }]);
  }, 20000);
  it('maps customer/product codes to IDs while preserving source rows', () => {
    const [result] = validateImport('discounts', [ruleRow], fixture());
    expect(result.errors).toEqual([]);
    expect(result.row).toBe(2);
    expect(result.record).toMatchObject({ customerId: 'c1', targetId: 'p1', value: 10, active: true });
  });
  it('rejects unknown codes, duplicates, and invalid percentage/fixed prices', () => {
    const output = validateImport('discounts', [ruleRow, ruleRow, { ...ruleRow, customerCode: 'MISSING', target: 'UNKNOWN', value: '101' }, { ...ruleRow, effectiveFrom: '2026-11-02', type: 'fixed', value: '0' }], fixture());
    expect(output[1].errors.join()).toContain('Duplicate row');
    expect(output[2].errors.join()).toContain('Unknown customer');
    expect(output[2].errors.join()).toContain('Unknown product');
    expect(output[2].errors.join()).toContain('between 0 and 100');
    expect(output[3].errors.join()).toContain('greater than zero');
  });
  it('rejects active date overlaps but permits an exact-key update', () => {
    const state = fixture();
    const original = validateImport('discounts', [ruleRow], state)[0].record as DiscountRule;
    state.rules = [original];
    const [changed] = validateImport('discounts', [{ ...ruleRow, value: '15' }], state);
    expect(changed.errors).toEqual([]);
    expect((changed.record as DiscountRule).id).toBe(original.id);
    const [overlap] = validateImport('discounts', [{ ...ruleRow, effectiveFrom: '2026-12-01' }], state);
    expect(overlap.errors.join()).toContain('overlap');
  });
  it('rejects impossible calendar dates and invalid active flags', () => {
    const [result] = validateImport('discounts', [{ ...ruleRow, effectiveFrom: '2026-02-30', active: 'yes' }], fixture());
    expect(result.errors.join()).toContain('real date');
    expect(result.errors.join()).toContain('true or false');
  });
  it('keeps a missing product rate null and prevents active unpriced products', () => {
    const row = { code: 'NEW', name: 'New bottle', brand: 'SAFARI', category: 'School bottle', rate: '', packing: '1pc', packingCount: '1', cartonQuantity: '48', status: 'Inactive', effectiveDate: '2026-11-01' };
    const [inactive] = validateImport('products', [row], fixture());
    expect(inactive.errors).toEqual([]); expect(inactive.record).toMatchObject({ rate: null, costPrice: null });
    const [active] = validateImport('products', [{ ...row, status: 'Active' }], fixture());
    expect(active.errors.join()).toContain('active product needs a list rate');
  });
  it('requires one new rate-list date and rejects overwritten history', () => {
    const state = fixture();
    expect(validateImport('rates', [{ productCode: 'ZP-001', rate: 165, effectiveDate: '2026-10-20' }], state)[0].errors.join()).toContain('already exists');
    expect(validateImport('rates', [{ productCode: 'ZP-001', rate: 165, effectiveDate: '2026-10-01' }], state)[0].errors.join()).toContain('after 2026-10-20');
    const output = validateImport('rates', [{ productCode: 'ZP-001', rate: 165, effectiveDate: '2026-11-20' }], state);
    expect(output[0].errors).toEqual([]);
  });
  it('exports pricing rules with business codes for a lossless round trip', () => {
    const state = fixture(); state.rules = [validateImport('discounts', [ruleRow], state)[0].record as DiscountRule];
    const exported = exportRows('discounts', state);
    expect(exported[0]).toMatchObject({ customerCode: 'C-001', target: 'ZP-001', active: true });
    const [result] = validateImport('discounts', exported, state);
    expect(result.errors).toEqual([]);
    expect(result.record).toMatchObject({ id: state.rules[0].id, customerId: 'c1', targetId: 'p1', type: 'percentage', value: 10, effectiveFrom: '2026-11-01', active: true });
  });
  it('preserves sample provenance through customer exports and imports with an omitted flag', () => {
    const state = fixture();
    const exported = exportRows('customers', state);
    expect(validateImport('customers', exported, state)[0].record).toMatchObject({ sample: true });
    const { sample, ...withoutFlag } = exported[0];
    expect(validateImport('customers', [withoutFlag], state)[0].record).toMatchObject({ sample: true });
    expect(validateImport('customers', [{ ...withoutFlag, sample: 'false' }], state)[0].record).toMatchObject({ sample: false });
    expect(validateImport('customers', [{ ...withoutFlag, sample: 'no' }], state)[0].errors).toContain('sample must be true or false when supplied');
  });
  it('accepts an in-memory full-matrix backup above 20 MB with audit history', async () => {
    const state = fixture();
    const productTemplate = state.products[0]; const customerTemplate = state.customers[0];
    state.products = Array.from({ length: 317 }, (_, i) => ({ ...productTemplate, id: `p-${i}`, code: `ZP-${i}`, name: `Product ${i}` }));
    state.customers = Array.from({ length: 150 }, (_, i) => ({ ...customerTemplate, id: `c-${i}`, code: `C-${i}`, name: `Sample customer ${i}` }));
    state.rateVersions[0].rates = Object.fromEntries(state.products.map(p => [p.id, p.rate]));
    state.rules = Array.from({ length: 47550 }, (_, i) => ({ id: `full-matrix-${i}`, customerId: `c-${Math.floor(i / 317)}`, scope: 'product', targetId: `p-${i % 317}`, type: 'percentage', value: 10, effectiveFrom: '2026-10-20', effectiveTo: '', active: true, updatedAt: '2026-11-16T09:00:00.000Z', updatedBy: 'Demo Administrator' }));
    const snapshot = JSON.stringify(state.rules);
    state.audit = [{ id: 'matrix-import', date: '2026-11-16T09:00:00.000Z', user: 'Demo Administrator', action: 'Pricing updated', entity: 'Discount matrix', detail: 'Full matrix import', before: snapshot, after: snapshot }];
    const file = new File([JSON.stringify(state)], 'full-matrix-backup.json', { type: 'application/json' });
    expect(file.size).toBeGreaterThan(20 * 1024 * 1024);
    expect(file.size).toBeLessThan(MAX_BACKUP_BYTES);
    const restored = await parseWorkspaceBackup(file);
    expect(restored.rules).toHaveLength(47550);
    expect(restored.audit[0].after).toBe(snapshot);
    expect(() => validateBackup(restored)).not.toThrow();
  }, 20000);
});
