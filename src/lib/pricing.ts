import type { AppState, DiscountRule, DocumentLine, Price, Product, SalesDocument } from '../types';

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
type CustomerRules = Map<string, Map<string, DiscountRule[]>>;
const ruleIndexes = new WeakMap<DiscountRule[], { length: number; index: CustomerRules }>();
function indexedRules(rules: DiscountRule[]): CustomerRules {
  const cached = ruleIndexes.get(rules);
  if (cached && cached.length === rules.length) return cached.index;
  const index: CustomerRules = new Map();
  for (const rule of rules) {
    let customer = index.get(rule.customerId);
    if (!customer) { customer = new Map(); index.set(rule.customerId, customer); }
    const key = JSON.stringify([rule.scope, rule.scope === 'customer' ? '' : rule.targetId]);
    const group = customer.get(key); if (group) group.push(rule); else customer.set(key, [rule]);
  }
  ruleIndexes.set(rules, { length: rules.length, index });
  return index;
}

/** Rate versions are immutable. Only dates effective at the document date participate. */
export function effectiveRate(product: Product, date: string, state: AppState): number | null {
  const applicable = state.rateVersions.filter(v => v.effectiveDate <= date && Object.prototype.hasOwnProperty.call(v.rates, product.id))
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  if (applicable.length) return applicable[0].rates[product.id];
  return product.effectiveDate <= date ? product.rate : null;
}

export function resolvePrice(product: Product, customerId: string, date: string, state: AppState): Price {
  const priority = state.settings.brandCategoryPriority;
  const rank = { product: 0, brand: priority === 'brand' ? 1 : 2, category: priority === 'category' ? 1 : 2, customer: 3 };
  const customer = indexedRules(state.rules).get(customerId);
  const candidates = [['product', product.id], ['brand', product.brand], ['category', product.category], ['customer', '']]
    .flatMap(key => customer?.get(JSON.stringify(key)) ?? []);
  const rule = candidates.filter(r => r.active && r.effectiveFrom <= date && (!r.effectiveTo || r.effectiveTo >= date))
    .sort((a, b) => rank[a.scope] - rank[b.scope] || b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (!rule) return { type: 'percentage', value: 0, sourceLabel: 'List rate' };
  const labels = { product: 'Customer + product', brand: 'Customer + brand', category: 'Customer + category', customer: 'Customer default' };
  return { type: rule.type, value: rule.value, sourceLabel: labels[rule.scope], ruleId: rule.id };
}

export function unitNet(rate: number, price: Price): number {
  return roundMoney(price.type === 'fixed' ? price.value : rate * (1 - price.value / 100));
}
export function sellingQuantity(line: DocumentLine): number {
  return line.quantity * (line.unit === 'carton' ? (line.cartonQuantity ?? 0) : 1);
}
export const lineTotal = (line: DocumentLine) => roundMoney(unitNet(line.listRate, line.appliedPricing) * sellingQuantity(line));
export const documentTotal = (doc: Pick<SalesDocument, 'lines'>) => roundMoney(doc.lines.reduce((total, line) => total + lineTotal(line), 0));
export const discountAmount = (line: DocumentLine) => roundMoney((line.listRate - unitNet(line.listRate, line.appliedPricing)) * sellingQuantity(line));
export const overrideImpact = (line: DocumentLine) => roundMoney((unitNet(line.listRate, line.originalPricing) - unitNet(line.listRate, line.appliedPricing)) * sellingQuantity(line));
