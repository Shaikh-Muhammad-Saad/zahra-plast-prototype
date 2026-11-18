import rawProducts from './products.json';
import rawCustomers from './customers.json';
import rawSuppliers from './suppliers.json';
import rawUsers from './users.json';
import categoryNames from './categories.json';
import type { AppState, Customer, DiscountRule, DocumentLine, Product, SalesDocument, Supplier, User } from '../src/types';
import { effectiveRate, resolvePrice } from '../src/lib/pricing';

const images = import.meta.glob('./images/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const products: Product[] = rawProducts.map(p => ({ ...p, status: p.status as Product['status'], image: p.image ? images[`./images/${p.image}`] : undefined }));
export const customers = rawCustomers as Customer[];
export const suppliers = rawSuppliers as Supplier[];
export const users = rawUsers as User[];
export const categories = categoryNames;
export const DATA_VERSION = 1;

export function createInitialState(): AppState {
  const state: AppState = {
    schemaVersion: DATA_VERSION, products: structuredClone(products), customers: structuredClone(customers),
    suppliers: structuredClone(suppliers), users: structuredClone(users), rules: [], documents: [], audit: [], approvals: [],
    currentUserId: 'u-admin',
    rateVersions: [{ id: 'rate-v1', name: 'October 2026 · Original catalog', effectiveDate: '2026-10-20', createdAt: '2026-10-20T09:00:00+05:00', rates: Object.fromEntries(products.map(p => [p.id, p.rate])) }],
    settings: { companyName: 'Zahra Plast', address: '', phone: '', email: '', approvalRequired: false, overrideReasonRequired: true, allowSaveToMatrix: false, brandCategoryPriority: 'brand', invoicePrefix: 'ZP-INV', quotePrefix: 'ZP-QT' },
  };
  const stamp = '2026-10-21T09:00:00+05:00';
  for (let i = 0; i < 40; i++) {
    const product = products[(i * 7) % 80];
    const discount: DiscountRule = { id: `sample-product-${i}`, customerId: customers[i].id, scope: 'product', targetId: product.id,
      type: 'percentage', value: 18,
      effectiveFrom: '2026-10-20', effectiveTo: '', active: true, updatedAt: stamp, updatedBy: 'Sample data' };
    state.rules.push(discount);
  }
  const activeProducts = products.filter(p => p.status === 'Active');
  for (let i = 0; i < 24; i++) {
    const day = 2 + Math.floor(i / 2);
    const date = `2026-11-${String(day).padStart(2, '0')}`;
    const customer = customers[i % 8];
    const lines: DocumentLine[] = Array.from({ length: 3 + i % 4 }, (_, j) => {
      const product = activeProducts[(i * 13 + j * 17) % activeProducts.length];
      const price = resolvePrice(product, customer.id, date, state);
      const override = (i % 4 === 0 && j === 0);
      return { id: `sample-line-${i}-${j}`, productId: product.id, productCode: product.code, productName: product.name, brand: product.brand,
        category: product.category, packing: product.packing, cartonQuantity: product.cartonQuantity, quantity: 6 + (i + j) % 24, unit: 'pack',
        listRate: effectiveRate(product, date, state)!, originalPricing: { ...price }, appliedPricing: override ? { type: 'percentage', value: 20, sourceLabel: 'Manual override' } : { ...price }, override, reason: override ? 'Sample: customer goodwill adjustment' : '',
        ...(override ? { overrideBy: i % 2 ? 'Demo Billing User' : 'Demo Administrator', overrideAt: `${date}T10:00:00+05:00` } : {}) };
    });
    const quote = i >= 20;
    const document: SalesDocument = { id: `sample-doc-${i}`, number: `${quote ? 'ZP-QT' : 'ZP-INV'}-${String(quote ? i - 19 : i + 1).padStart(4, '0')}`,
      kind: quote ? 'Quote' : 'Invoice', status: quote || i >= 16 ? 'Draft' : 'Posted', customerId: customer.id, customerName: customer.name,
      date, dueDate: '2026-11-30', lines, notes: 'Demonstration document. Not a real customer transaction.',
      createdBy: i % 2 ? 'Demo Billing User' : 'Demo Administrator', createdAt: `${date}T10:00:00+05:00`, updatedAt: `${date}T10:15:00+05:00`,
      ...(i < 16 ? { postedAt: `${date}T10:15:00+05:00` } : {}) };
    state.documents.push(document);
  }
  state.audit = [
    { id: 'seed-audit-1', date: '2026-11-16T09:30:00+05:00', user: 'Sample data', action: 'Workspace prepared', entity: 'Workspace', detail: '317 source products, 8 brands, 150 sample customers. Product discounts and documents are demonstration data.' },
    { id: 'seed-audit-2', date: '2026-11-16T09:20:00+05:00', user: 'Sample data', action: 'Catalog imported', entity: 'Products', detail: 'All 317 catalog rows retained. 13 products inactive pending source confirmation; 309 numeric list rates preserved.' },
    { id: 'seed-audit-3', date: '2026-11-16T09:10:00+05:00', user: 'Sample data', action: 'Discounts loaded', entity: 'Discount matrix', detail: '40 sample product discounts illustrate prices set separately for each customer and product.' },
  ];
  return state;
}
