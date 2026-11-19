import type { AppState, AuditEntry, Customer, DiscountRule, DocumentLine, Permission, Price, Product, RateVersion, SalesDocument, Settings, Supplier, User } from '../types';
import { effectiveRate, resolvePrice, sellingQuantity } from '../lib/pricing';
import { assertValid, validDate, validatePrice, validateProduct, validateRules } from '../lib/validation';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function hasPermission(user: User, permission: Permission): boolean {
  if (!user.active) return false;
  if (permission === 'override') return user.canOverride && user.role !== 'Finance';
  if (user.role === 'Admin') return true;
  if (permission === 'pricing' || permission === 'approve' || permission === 'masters') return user.role === 'Pricing Manager';
  if (permission === 'billing') return user.role === 'Sales / Billing';
  return false;
}
const samePrice = (a: Price, b: Price) => a.type === b.type && a.value === b.value;
const upsert = <T extends { id: string }>(items: T[], value: T) => items.some(x => x.id === value.id) ? items.map(x => x.id === value.id ? value : x) : [...items, value];
const mergeBatch = <T extends { id: string }>(items: T[], values: T[]) => {
  const merged = new Map(items.map(value => [value.id, value]));
  for (const value of values) merged.set(value.id, value);
  return [...merged.values()];
};

/** Materialize a scheduled version only once its effective calendar date arrives. */
export function refreshEffectiveRates(state: AppState, asOf = localDate()): AppState {
  let changed = false;
  const products = state.products.map(product => {
    const version = state.rateVersions.filter(v => v.effectiveDate <= asOf && Object.prototype.hasOwnProperty.call(v.rates, product.id))
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
    if (!version) return product;
    const rate = version.rates[product.id];
    const status = rate === null ? 'Inactive' : product.status;
    if (product.rate === rate && product.effectiveDate === version.effectiveDate && product.status === status) return product;
    changed = true; return { ...product, rate, effectiveDate: version.effectiveDate, status } as Product;
  });
  return changed ? { ...state, products } : state;
}

function nextNumber(state: AppState, kind: SalesDocument['kind']) {
  const prefix = kind === 'Invoice' ? state.settings.invoicePrefix : kind === 'Quote' ? state.settings.quotePrefix : 'ZP-CN';
  const numbers = state.documents.map(d => d.number.startsWith(prefix + '-') ? Number(d.number.slice(prefix.length + 1)) : 0).filter(Number.isFinite);
  return `${prefix}-${String(Math.max(0, ...numbers) + 1).padStart(4, '0')}`;
}
function log(state: AppState, user: User, action: string, entity: string, detail: string, before?: unknown, after?: unknown) {
  const audit: AuditEntry = { id: id('audit'), date: now(), user: user.name, action, entity, detail,
    ...(before === undefined ? {} : { before: JSON.stringify(before) }), ...(after === undefined ? {} : { after: JSON.stringify(after) }) };
  state.audit.unshift(audit);
}
function requireText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
}

/** All writes pass through this boundary, even though this prototype has no server. */
export function createOperations(getState: () => AppState, setState: (state: AppState) => void, initialState: () => AppState) {
  function change<T>(permission: Permission | null, run: (state: AppState, user: User) => T): T {
    const current = getState();
    const user = current.users.find(u => u.id === current.currentUserId);
    if (!user) throw new Error('Select an active workspace user.');
    if (permission && !hasPermission(user, permission)) throw new Error(`Your ${user.role} role does not have permission for this action.`);
    const next = structuredClone(refreshEffectiveRates(current));
    const result = run(next, user);
    setState(next);
    return result === undefined ? result : structuredClone(result);
  }
  function validateDocument(doc: SalesDocument, state: AppState, user: User, previous?: SalesDocument) {
    const customer = state.customers.find(c => c.id === doc.customerId);
    if (!customer) throw new Error('Choose a known customer.');
    if (customer.status !== 'Active' && doc.kind !== 'Credit Note') throw new Error('This customer is inactive.');
    if (!validDate(doc.date) || (doc.dueDate && !validDate(doc.dueDate))) throw new Error('Use valid document and due dates.');
    if (doc.dueDate && doc.dueDate < doc.date) throw new Error('Due date cannot precede document date.');
    if (!doc.lines.length) throw new Error('Add at least one product.');
    if (new Set(doc.lines.map(l => l.id)).size !== doc.lines.length) throw new Error('Duplicate invoice line identifiers.');
    const original = doc.kind === 'Credit Note' ? state.documents.find(d => d.id === doc.sourceDocumentId && d.kind === 'Invoice' && d.status === 'Posted') : undefined;
    if (doc.kind === 'Credit Note' && !original) throw new Error('A credit note must refer to a posted original invoice.');
    if (original && original.customerId !== doc.customerId) throw new Error('Credit notes must retain the original customer.');
    for (const line of doc.lines) {
      const product = state.products.find(p => p.id === line.productId);
      if (!product) throw new Error(`Unknown product ${line.productCode}.`);
      if (!original && product.status !== 'Active') throw new Error(`${product.name} is inactive or coming soon and cannot be billed.`);
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error(`Enter a positive whole quantity for ${product.name}.`);
      if (!['pack', 'carton'].includes(line.unit)) throw new Error('Choose packs or cartons.');
      if (line.unit === 'carton' && (!line.cartonQuantity || !Number.isInteger(line.cartonQuantity))) throw new Error(`${product.name} has no valid carton quantity.`);
      if (!Number.isFinite(line.listRate) || line.listRate <= 0) throw new Error(`${product.name} has no valid list rate.`);
      assertValid(validatePrice(line.originalPricing, line.listRate)); assertValid(validatePrice(line.appliedPricing, line.listRate));
      const oldLine = previous?.lines.find(l => l.id === line.id && l.productId === line.productId);
      if (original) {
        const source = original.lines.find(l => l.id === line.id && l.productId === line.productId);
        if (!source || line.listRate !== source.listRate || !samePrice(line.originalPricing, source.originalPricing) || !samePrice(line.appliedPricing, source.appliedPricing)
          || line.override !== source.override || line.cartonQuantity !== source.cartonQuantity) throw new Error('Returns must use the original invoice rate, packing and discounts.');
      } else {
        const effective = effectiveRate(product, doc.date, state);
        const quote = doc.sourceDocumentId ? state.documents.find(d => d.id === doc.sourceDocumentId && d.kind === 'Quote') : undefined;
        const quotedLine = quote?.lines.find(l => l.id === line.id);
        const preserved = oldLine && previous?.customerId === doc.customerId ? oldLine : quotedLine;
        if (line.listRate !== (preserved?.listRate ?? effective)) throw new Error(`Use the effective list rate for ${product.name}.`);
        const resolved = resolvePrice(product, doc.customerId, doc.date, state);
        if (!samePrice(line.originalPricing, resolved) && !(preserved && samePrice(line.originalPricing, preserved.originalPricing))) throw new Error(`Original matrix pricing for ${product.name} must come from the saved product discount.`);
        if (line.cartonQuantity !== (preserved?.cartonQuantity ?? product.cartonQuantity)) throw new Error('Carton quantities must come from the product master.');
        const changedApplied = !preserved || !samePrice(preserved.appliedPricing, line.appliedPricing) || preserved.override !== line.override || preserved.reason !== line.reason;
        if (line.override && changedApplied && !hasPermission(user, 'override')) throw new Error('Discount override permission is required.');
        if (!line.override && !samePrice(line.appliedPricing, line.originalPricing)) throw new Error('Changed discounts must be marked as a manual override.');
        if (line.override && state.settings.overrideReasonRequired && !line.reason.trim()) throw new Error(`Enter an override reason for ${product.name}.`);
      }
    }
    if (original) {
      const previousCredits = state.documents.filter(d => d.kind === 'Credit Note' && d.sourceDocumentId === original.id && d.status === 'Posted' && d.id !== doc.id);
      for (const sourceLineId of new Set(doc.lines.map(l => l.id))) {
        const allowed = original.lines.filter(l => l.id === sourceLineId).reduce((s, l) => s + sellingQuantity(l), 0);
        const already = previousCredits.flatMap(d => d.lines).filter(l => l.id === sourceLineId).reduce((s, l) => s + sellingQuantity(l), 0);
        const requested = doc.lines.filter(l => l.id === sourceLineId).reduce((s, l) => s + sellingQuantity(l), 0);
        if (requested > allowed - already) throw new Error('Credit quantity exceeds the unreturned quantity on the original invoice.');
      }
    }
  }
  const actions = {
    saveProduct(product: Product) {
      return change('masters', (state, user) => {
        assertValid(validateProduct(product));
        if (!state.suppliers.some(s => s.name === product.brand)) throw new Error('Choose a known brand or create the supplier first.');
        if (state.products.some(p => p.id !== product.id && p.code.toLowerCase() === product.code.toLowerCase())) throw new Error('Product code already exists.');
        const before = state.products.find(p => p.id === product.id);
        if (before && before.rate !== product.rate) throw new Error('Publish a new rate list to change prices and preserve rate history.');
        if (before && before.category !== product.category && !state.products.some(p => p.id !== product.id && p.category === before.category)
          && state.rules.some(r => r.scope === 'category' && r.targetId === before.category)) throw new Error('This category is used by pricing rules. Retain a product in the category or update those rules first.');
        state.products = upsert(state.products, structuredClone(product));
        log(state, user, before ? 'Product updated' : 'Product created', product.code, product.name, before, product);
      });
    },
    saveCustomer(customer: Customer) {
      return change('masters', (state, user) => {
        requireText(customer.code, 'Customer code'); requireText(customer.name, 'Customer name');
        if (!['Active', 'Inactive'].includes(customer.status)) throw new Error('Invalid customer status.');
        if (state.customers.some(c => c.id !== customer.id && c.code.toLowerCase() === customer.code.toLowerCase())) throw new Error('Customer code already exists.');
        const before = state.customers.find(c => c.id === customer.id);
        state.customers = upsert(state.customers, structuredClone(customer));
        log(state, user, before ? 'Customer updated' : 'Customer created', customer.code, customer.name, before, customer);
      });
    },
    saveSupplier(supplier: Supplier) {
      return change('masters', (state, user) => {
        requireText(supplier.name, 'Supplier name'); requireText(supplier.code, 'Supplier code');
        if (state.suppliers.some(s => s.id !== supplier.id && (s.code.toLowerCase() === supplier.code.toLowerCase() || s.name.toLowerCase() === supplier.name.toLowerCase()))) throw new Error('Supplier code or name already exists.');
        const before = state.suppliers.find(s => s.id === supplier.id);
        if (before && before.name !== supplier.name && state.products.some(p => p.brand === before.name)) throw new Error('A brand used by products cannot be renamed. Update its contact details or create a new brand.');
        state.suppliers = upsert(state.suppliers, structuredClone(supplier));
        log(state, user, before ? 'Supplier updated' : 'Supplier created', supplier.code, supplier.name, before, supplier);
      });
    },
    saveUser(target: User) {
      return change('settings', (state, user) => {
        requireText(target.name, 'User name'); requireText(target.email, 'User email');
        if (!['Admin', 'Pricing Manager', 'Sales / Billing', 'Finance'].includes(target.role)) throw new Error('Unknown role.');
        if (target.id === user.id && (!target.active || target.role !== 'Admin')) throw new Error('Keep your own administrator access active.');
        if (state.users.some(u => u.id !== target.id && u.email.toLowerCase() === target.email.toLowerCase())) throw new Error('Email already belongs to a user.');
        const before = state.users.find(u => u.id === target.id);
        state.users = upsert(state.users, structuredClone(target));
        log(state, user, before ? 'User updated' : 'User created', 'Users', target.name, before, target);
      });
    },
    saveProductDiscount(customerId: string, productId: string, pricing: Pick<Price, 'type' | 'value'>, effectiveDate: string) {
      return change('pricing', (state, user) => {
        if (!validDate(effectiveDate)) throw new Error('Use a valid discount effective date.');
        if (pricing.type !== 'percentage') throw new Error('Use a percentage discount for the customer product matrix.');
        assertValid(validatePrice(pricing));
        const matches = state.rules.filter(rule => rule.scope === 'product' && rule.type === 'percentage' && rule.customerId === customerId && rule.targetId === productId && rule.active);
        const before = matches.filter(rule => rule.effectiveFrom <= effectiveDate && (!rule.effectiveTo || rule.effectiveTo >= effectiveDate))
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
        const future = matches.filter(rule => rule.effectiveFrom > effectiveDate).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
        let effectiveTo = '';
        if (future) {
          const dayBefore = new Date(`${future.effectiveFrom}T00:00:00Z`);
          dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
          effectiveTo = dayBefore.toISOString().slice(0, 10);
        }
        const saved: DiscountRule = { id: before?.id ?? id('discount'), customerId, scope: 'product', targetId: productId,
          type: pricing.type, value: pricing.value, effectiveFrom: before?.effectiveFrom ?? effectiveDate,
          effectiveTo: before?.effectiveTo ?? effectiveTo, active: true, updatedAt: now(), updatedBy: user.name };
        assertValid(validateRules([saved], state));
        state.rules = upsert(state.rules, saved);
        const customer = state.customers.find(item => item.id === customerId)!;
        const product = state.products.find(item => item.id === productId)!;
        log(state, user, 'Product discount updated', 'Discount matrix', `${customer.name}: ${product.code} ${product.name}`, before, saved);
        return saved;
      });
    },
    saveRules(rules: DiscountRule[], reason = 'Product discount maintenance') {
      return change('pricing', (state, user) => {
        if (!rules.length) throw new Error('No pricing changes supplied.');
        if (rules.some(rule => rule.scope !== 'product')) throw new Error('Only customer-specific product discounts can be changed.');
        if (rules.some(rule => rule.type !== 'percentage')) throw new Error('Use percentage discounts for the customer product matrix.');
        assertValid(validateRules(rules, state));
        const stamped = rules.map(r => ({ ...structuredClone(r), updatedAt: now(), updatedBy: user.name }));
        const editedIds = new Set(rules.map(r => r.id));
        const before = state.rules.filter(r => editedIds.has(r.id));
        state.rules = mergeBatch(state.rules, stamped);
        log(state, user, 'Product discounts updated', 'Discount matrix', `${rules.length} change(s): ${reason}`, before, stamped);
      });
    },
    deleteRule(ruleId: string) {
      const rule = getState().rules.find(r => r.id === ruleId);
      if (!rule) throw new Error('Pricing rule no longer exists.');
      return actions.saveRules([{ ...rule, active: false }], 'Rule deactivated');
    },
    reviewApproval(approvalId: string, approve: boolean) {
      return change('approve', (state, user) => {
        const request = state.approvals.find(a => a.id === approvalId);
        if (!request || request.status !== 'Pending') throw new Error('This request is no longer pending.');
        const editedIds = new Set(request.rules.map(r => r.id));
        const before = state.rules.filter(r => editedIds.has(r.id));
        if (approve) {
          assertValid(validateRules(request.rules, state));
          state.rules = mergeBatch(state.rules, request.rules.map(rule => ({ ...rule, updatedAt: now(), updatedBy: user.name })));
        }
        request.status = approve ? 'Approved' : 'Rejected'; request.reviewedBy = user.name;
        log(state, user, approve ? 'Pricing approved' : 'Pricing rejected', 'Discount matrix', request.reason, before, approve ? request.rules : undefined);
      });
    },
    saveDocument(document: SalesDocument): SalesDocument {
      return change('billing', (state, user) => {
        requireText(document.id, 'Document identifier');
        const before = state.documents.find(d => d.id === document.id);
        if (before && before.status !== 'Draft') throw new Error('Posted, converted and reversed documents are locked.');
        if (document.status !== 'Draft') throw new Error('Save as a draft before posting.');
        if (!['Invoice', 'Quote', 'Credit Note'].includes(document.kind)) throw new Error('Unknown document kind.');
        if (before && before.kind !== document.kind) throw new Error('A document kind cannot be changed.');
        if (before && before.sourceDocumentId !== document.sourceDocumentId) throw new Error('The source document cannot be changed.');
        if (!before && document.sourceDocumentId) throw new Error('Use the quote conversion or credit-note action to create a linked document.');
        if (before && (before.date !== document.date || before.customerId !== document.customerId)
          && document.lines.some(line => before.lines.some(old => old.id === line.id))) throw new Error('Remove existing lines before changing the document date or customer, then add products with their applicable pricing.');
        validateDocument(document, state, user, before);
        const sourceDocument = document.sourceDocumentId ? state.documents.find(d => d.id === document.sourceDocumentId) : undefined;
        const lines = structuredClone(document.lines).map(line => {
          const source = before?.lines.find(l => l.id === line.id && l.productId === line.productId) ?? sourceDocument?.lines.find(l => l.id === line.id && l.productId === line.productId);
          const product = state.products.find(p => p.id === line.productId)!;
          const canonical = { ...line, productCode: source?.productCode ?? product.code, productName: source?.productName ?? product.name,
            brand: source?.brand ?? product.brand, category: source?.category ?? product.category, packing: source?.packing ?? product.packing };
          if (!line.override) return { ...canonical, overrideBy: undefined, overrideAt: undefined };
          const changed = !source || !source.override || !samePrice(source.appliedPricing, line.appliedPricing) || source.reason !== line.reason;
          return { ...canonical, overrideBy: changed ? user.name : (source.overrideBy ?? sourceDocument?.createdBy ?? before?.createdBy ?? user.name),
            overrideAt: changed ? now() : (source.overrideAt ?? sourceDocument?.createdAt ?? before?.createdAt ?? now()) };
        });
        const saved: SalesDocument = { ...structuredClone(document), lines, number: before?.number || nextNumber(state, document.kind),
          customerName: state.customers.find(c => c.id === document.customerId)!.name, createdBy: before?.createdBy || user.name,
          createdAt: before?.createdAt || now(), updatedAt: now(), postedAt: undefined };
        state.documents = upsert(state.documents, saved);
        log(state, user, before ? 'Draft updated' : 'Draft created', saved.number, `${saved.kind} · ${saved.customerName}`, before, saved);
        return saved;
      });
    },
    postDocument(documentId: string) {
      return change('billing', (state, user) => {
        const doc = state.documents.find(d => d.id === documentId);
        if (!doc || doc.status !== 'Draft') throw new Error('Only draft documents can be posted.');
        if (doc.kind === 'Quote') throw new Error('Convert a quote to an invoice before posting.');
        validateDocument(doc, state, user, doc);
        const before = structuredClone(doc);
        doc.status = 'Posted'; doc.postedAt = now(); doc.updatedAt = now();
        log(state, user, 'Document posted', doc.number, 'Discounts and rates locked; customer pricing matrix unchanged.', before, doc);
      });
    },
    convertQuote(quoteId: string): SalesDocument {
      return change('billing', (state, user) => {
        const quote = state.documents.find(d => d.id === quoteId && d.kind === 'Quote');
        if (!quote || quote.status !== 'Draft') throw new Error('Only an unconverted draft quote can be converted.');
        validateDocument(quote, state, user, quote);
        const before = structuredClone(quote);
        const invoice: SalesDocument = { ...structuredClone(quote), id: id('invoice'), number: nextNumber(state, 'Invoice'), kind: 'Invoice', status: 'Draft', sourceDocumentId: quote.id, createdBy: user.name, createdAt: now(), updatedAt: now() };
        quote.status = 'Converted'; quote.updatedAt = now(); state.documents.push(invoice);
        log(state, user, 'Quote converted', invoice.number, `From ${quote.number}; quoted rates, discount values and override labels preserved.`, before, { quote, invoice });
        return invoice;
      });
    },
    creditDocument(documentId: string, reason: string): SalesDocument {
      return change('billing', (state, user) => {
        requireText(reason, 'Return reason');
        const original = state.documents.find(d => d.id === documentId && d.kind === 'Invoice' && d.status === 'Posted');
        if (!original) throw new Error('Choose a posted invoice to create a credit note.');
        const credits = state.documents.filter(d => d.kind === 'Credit Note' && d.sourceDocumentId === original.id && d.status === 'Posted');
        const returned = new Map<string, number>();
        for (const line of credits.flatMap(c => c.lines)) returned.set(line.id, (returned.get(line.id) || 0) + sellingQuantity(line));
        const lines: DocumentLine[] = [];
        for (const source of original.lines) {
          const quantity = sellingQuantity(source); const prior = returned.get(source.id) || 0;
          const remaining = Math.max(0, quantity - prior);
          if (remaining) lines.push({ ...structuredClone(source), quantity: remaining, unit: 'pack' });
        }
        if (!lines.length) throw new Error('This invoice has already been fully credited.');
        const credit: SalesDocument = { ...structuredClone(original), id: id('credit'), number: nextNumber(state, 'Credit Note'), kind: 'Credit Note', status: 'Draft', sourceDocumentId: original.id,
          date: localDate(), dueDate: '', lines, notes: reason, createdBy: user.name, createdAt: now(), updatedAt: now(), postedAt: undefined };
        state.documents.push(credit); log(state, user, 'Credit note created', credit.number, `${reason}; original pricing from ${original.number} retained.`, undefined, credit);
        return credit;
      });
    },
    reverseDocument(documentId: string, reason: string) {
      return change('billing', (state, user) => {
        requireText(reason, 'Reversal reason');
        const document = state.documents.find(d => d.id === documentId);
        if (!document || document.status !== 'Posted') throw new Error('Only posted documents can be reversed.');
        if (state.documents.some(d => d.sourceDocumentId === documentId && d.kind === 'Credit Note' && d.status !== 'Reversed')) throw new Error('Resolve related credit notes before reversing this invoice.');
        const before = structuredClone(document); document.status = 'Reversed'; document.updatedAt = now();
        log(state, user, 'Document reversed', document.number, reason, before, document);
      });
    },
    updateSettings(patch: Partial<Settings>) {
      return change('settings', (state, user) => {
        const next = { ...state.settings, ...patch }; requireText(next.companyName, 'Company name');
        if (!['brand', 'category'].includes(next.brandCategoryPriority)) throw new Error('Choose brand or category priority.');
        if (!/^[a-zA-Z0-9-]{1,20}$/.test(next.invoicePrefix) || !/^[a-zA-Z0-9-]{1,20}$/.test(next.quotePrefix)) throw new Error('Document prefixes must contain 1–20 letters, numbers or hyphens.');
        if (next.invoicePrefix === next.quotePrefix || [next.invoicePrefix, next.quotePrefix].includes('ZP-CN')) throw new Error('Invoice, quote and credit-note prefixes must differ.');
        const before = state.settings; state.settings = next; log(state, user, 'Settings updated', 'Settings', 'Workspace policies updated.', before, next);
      });
    },
    switchUser(userId: string) {
      return change(null, (state) => {
        const target = state.users.find(u => u.id === userId && u.active);
        if (!target) throw new Error('Choose an active demonstration user.');
        state.currentUserId = target.id;
      });
    },
    addRateVersion(version: RateVersion) {
      return change('pricing', (state, user) => {
        requireText(version.name, 'Rate-list name');
        if (!validDate(version.effectiveDate)) throw new Error('Use a valid effective date.');
        const last = [...state.rateVersions].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
        if (last && version.effectiveDate <= last.effectiveDate) throw new Error('A new rate list must take effect after the latest stored version.');
        if (state.rateVersions.some(v => v.id === version.id)) throw new Error('Rate-list identifier already exists.');
        for (const [productId, rate] of Object.entries(version.rates)) {
          if (!state.products.some(p => p.id === productId)) throw new Error(`Unknown product ${productId}.`);
          if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) throw new Error('Each list rate must be positive or unavailable.');
        }
        if (!Object.keys(version.rates).length) throw new Error('The rate list contains no products.');
        const complete = Object.fromEntries(state.products.map(p => [p.id, Object.prototype.hasOwnProperty.call(version.rates, p.id) ? version.rates[p.id] : effectiveRate(p, version.effectiveDate, state)]));
        const saved = { ...structuredClone(version), rates: complete, createdAt: now() }; state.rateVersions.push(saved);
        if (version.effectiveDate <= localDate()) state.products = state.products.map(p => ({ ...p, rate: complete[p.id], effectiveDate: version.effectiveDate, status: complete[p.id] === null ? 'Inactive' : p.status }));
        log(state, user, 'Rate list published', version.name, `Effective ${version.effectiveDate}; customer discounts and existing invoices unchanged.`, undefined, saved);
      });
    },
    resetDemo() {
      return change('settings', (state, user) => {
        const fresh = initialState(); Object.assign(state, fresh); log(state, user, 'Workspace reset', 'Workspace', 'Local workspace restored to its original demonstration data.');
      });
    },
    restoreBackup(backup: AppState) {
      return change('settings', (state, user) => {
        validateBackup(backup);
        const restored = structuredClone(backup);
        if (!restored.users.some(u => u.id === restored.currentUserId && u.active)) restored.currentUserId = restored.users.find(u => u.role === 'Admin' && u.active)!.id;
        Object.assign(state, restored); log(state, user, 'Backup restored', 'Workspace', 'Local workspace replaced with validated backup.');
      });
    },
  };
  return actions;
}

export function validateBackup(value: AppState) {
  if (!value || value.schemaVersion !== 1) throw new Error('This is not a compatible Zahra Plast backup.');
  for (const key of ['products', 'customers', 'suppliers', 'users', 'rules', 'documents', 'audit', 'rateVersions', 'approvals'] as const) {
    if (!Array.isArray(value[key])) throw new Error(`Backup is missing ${key}.`);
    if (value[key].some(r => !r || typeof r.id !== 'string' || !r.id.trim())) throw new Error(`Backup has an invalid ${key} identifier.`);
    if (new Set(value[key].map(r => r.id)).size !== value[key].length) throw new Error(`Backup has duplicate ${key} identifiers.`);
  }
  if (!value.settings?.companyName || !['brand', 'category'].includes(value.settings.brandCategoryPriority)) throw new Error('Backup settings are invalid.');
  for (const key of ['approvalRequired', 'overrideReasonRequired', 'allowSaveToMatrix'] as const) if (typeof value.settings[key] !== 'boolean') throw new Error('Backup policy settings are invalid.');
  if (!value.users.some(u => u.role === 'Admin' && u.active)) throw new Error('Backup needs an active administrator.');
  const brands = new Set(value.suppliers.map(s => s.name));
  const productIds = new Set(value.products.map(p => p.id));
  const customerIds = new Set(value.customers.map(c => c.id));
  for (const user of value.users) {
    requireText(user.name, 'User name'); requireText(user.email, 'User email');
    if (!['Admin', 'Pricing Manager', 'Sales / Billing', 'Finance'].includes(user.role) || typeof user.active !== 'boolean' || typeof user.canOverride !== 'boolean') throw new Error('Backup user permissions are invalid.');
  }
  for (const product of value.products) {
    assertValid(validateProduct(product));
    if (!brands.has(product.brand) || !Array.isArray(product.notes) || typeof product.packing !== 'string') throw new Error('Backup product details are invalid.');
  }
  for (const customer of value.customers) {
    requireText(customer.name, 'Customer name'); requireText(customer.code, 'Customer code');
    if (!['Active', 'Inactive'].includes(customer.status)) throw new Error('Backup customer status is invalid.');
  }
  for (const supplier of value.suppliers) { requireText(supplier.name, 'Supplier name'); requireText(supplier.code, 'Supplier code'); }
  for (const items of [value.products, value.customers, value.suppliers]) {
    if (new Set(items.map(row => row.code.trim().toLowerCase())).size !== items.length) throw new Error('Backup contains duplicate master codes.');
  }
  assertValid(validateRules(value.rules, { ...value, rules: [] }));
  const rateDates = new Set<string>();
  for (const version of value.rateVersions) {
    if (!validDate(version.effectiveDate) || rateDates.has(version.effectiveDate) || !version.rates || typeof version.rates !== 'object') throw new Error('Backup rate-list dates or values are invalid.');
    rateDates.add(version.effectiveDate);
    for (const [productId, rate] of Object.entries(version.rates)) {
      if (!productIds.has(productId) || (rate !== null && (!Number.isFinite(rate) || rate <= 0))) throw new Error('Backup rate list contains an unknown product or invalid price.');
    }
  }
  const numbers = new Set<string>();
  for (const doc of value.documents) {
    if (!Array.isArray(doc.lines) || !doc.lines.length || !validDate(doc.date) || !customerIds.has(doc.customerId)
      || !['Invoice', 'Quote', 'Credit Note'].includes(doc.kind) || !['Draft', 'Posted', 'Converted', 'Reversed'].includes(doc.status)) throw new Error('Backup has an invalid document.');
    if ((doc.kind === 'Quote' && !['Draft', 'Converted'].includes(doc.status)) || (doc.kind !== 'Quote' && doc.status === 'Converted')) throw new Error('Backup document lifecycle is invalid.');
    requireText(doc.number, 'Document number');
    if (numbers.has(doc.number)) throw new Error('Backup contains duplicate document numbers.'); numbers.add(doc.number);
    if (new Set(doc.lines.map(l => l.id)).size !== doc.lines.length) throw new Error('Backup contains duplicate document line identifiers.');
    if (doc.sourceDocumentId) {
      const source = value.documents.find(d => d.id === doc.sourceDocumentId);
      if (!source || source.id === doc.id || (doc.kind === 'Credit Note' ? source.kind !== 'Invoice' : doc.kind !== 'Invoice' || source.kind !== 'Quote')) throw new Error('Backup has an invalid document source.');
    } else if (doc.kind === 'Credit Note') throw new Error('Backup credit note is missing its original invoice.');
    for (const line of doc.lines) {
      if (!productIds.has(line.productId) || !line.id || !Number.isFinite(line.listRate) || line.listRate <= 0 || !Number.isInteger(line.quantity) || line.quantity <= 0
        || !['pack', 'carton'].includes(line.unit) || typeof line.override !== 'boolean' || typeof line.reason !== 'string') throw new Error('Backup contains invalid document quantities or rates.');
      if (line.unit === 'carton' && (!line.cartonQuantity || !Number.isInteger(line.cartonQuantity) || line.cartonQuantity <= 0)) throw new Error('Backup contains an invalid carton quantity.');
      assertValid(validatePrice(line.originalPricing, line.listRate)); assertValid(validatePrice(line.appliedPricing, line.listRate));
      if (!line.override && !samePrice(line.originalPricing, line.appliedPricing)) throw new Error('Backup contains an unlabelled discount override.');
    }
  }
  for (const approval of value.approvals) {
    if (!['Pending', 'Approved', 'Rejected'].includes(approval.status) || !Array.isArray(approval.rules)) throw new Error('Backup approval queue is invalid.');
    // Approval history may refer to categories that were subsequently renamed.
    // Pending requests are revalidated against live masters when reviewed.
    for (const rule of approval.rules) {
      requireText(rule.id, 'Approval rule identifier'); requireText(rule.customerId, 'Approval customer');
      if (!['product', 'brand', 'category', 'customer'].includes(rule.scope) || !validDate(rule.effectiveFrom)
        || (rule.effectiveTo && (!validDate(rule.effectiveTo) || rule.effectiveTo < rule.effectiveFrom))) throw new Error('Backup approval pricing is invalid.');
      assertValid(validatePrice(rule));
    }
  }
}

export type AppActions = ReturnType<typeof createOperations>;
