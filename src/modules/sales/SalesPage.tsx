import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, FileCheck2, FileText, Plus, Receipt, Search, ShieldCheck } from 'lucide-react';
import { Badge, Button, EmptyState, PageHeader, SearchInput, StatCard } from '../../components/ui';
import { useApp } from '../../state/AppProvider';
import { documentTotal } from '../../lib/pricing';
import { money, shortDate } from '../../lib/format';
import type { SalesDocument } from '../../types';
import { DocumentEditor } from './DocumentEditor';
import { DocumentPreview } from './DocumentPreview';
import { newDocument, statusTone } from './sales-utils';
import './sales.css';

export default function SalesPage({ kind = 'Invoice' }: { kind?: 'Invoice' | 'Quote' }) {
  const { state, user, can } = useApp();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [customer, setCustomer] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<SalesDocument | null>(null);
  const selectedId = params.id || searchParams.get('document');
  const selected = state.documents.find(document => document.id === selectedId);
  const documents = state.documents.filter(document => kind === 'Quote' ? document.kind === 'Quote' : document.kind !== 'Quote');
  const filtered = useMemo(() => documents.filter(document => (status === 'All' || document.status === status || status === 'Credits' && document.kind === 'Credit Note') && (!customer || document.customerId === customer) && `${document.number} ${document.customerName} ${document.notes}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [documents, status, customer, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const visible = filtered.slice((Math.min(page, pages) - 1) * 10, Math.min(page, pages) * 10);
  const posted = documents.filter(document => document.status === (kind === 'Quote' ? 'Draft' : 'Posted') && document.kind === kind);
  const drafts = documents.filter(document => document.status === 'Draft');
  const overrides = documents.filter(document => document.lines.some(line => line.override));
  const postedValue = posted.reduce((total, document) => total + documentTotal(document), 0);
  const base = kind === 'Quote' ? '/quotes' : '/invoices';

  useEffect(() => { setPage(1); }, [query, status, customer, kind]);
  useEffect(() => { if (searchParams.has('new') && can('billing')) { setEditor(newDocument(kind, user)); setSearchParams({}, { replace: true }); } }, [searchParams, kind]);
  const closePreview = () => { if (params.id) navigate(base); else setSearchParams({}); };
  const onSaved = (document: SalesDocument) => { setEditor(null); navigate(`${document.kind === 'Quote' ? '/quotes' : '/invoices'}?document=${encodeURIComponent(document.id)}`); };
  const openCreated = (document: SalesDocument) => { closePreview(); setEditor(document); };

  return <div className="page-stack sales-page">
    <PageHeader eyebrow="SALES WORKSPACE" title={kind === 'Quote' ? 'Quotations' : 'Invoices'} description={kind === 'Quote' ? 'Build considered offers. Carry agreed pricing straight into an invoice.' : 'Clear pricing, confident billing. Every customer agreement in the right place.'} actions={can('billing') ? <Button variant="primary" onClick={() => setEditor(newDocument(kind, user))}><Plus size={17} /> New {kind.toLowerCase()}</Button> : <Badge tone="gray">View-only access</Badge>} />
    <div className="sales-stats"><StatCard label={kind === 'Quote' ? 'Open quote value' : 'Posted invoice value'} value={money(postedValue)} detail={`${posted.length} ${kind.toLowerCase()}${posted.length === 1 ? '' : 's'} · before credits`} icon={kind === 'Quote' ? FileText : Receipt} /><StatCard label="Ready to review" value={String(drafts.length)} detail="Draft documents" icon={FileCheck2} /><StatCard label="With manual overrides" value={String(overrides.length)} detail="Every change is traceable" icon={ShieldCheck} /></div>
    <section className="card sales-register">
      <div className="sales-register-top"><div><h2>{kind === 'Quote' ? 'Quote register' : 'Invoice register'}</h2><p>{documents.length} documents in your workspace</p></div><Badge tone="gray">Sample activity + your changes</Badge></div>
      <div className="sales-status-tabs" aria-label="Filter document status">{['All', 'Draft', ...(kind === 'Quote' ? ['Converted'] : ['Posted', 'Credits', 'Reversed'])].map(item => <button key={item} className={status === item ? 'active' : ''} aria-pressed={status === item} onClick={() => setStatus(item)}>{item === 'Posted' && kind === 'Quote' ? 'Finalized' : item}{item === 'All' && <span>{documents.length}</span>}{item === 'Draft' && <span>{drafts.length}</span>}</button>)}</div>
      <div className="toolbar sales-register-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search document or customer…" /><select className="select" aria-label="Filter documents by customer" value={customer} onChange={event => setCustomer(event.target.value)}><option value="">All customers</option>{state.customers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="sales-filter-count">{filtered.length} results</span></div>
      {visible.length ? <div className="table-wrap"><table className="data-table sales-register-table"><thead><tr><th>Document</th><th>Customer</th><th>Date</th><th>Pricing</th><th>Status</th><th className="sales-align-right">Amount</th><th><span className="sr-only">Open document</span></th></tr></thead><tbody>{visible.map(document => {
        const count = document.lines.filter(line => line.override).length;
        return <tr key={document.id}><td><button className="sales-document-link" onClick={() => setSearchParams({ document: document.id })}><span className={`sales-document-icon ${document.kind === 'Credit Note' ? 'credit' : ''}`}>{document.kind === 'Credit Note' ? <ArrowDownLeft size={17} /> : kind === 'Quote' ? <FileText size={17} /> : <Receipt size={17} />}</span><span><strong>{document.number}</strong><small>{document.kind}</small></span></button></td><td><strong className="sales-customer-name">{document.customerName}</strong><small>{state.customers.find(item => item.id === document.customerId)?.code ?? ''}</small></td><td>{shortDate(document.date)}<small>{document.lines.length} {document.lines.length === 1 ? 'line' : 'lines'}</small></td><td>{count ? <Badge tone="amber">{count} {count === 1 ? 'override' : 'overrides'}</Badge> : <span className="sales-matrix-label"><ShieldCheck size={14} /> Matrix pricing</span>}</td><td><Badge tone={statusTone(document.status)}>{document.status === 'Posted' && kind === 'Quote' ? 'Finalized' : document.status}</Badge></td><td className={`sales-money sales-align-right ${document.kind === 'Credit Note' ? 'sales-credit-amount' : ''}`}>{document.kind === 'Credit Note' ? '− ' : ''}{money(documentTotal(document), 2)}</td><td><button className="sales-icon-button" aria-label={`Open ${document.number}`} onClick={() => setSearchParams({ document: document.id })}><ArrowUpRight size={17} /></button></td></tr>;
      })}</tbody></table></div> : <EmptyState icon={query ? Search : kind === 'Quote' ? FileText : Receipt} title={query || status !== 'All' || customer ? 'No matching documents' : `Your first ${kind.toLowerCase()} starts here`} description={query || status !== 'All' || customer ? 'Try another search or clear your filters.' : 'Create a document and customer pricing will be filled in for you.'} action={query || status !== 'All' || customer ? <Button variant="secondary" onClick={() => { setQuery(''); setStatus('All'); setCustomer(''); }}>Clear filters</Button> : can('billing') ? <Button variant="primary" onClick={() => setEditor(newDocument(kind, user))}><Plus size={16} /> New {kind.toLowerCase()}</Button> : undefined} />}
      <div className="pagination sales-pagination"><span>{filtered.length ? `Showing ${(Math.min(page, pages) - 1) * 10 + 1}–${Math.min(Math.min(page, pages) * 10, filtered.length)} of ${filtered.length} documents` : '0 documents'}</span><div className="row"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft size={15} /> Previous</Button><span>{Math.min(page, pages)} / {pages}</span><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(current => Math.min(pages, current + 1))}>Next <ChevronRight size={15} /></Button></div></div>
    </section>
    <div className="sales-workspace-note"><ShieldCheck size={17} /><span>Invoice adjustments stay on the invoice. Posted documents keep their original rates and discounts.</span></div>
    {selected && !editor && <DocumentPreview key={selected.id} document={selected} onClose={closePreview} onEdit={() => setEditor(selected)} onOpenCreated={openCreated} />}
    {editor && <DocumentEditor key={editor.id} document={editor} onClose={() => setEditor(null)} onSaved={onSaved} />}
  </div>;
}
