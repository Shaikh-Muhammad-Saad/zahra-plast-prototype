import Papa from 'papaparse';
import type { AppState, Customer, DiscountRule, Product, Supplier } from '../types';
import { downloadText, today, uid } from './format';
import { effectiveRate } from './pricing';

export type SheetRow = Record<string, string | number | boolean | null | undefined>;
export type TransferKind = 'products' | 'customers' | 'suppliers' | 'discounts' | 'rates';
export type ImportedRecord = Product | Customer | Supplier | DiscountRule | { productId: string; rate: number | null; effectiveDate: string };
export interface ImportResult { row: number; data: SheetRow; errors: string[]; record?: ImportedRecord; }
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

export const sheetColumns: Record<TransferKind, string[]> = {
  products: ['code', 'name', 'brand', 'category', 'rate', 'packing', 'packingCount', 'cartonQuantity', 'status', 'effectiveDate'],
  customers: ['code', 'name', 'contact', 'email', 'phone', 'address', 'paymentTerms', 'group', 'status', 'sample'],
  suppliers: ['code', 'name', 'contact', 'email', 'phone', 'terms'],
  discounts: ['customerCode', 'scope', 'target', 'type', 'value', 'effectiveFrom', 'effectiveTo', 'active'],
  rates: ['productCode', 'rate', 'effectiveDate'],
};

const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const numeric = (value: unknown) => text(value) === '' || text(value).toLowerCase() === 'n/a' ? null : Number(value);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const overlaps = (a: DiscountRule, b: DiscountRule) => a.active && b.active && a.customerId === b.customerId && a.scope === b.scope && a.targetId === b.targetId && a.effectiveFrom <= (b.effectiveTo || '9999-12-31') && b.effectiveFrom <= (a.effectiveTo || '9999-12-31');

/** Large workspace backups include pricing and audit snapshots, unlike sheet imports. */
export async function parseWorkspaceBackup(file: File): Promise<AppState> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Choose a workspace backup of 100 MB or less.');
  const candidate = JSON.parse(await file.text());
  const collections = ['products', 'customers', 'suppliers', 'users', 'rules', 'documents', 'audit', 'rateVersions', 'approvals'];
  if (!candidate || !collections.every(key => Array.isArray(candidate[key])) || !candidate.settings || !candidate.schemaVersion) throw new Error('This is not a Zahra Plast workspace backup.');
  return candidate as AppState;
}

/** Parse the first worksheet. File contents remain in the browser. */
export async function parseSpreadsheet(file: File): Promise<SheetRow[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.');
  if (file.name.toLowerCase().endsWith('.csv')) {
    const result = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.replace(/^\uFEFF/, '').trim() });
    if (result.errors.length) throw new Error(`CSV row ${(result.errors[0].row ?? 0) + 2}: ${result.errors[0].message}`);
    if (result.meta.renamedHeaders && Object.keys(result.meta.renamedHeaders).length) throw new Error('Column headers must be unique.');
    return result.data;
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Use an .xlsx workbook or a UTF-8 .csv file.');
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('The workbook does not have a worksheet.');
  const cellText = (value: unknown): string => {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (value && typeof value === 'object') {
      const object = value as { result?: unknown; richText?: { text: string }[]; text?: string };
      if ('result' in object) return cellText(object.result);
      if (object.richText) return object.richText.map(part => part.text).join('');
      if (object.text) return object.text;
      return '';
    }
    return text(value);
  };
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, index) => { headers[index - 1] = cellText(cell.value); });
  if (!headers.length || headers.some(h => !h)) throw new Error('Every column needs a header in row 1.');
  if (new Set(headers).size !== headers.length) throw new Error('Column headers must be unique.');
  const rows: SheetRow[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const data = Object.fromEntries(headers.map((header, i) => [header, cellText(row.getCell(i + 1).value)]));
    if (Object.values(data).some(Boolean)) rows.push(data);
  });
  return rows;
}

export async function exportSpreadsheet(filename: string, rows: SheetRow[], format: 'csv' | 'xlsx', columns?: string[]) {
  const headers = columns ?? Object.keys(rows[0] ?? {});
  if (!headers.length) throw new Error('There are no columns to export.');
  if (format === 'csv') {
    const safeRows = rows.map(row => Object.fromEntries(headers.map(key => {
      const value = row[key] ?? '';
      return [key, typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value];
    })));
    downloadText(`${filename}.csv`, '\uFEFF' + Papa.unparse({ fields: headers, data: safeRows.map(row => headers.map(h => row[h])) }), 'text/csv;charset=utf-8');
    return;
  }
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Zahra Plast';
  const sheet = workbook.addWorksheet('Zahra Plast', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = headers.map(header => ({ header, key: header, width: Math.min(38, Math.max(18, header.length + 4)) }));
  rows.forEach(row => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B54' } };
  sheet.getRow(1).height = 26;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = `${filename}.xlsx`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportRows(kind: TransferKind, state: AppState): SheetRow[] {
  if (kind === 'products') return state.products.map(p => ({ code: p.code, name: p.name, brand: p.brand, category: p.category, rate: p.rate, packing: p.packing, packingCount: p.packingCount, cartonQuantity: p.cartonQuantity, status: p.status, effectiveDate: p.effectiveDate }));
  if (kind === 'customers') return state.customers.map(c => ({ code: c.code, name: c.name, contact: c.contact, email: c.email, phone: c.phone, address: c.address, paymentTerms: c.paymentTerms, group: c.group, status: c.status, sample: c.sample }));
  if (kind === 'suppliers') return state.suppliers.map(s => ({ code: s.code, name: s.name, contact: s.contact, email: s.email, phone: s.phone, terms: s.terms }));
  if (kind === 'rates') return state.products.map(p => ({ productCode: p.code, rate: effectiveRate(p, today(), state), effectiveDate: today() }));
  return state.rules.map(rule => ({ customerCode: state.customers.find(c => c.id === rule.customerId)?.code ?? rule.customerId, scope: rule.scope, target: rule.scope === 'product' ? state.products.find(p => p.id === rule.targetId)?.code ?? rule.targetId : rule.targetId, type: rule.type, value: rule.value, effectiveFrom: rule.effectiveFrom, effectiveTo: rule.effectiveTo, active: rule.active }));
}

/** Validate all rows before applying any change; preserve invalid row diagnostics. */
export function validateImport(kind: TransferKind, rows: SheetRow[], state: AppState): ImportResult[] {
  const seen = new Set<string>();
  const ruleKey = (rule: Pick<DiscountRule, 'customerId' | 'scope' | 'targetId'>) => `${rule.customerId}|${rule.scope}|${rule.targetId}`;
  const acceptedRules = new Map<string, DiscountRule[]>();
  const existingRules = new Map<string, DiscountRule[]>();
  for (const rule of state.rules) { const key = ruleKey(rule); existingRules.set(key, [...(existingRules.get(key) ?? []), rule]); }
  const now = new Date().toISOString();
  const output = rows.map((data, index): ImportResult => {
    const errors: string[] = [];
    const required = (key: string) => { const value = text(data[key]); if (!value) errors.push(`${key} is required`); return value; };
    const record = { row: index + 2, data, errors } as ImportResult;
    const duplicate = (key: string) => { if (seen.has(key)) errors.push('Duplicate row in this file'); seen.add(key); };
    if (kind === 'discounts') {
      const customerCode = required('customerCode');
      const customer = state.customers.find(c => c.code.toLowerCase() === customerCode.toLowerCase());
      if (!customer) errors.push(`Unknown customer code: ${customerCode}`);
      const scope = required('scope') as DiscountRule['scope'];
      if (!['product', 'brand', 'category', 'customer'].includes(scope)) errors.push('scope must be product, brand, category, or customer');
      let targetId = text(data.target);
      if (scope === 'product') { const product = state.products.find(p => p.code.toLowerCase() === targetId.toLowerCase()); if (!product) errors.push(`Unknown product code: ${targetId}`); targetId = product?.id ?? targetId; }
      if (scope === 'brand' && !state.suppliers.some(s => s.name === targetId)) errors.push(`Unknown brand: ${targetId}`);
      if (scope === 'category' && !state.products.some(p => p.category === targetId)) errors.push(`Unknown category: ${targetId}`);
      if (scope === 'customer') { if (targetId) errors.push('Customer-wide rules must have an empty target'); targetId = ''; }
      const type = required('type') as DiscountRule['type'];
      const value = numeric(data.value);
      if (!['percentage', 'fixed'].includes(type)) errors.push('type must be percentage or fixed');
      if (value === null || !Number.isFinite(value)) errors.push('value must be a number');
      else if (type === 'percentage' && (value < 0 || value > 100)) errors.push('Percentage must be between 0 and 100');
      else if (type === 'fixed' && value <= 0) errors.push('Fixed net price must be greater than zero');
      const effectiveFrom = required('effectiveFrom'); const effectiveTo = text(data.effectiveTo);
      if (!validDate(effectiveFrom)) errors.push('effectiveFrom must be a real date in YYYY-MM-DD format');
      if (effectiveTo && (!validDate(effectiveTo) || effectiveTo < effectiveFrom)) errors.push('effectiveTo must be a valid date on or after effectiveFrom');
      const activeText = text(data.active).toLowerCase();
      if (activeText && !['true', 'false'].includes(activeText)) errors.push('active must be true or false');
      duplicate(`${customerCode.toLowerCase()}|${scope}|${targetId}|${effectiveFrom}`);
      const key = ruleKey({ customerId: customer?.id ?? '', scope, targetId });
      const existing = existingRules.get(key)?.find(r => r.effectiveFrom === effectiveFrom);
      const rule: DiscountRule = { id: existing?.id ?? uid('rule'), customerId: customer?.id ?? '', scope, targetId, type, value: value ?? 0, effectiveFrom, effectiveTo, active: activeText !== 'false', updatedAt: now, updatedBy: state.currentUserId };
      if ([...(existingRules.get(key) ?? []).filter(r => r.id !== rule.id), ...(acceptedRules.get(key) ?? [])].some(r => overlaps(rule, r))) errors.push('Effective dates overlap another active rule for this customer and target');
      if (!errors.length) acceptedRules.set(key, [...(acceptedRules.get(key) ?? []), rule]);
      record.record = rule;
    } else if (kind === 'products') {
      const code = required('code'); const name = required('name'); const brand = required('brand'); const category = required('category');
      duplicate(code.toLowerCase());
      const existing = state.products.find(p => p.code.toLowerCase() === code.toLowerCase());
      const rate = numeric(data.rate); const packingCount = numeric(data.packingCount); const cartonQuantity = numeric(data.cartonQuantity);
      if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) errors.push('rate must be positive or blank');
      if (existing && existing.rate !== rate) errors.push('Use a new rate-list import to change an existing product price');
      if (packingCount !== null && (!Number.isInteger(packingCount) || packingCount <= 0)) errors.push('packingCount must be a positive whole number or blank');
      if (cartonQuantity !== null && (!Number.isInteger(cartonQuantity) || cartonQuantity <= 0)) errors.push('cartonQuantity must be a positive whole number or blank');
      if (!state.suppliers.some(s => s.name === brand)) errors.push(`Unknown brand: ${brand}. Import the supplier first.`);
      const status = required('status') as Product['status'];
      if (!['Active', 'Inactive', 'Coming Soon'].includes(status)) errors.push('status must be Active, Inactive, or Coming Soon');
      if (status === 'Active' && rate === null) errors.push('An active product needs a list rate');
      const effectiveDate = required('effectiveDate'); if (!validDate(effectiveDate)) errors.push('effectiveDate must be YYYY-MM-DD');
      record.record = { ...existing, id: existing?.id ?? uid('product'), code, name, brand, category, rate, packing: required('packing'), packingCount, cartonQuantity, status, effectiveDate, costPrice: existing?.costPrice ?? null, notes: existing?.notes ?? [] };
    } else if (kind === 'customers') {
      const code = required('code'); const name = required('name'); duplicate(code.toLowerCase());
      const existing = state.customers.find(c => c.code.toLowerCase() === code.toLowerCase());
      const status = (text(data.status) || 'Active') as Customer['status']; if (!['Active', 'Inactive'].includes(status)) errors.push('status must be Active or Inactive');
      const sampleText = text(data.sample).toLowerCase();
      if (sampleText && !['true', 'false'].includes(sampleText)) errors.push('sample must be true or false when supplied');
      record.record = { id: existing?.id ?? uid('customer'), code, name, contact: text(data.contact), email: text(data.email), phone: text(data.phone), address: text(data.address), paymentTerms: text(data.paymentTerms), group: text(data.group), status, sample: sampleText ? sampleText === 'true' : existing?.sample ?? false };
    } else if (kind === 'suppliers') {
      const code = required('code'); const name = required('name'); duplicate(code.toLowerCase());
      const existing = state.suppliers.find(s => s.code.toLowerCase() === code.toLowerCase());
      if (state.suppliers.some(s => s.name.toLowerCase() === name.toLowerCase() && s.id !== existing?.id)) errors.push('Supplier name already belongs to another code');
      if (existing && existing.name !== name && state.products.some(p => p.brand === existing.name)) errors.push('A brand used by products cannot be renamed; update contact details instead');
      record.record = { id: existing?.id ?? uid('supplier'), code, name, contact: text(data.contact), email: text(data.email), phone: text(data.phone), terms: text(data.terms) };
    } else {
      const code = required('productCode'); duplicate(code.toLowerCase());
      const product = state.products.find(p => p.code.toLowerCase() === code.toLowerCase()); if (!product) errors.push(`Unknown product code: ${code}`);
      const rate = numeric(data.rate); if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) errors.push('rate must be positive or blank');
      const effectiveDate = required('effectiveDate'); if (!validDate(effectiveDate)) errors.push('effectiveDate must be YYYY-MM-DD');
      if (state.rateVersions.some(v => v.effectiveDate === effectiveDate)) errors.push('A rate version already exists for this effective date');
      const latestDate = [...state.rateVersions].map(v => v.effectiveDate).sort().at(-1);
      if (latestDate && effectiveDate < latestDate) errors.push(`New rate lists must take effect after ${latestDate}`);
      record.record = { productId: product?.id ?? '', rate, effectiveDate };
    }
    return record;
  });
  if (kind === 'rates') {
    const dates = new Set(output.filter(r => !r.errors.length).map(r => text(r.data.effectiveDate)));
    if (dates.size > 1) output.forEach(r => r.errors.push('A rate-list import must use one effective date for all rows'));
  }
  return output;
}
