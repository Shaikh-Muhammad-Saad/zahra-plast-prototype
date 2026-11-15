import type { AppState, DiscountRule, Price, Product } from '../types';

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validatePrice(price: Price): string[] {
  if (!price || !['percentage', 'fixed'].includes(price.type)) return ['Choose a valid pricing type.'];
  if (!Number.isFinite(price.value)) return ['Enter a finite numeric price or discount.'];
  if (price.type === 'percentage' && (price.value < 0 || price.value > 100)) return ['Percentage must be between 0 and 100.'];
  if (price.type === 'fixed' && price.value <= 0) return ['Fixed net price must be greater than zero.'];
  return [];
}
export function validateProduct(product: Product): string[] {
  const errors: string[] = [];
  if (!product.code.trim() || !product.name.trim() || !product.brand.trim() || !product.category.trim()) errors.push('Code, name, brand and category are required.');
  if (!['Active', 'Inactive', 'Coming Soon'].includes(product.status)) errors.push('Invalid product status.');
  if (product.rate !== null && (!Number.isFinite(product.rate) || product.rate <= 0)) errors.push('List rate must be positive or left unavailable.');
  if (product.status === 'Active' && product.rate === null) errors.push('An active product needs a valid list rate.');
  if (product.cartonQuantity !== null && (!Number.isInteger(product.cartonQuantity) || product.cartonQuantity <= 0)) errors.push('Carton quantity must be a positive whole number.');
  if (!validDate(product.effectiveDate)) errors.push('A valid rate effective date is required.');
  if (product.costPrice !== null && (!Number.isFinite(product.costPrice) || product.costPrice < 0)) errors.push('Cost must be positive or unavailable.');
  return errors;
}
export function validateRules(incoming: DiscountRule[], state: AppState): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const customerIds = new Set(state.customers.map(c => c.id));
  const productIds = new Set(state.products.map(p => p.id));
  const brands = new Set(state.suppliers.map(s => s.name));
  const categories = new Set(state.products.map(p => p.category));
  for (const [index, rule] of incoming.entries()) {
    const prefix = `Row ${index + 1}: `;
    if (!rule.id || ids.has(rule.id)) errors.push(prefix + 'Duplicate or missing rule ID.');
    ids.add(rule.id);
    if (!customerIds.has(rule.customerId)) errors.push(prefix + 'Unknown customer.');
    if (!['product', 'brand', 'category', 'customer'].includes(rule.scope)) errors.push(prefix + 'Unknown rule scope.');
    if (rule.scope === 'product' && !productIds.has(rule.targetId)) errors.push(prefix + 'Unknown product.');
    if (rule.scope === 'brand' && !brands.has(rule.targetId)) errors.push(prefix + 'Unknown brand.');
    if (rule.scope === 'category' && !categories.has(rule.targetId)) errors.push(prefix + 'Unknown category.');
    if (!validDate(rule.effectiveFrom) || (rule.effectiveTo && !validDate(rule.effectiveTo))) errors.push(prefix + 'Use valid effective dates.');
    if (rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) errors.push(prefix + 'End date cannot be before start date.');
    errors.push(...validatePrice(rule).map(e => prefix + e));
  }
  const combined = [...state.rules.filter(r => !ids.has(r.id)), ...incoming];
  const groups = new Map<string, DiscountRule[]>();
  for (const rule of combined) {
    if (!rule.active) continue;
    const key = JSON.stringify([rule.customerId, rule.scope, rule.scope === 'customer' ? '' : rule.targetId]);
    const group = groups.get(key); if (group) group.push(rule); else groups.set(key, [rule]);
  }
  const names = new Map(state.customers.map(c => [c.id, c.name]));
  for (const group of groups.values()) {
    group.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    let lastEnd = '';
    for (const rule of group) {
      if (rule.effectiveFrom <= lastEnd) errors.push(`Overlapping dates for ${rule.scope} pricing of ${names.get(rule.customerId) ?? rule.customerId}.`);
      const end = rule.effectiveTo || '9999-12-31'; if (end > lastEnd) lastEnd = end;
    }
  }
  return [...new Set(errors)];
}
export function assertValid(errors: string[]) {
  if (errors.length) throw new Error(errors.join(' '));
}
