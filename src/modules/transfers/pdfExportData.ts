import type { AppState, Customer, Price } from '../../types';
import type { PdfExportColumn, PdfExportDocument, PdfExportSection } from '../../lib/pdfExportTypes';
import type { TransferKind } from '../../lib/spreadsheets';
import { today } from '../../lib/format';
import { effectiveRate, resolvePrice, unitNet } from '../../lib/pricing';

export type TransferPdfKind = TransferKind | 'matrix';

const amount = (value: number | null) => value === null ? 'Not available' : new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const supplied = (value: string) => value.trim() || 'Not supplied';
const agreement = (price: Pick<Price, 'type' | 'value'>) => price.type === 'percentage' ? `${price.value}% discount` : `Fixed net\nPKR ${amount(price.value)}`;
const customerLabel = (customer: Customer) => `${customer.code} - ${customer.name}${customer.sample ? ' (sample)' : ''}`;
const sampleNote = 'Customers marked sample and their pricing agreements are demonstration data.';
const priceNote = 'All prices are PKR per selling pack or set, not procurement costs. Unavailable values are preserved.';

const matrixColumns: PdfExportColumn[] = [
  { header: 'Product code / name', width: 72 },
  { header: 'Brand / category', width: 47 },
  { header: 'List price\nPKR', width: 27, align: 'right' },
  { header: 'Resolved agreement', width: 36 },
  { header: 'Net price\nPKR', width: 27, align: 'right' },
  { header: 'Pricing source', width: 40 },
];

/** Presentation data only: PDF export does not change masters or pricing. */
export function buildTransferPdf(kind: TransferPdfKind, state: AppState): PdfExportDocument {
  const date = today();
  const base = {
    filename: `zahra-plast-${kind === 'matrix' ? 'complete-customer-matrix' : kind}`,
    companyName: state.settings.companyName.trim() || 'Zahra Plast',
    generatedOn: date,
  };
  let section: PdfExportSection;

  if (kind === 'products') {
    section = {
      note: priceNote,
      columns: [
        { header: 'Product code / name', width: 63 },
        { header: 'Brand / category', width: 44 },
        { header: 'List price\nPKR', width: 25, align: 'right' },
        { header: 'Packing / count', width: 38 },
        { header: 'Packs per\ncarton', width: 24, align: 'right' },
        { header: 'Status', width: 27 },
        { header: 'Effective from', width: 28 },
      ],
      rows: state.products.map(product => [
        `${product.code}\n${product.name}`, `${product.brand}\n${product.category}`,
        amount(product.rate), `${supplied(product.packing)}\nCount: ${product.packingCount ?? 'Not supplied'}`,
        product.cartonQuantity ?? 'Not supplied', product.status, product.effectiveDate,
      ]),
    };
    return { ...base, title: 'Product catalog', subtitle: `${state.products.length.toLocaleString('en-PK')} products | Catalog and packing details`, sections: [section] };
  }

  if (kind === 'customers') {
    section = {
      note: sampleNote,
      columns: [
        { header: 'Customer code / name', width: 60 },
        { header: 'Contact details', width: 63 },
        { header: 'Address', width: 57 },
        { header: 'Group', width: 30 },
        { header: 'Payment terms', width: 35 },
        { header: 'Status / sample', width: 28 },
      ],
      rows: state.customers.map(customer => [
        `${customer.code}\n${customer.name}`,
        `Contact: ${supplied(customer.contact)}\nPhone: ${supplied(customer.phone)}\nEmail: ${supplied(customer.email)}`,
        supplied(customer.address), supplied(customer.group), supplied(customer.paymentTerms),
        `${customer.status}\nSample: ${customer.sample ? 'Yes' : 'No'}`,
      ]),
    };
    return { ...base, title: 'Customer directory', subtitle: `${state.customers.length.toLocaleString('en-PK')} customers | Contacts, groups and payment terms`, sections: [section] };
  }

  if (kind === 'suppliers') {
    section = {
      note: 'Source brand names are retained. Contact and commercial terms are shown only when supplied.',
      columns: [
        { header: 'Supplier code / brand', width: 64 },
        { header: 'Contact person', width: 49 },
        { header: 'Phone', width: 40 },
        { header: 'Email', width: 64 },
        { header: 'Terms', width: 56 },
      ],
      rows: state.suppliers.map(supplier => [
        `${supplier.code}\n${supplier.name}`, supplied(supplier.contact), supplied(supplier.phone), supplied(supplier.email), supplied(supplier.terms),
      ]),
    };
    return { ...base, title: 'Supplier directory', subtitle: `${state.suppliers.length.toLocaleString('en-PK')} suppliers | Brands and contacts`, sections: [section] };
  }

  if (kind === 'discounts') {
    const customers = new Map(state.customers.map(customer => [customer.id, customer]));
    const products = new Map(state.products.map(product => [product.id, product]));
    section = {
      note: `${sampleNote} Fixed prices are net PKR per selling unit. Includes active and inactive saved rules.`,
      columns: [
        { header: 'Customer', width: 58 },
        { header: 'Scope', width: 25 },
        { header: 'Target', width: 58 },
        { header: 'Agreement', width: 39 },
        { header: 'Effective from', width: 29 },
        { header: 'Effective to', width: 29 },
        { header: 'Status', width: 25 },
      ],
      rows: state.rules.map(rule => {
        const customer = customers.get(rule.customerId);
        const product = rule.scope === 'product' ? products.get(rule.targetId) : undefined;
        const target = rule.scope === 'customer' ? 'All products (default)' : product ? `${product.code}\n${product.name}` : rule.targetId;
        return [customer ? customerLabel(customer) : rule.customerId, rule.scope, target, agreement(rule), rule.effectiveFrom, rule.effectiveTo || 'No expiry', rule.active ? 'Active' : 'Inactive'];
      }),
    };
    return { ...base, title: 'Customer pricing rules', subtitle: `${state.rules.length.toLocaleString('en-PK')} saved agreements | Percentage discounts and fixed net prices`, sections: [section] };
  }

  if (kind === 'rates') {
    section = {
      note: priceNote,
      columns: [
        { header: 'Product code / name', width: 84 },
        { header: 'Brand / category', width: 60 },
        { header: 'Packing', width: 38 },
        { header: 'List price\nPKR', width: 32, align: 'right' },
        { header: 'Status', width: 30 },
        { header: 'Pricing as of', width: 29 },
      ],
      rows: state.products.map(product => [
        `${product.code}\n${product.name}`, `${product.brand}\n${product.category}`,
        supplied(product.packing), amount(effectiveRate(product, date, state)), product.status, date,
      ]),
    };
    return { ...base, title: 'Current rate list', subtitle: `${state.products.length.toLocaleString('en-PK')} products | Prices resolved as of ${date}`, sections: [section] };
  }

  return {
    ...base,
    title: 'Complete customer matrix',
    subtitle: `${(state.customers.length * state.products.length).toLocaleString('en-PK')} customer-product prices | Pricing as of ${date}`,
    sections: state.customers.map(customer => ({
      title: customerLabel(customer),
      note: `${customer.sample ? 'Sample customer and demonstration agreements. ' : ''}Pricing as of ${date}. PKR per selling pack or set; unavailable rates are preserved.`,
      columns: matrixColumns,
      rows: state.products.map(product => {
        const price = resolvePrice(product, customer.id, date, state);
        const rate = effectiveRate(product, date, state);
        return [
          `${product.code}\n${product.name}`, `${product.brand}\n${product.category}`,
          amount(rate), agreement(price), amount(rate === null ? null : unitNet(rate, price)), price.sourceLabel || 'List rate',
        ];
      }),
    })),
  };
}
