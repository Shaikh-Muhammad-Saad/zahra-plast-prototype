import type { AppState, DocumentLine, Price, Product, SalesDocument, User } from '../../types';
import { effectiveRate, resolvePrice } from '../../lib/pricing';
import { money, today, uid } from '../../lib/format';
import { validatePrice } from '../../lib/validation';

export const priceLabel = (price: Price) => price.type === 'percentage' ? `${price.value}% off` : `${money(price.value, 2)} ${price.type === 'amount' ? 'off' : 'net'}`;
export const statusTone = (status: SalesDocument['status']) => ({ Draft: 'amber', Posted: 'green', Converted: 'blue', Reversed: 'gray' } as const)[status];

export function newDocument(kind: 'Invoice' | 'Quote', user: User): SalesDocument {
  const timestamp = new Date().toISOString();
  return { id: uid('doc'), number: '', kind, status: 'Draft', customerId: '', customerName: '', date: today(), dueDate: '', lines: [], notes: '', createdBy: user.name, createdAt: timestamp, updatedAt: timestamp };
}

export function newLine(product: Product, customerId: string, date: string, state: AppState): DocumentLine {
  const rate = effectiveRate(product, date, state);
  if (rate === null || product.status !== 'Active') throw new Error('This product is not available for billing on the selected date.');
  const pricing = resolvePrice(product, customerId, date, state);
  return { id: uid('line'), productId: product.id, productCode: product.code, productName: product.name, brand: product.brand, category: product.category, packing: product.packing, cartonQuantity: product.cartonQuantity, quantity: 1, unit: 'pack', listRate: rate, originalPricing: { ...pricing }, appliedPricing: { ...pricing }, override: false, reason: '' };
}

export function validateOverride(type: Price['type'], raw: string, maxDiscount?: number): string | null {
  if (!raw.trim() || !Number.isFinite(Number(raw))) return 'Enter a valid numeric value.';
  return validatePrice({ type, value: Number(raw) }, maxDiscount)[0] ?? null;
}
