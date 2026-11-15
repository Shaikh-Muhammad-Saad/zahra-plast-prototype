export type Role = 'Admin' | 'Pricing Manager' | 'Sales / Billing' | 'Finance';
export type Permission = 'masters' | 'pricing' | 'billing' | 'override' | 'settings' | 'approve';
export type ProductStatus = 'Active' | 'Coming Soon' | 'Inactive';
export interface Product {
  id: string; code: string; sourceSerial?: number; sourcePage?: number;
  name: string; brand: string; category: string; rate: number | null;
  packing: string; packingCount: number | null; cartonQuantity: number | null;
  status: ProductStatus; image?: string; costPrice: number | null;
  effectiveDate: string; notes: string[];
}
export interface Customer {
  id: string; code: string; name: string; contact: string; email: string; phone: string;
  address: string; paymentTerms: string; group: string; status: 'Active' | 'Inactive'; sample: boolean;
}
export interface Supplier {
  id: string; code: string; name: string; contact: string; email: string;
  phone: string; terms: string;
}
export interface User { id: string; name: string; email: string; role: Role; canOverride: boolean; active: boolean; }
export type PriceType = 'percentage' | 'fixed';
export interface Price { type: PriceType; value: number; sourceLabel?: string; ruleId?: string; }
export interface DiscountRule {
  id: string; customerId: string; scope: 'product' | 'brand' | 'category' | 'customer';
  targetId: string; type: PriceType; value: number; effectiveFrom: string;
  effectiveTo: string; active: boolean; updatedAt: string; updatedBy: string;
}
export interface DocumentLine {
  id: string; productId: string; productCode: string; productName: string;
  brand: string; category: string; packing: string; cartonQuantity: number | null;
  quantity: number; unit: 'pack' | 'carton'; listRate: number;
  originalPricing: Price; appliedPricing: Price; override: boolean; reason: string;
  overrideBy?: string; overrideAt?: string;
}
export interface SalesDocument {
  id: string; number: string; kind: 'Invoice' | 'Quote' | 'Credit Note';
  status: 'Draft' | 'Posted' | 'Converted' | 'Reversed';
  customerId: string; customerName: string; date: string; dueDate: string;
  lines: DocumentLine[]; notes: string; createdBy: string; createdAt: string;
  updatedAt: string; postedAt?: string; sourceDocumentId?: string;
}
export interface AuditEntry {
  id: string; date: string; user: string; action: string; entity: string;
  detail: string; before?: string; after?: string;
}
export interface RateVersion {
  id: string; name: string; effectiveDate: string; rates: Record<string, number | null>; createdAt: string;
}
export interface Approval {
  id: string; requestedBy: string; requestedAt: string; reason: string;
  rules: DiscountRule[]; status: 'Pending' | 'Approved' | 'Rejected'; reviewedBy?: string;
}
export interface Settings {
  companyName: string; address: string; phone: string; email: string;
  approvalRequired: boolean; overrideReasonRequired: boolean; allowSaveToMatrix: boolean;
  brandCategoryPriority: 'brand' | 'category'; invoicePrefix: string; quotePrefix: string;
}
export interface AppState {
  schemaVersion: number; products: Product[]; customers: Customer[]; suppliers: Supplier[];
  users: User[]; rules: DiscountRule[]; documents: SalesDocument[]; audit: AuditEntry[];
  rateVersions: RateVersion[]; approvals: Approval[]; settings: Settings; currentUserId: string;
}
