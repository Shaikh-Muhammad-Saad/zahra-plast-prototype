import { useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, CheckCircle2, ChevronRight, Database, FileCheck2, FileSpreadsheet, FileText, FileUp, History, Info, Layers3, Package, RotateCcw, ShieldCheck, Tag, Upload, Users, X, XCircle } from 'lucide-react';
import { useApp } from '../../state/AppProvider';
import { Badge, Button, EmptyState, Modal, PageHeader } from '../../components/ui';
import { downloadText, number, shortDate, today, uid } from '../../lib/format';
import { effectiveRate, resolvePrice, unitNet } from '../../lib/pricing';
import { exportRows, exportSpreadsheet, parseSpreadsheet, parseWorkspaceBackup, sheetColumns, validateImport } from '../../lib/spreadsheets';
import type { ImportResult, SheetRow, TransferKind } from '../../lib/spreadsheets';
import type { AppState, Customer, DiscountRule, Product, Supplier } from '../../types';
import { downloadPdf } from '../../lib/pdfExport';
import { buildTransferPdf, type TransferPdfKind } from './pdfExportData';
import './transfers.css';

const destinations: { key: TransferKind; title: string; detail: string; icon: typeof Package }[] = [
  { key: 'products', title: 'Products', detail: 'Catalog & packing', icon: Package },
  { key: 'customers', title: 'Customers', detail: 'Contacts & groups', icon: Users },
  { key: 'suppliers', title: 'Suppliers', detail: 'Brands & contacts', icon: Layers3 },
  { key: 'discounts', title: 'Product discounts', detail: 'Customer and product prices', icon: Tag },
  { key: 'rates', title: 'New rate list', detail: 'Effective-dated prices', icon: History },
];
const getError = (cause: unknown) => cause instanceof Error ? cause.message : 'The operation could not be completed.';

export default function TransfersPage() {
  const { state, can, actions, notify } = useApp();
  const [tab, setTab] = useState<'import' | 'export' | 'history'>('import');
  const [kind, setKind] = useState<TransferKind>('discounts');
  const [filename, setFilename] = useState('');
  const [rawRows, setRawRows] = useState<SheetRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');
  const [error, setError] = useState('');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState(false);
  const [importSummary, setImportSummary] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [backup, setBackup] = useState<AppState | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const valid = results.filter(result => !result.errors.length);
  const invalid = results.filter(result => result.errors.length > 0);
  const preview = results.filter(result => previewFilter === 'all' || (previewFilter === 'valid' ? !result.errors.length : result.errors.length > 0));
  const permitted = can(kind === 'discounts' ? 'pricing' : 'masters');
  const selected = destinations.find(d => d.key === kind)!;
  const resetFile = () => { setFilename(''); setRawRows([]); setResults([]); setError(''); setApplied(false); setImportSummary(''); setPage(1); if (fileInput.current) fileInput.current.value = ''; };

  async function readFile(file?: File) {
    if (!file) return;
    setBusy(true); setError(''); setApplied(false); setImportSummary(''); setPage(1);
    try {
      const rows = await parseSpreadsheet(file);
      if (!rows.length) throw new Error('This file contains headers but no data rows. Add records below the header row.');
      if (rows.length > 60000) throw new Error('Import up to 60,000 rows at a time. Split this file into smaller batches.');
      setFilename(file.name); setRawRows(rows); setResults(validateImport(kind, rows, state)); setPreviewFilter('all');
    } catch (cause) { setError(getError(cause)); setFilename(''); setRawRows([]); setResults([]); }
    finally { setBusy(false); }
  }
  async function downloadTemplate(format: 'csv' | 'xlsx') {
    try { await exportSpreadsheet(`zahra-plast-${kind}-template`, [], format, sheetColumns[kind]); }
    catch (cause) { notify(getError(cause), 'error'); }
  }
  async function exportData(target: TransferKind, format: 'csv' | 'xlsx') {
    setBusy(true);
    try { await exportSpreadsheet(`zahra-plast-${target}`, exportRows(target, state), format, sheetColumns[target]); notify('Your export is ready.', 'success'); }
    catch (cause) { notify(getError(cause), 'error'); }
    finally { setBusy(false); }
  }
  async function exportPdf(target: TransferPdfKind) {
    setBusy(true); setPdfProgress('Preparing your PDF...');
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      await downloadPdf(buildTransferPdf(target, state), (completed, total) => {
        setPdfProgress(completed === total ? 'Finishing your PDF...' : `Preparing your PDF: ${number(completed)} of ${number(total)} records`);
      });
      notify('Your PDF has been downloaded.', 'success');
    } catch (cause) { notify(getError(cause), 'error'); }
    finally { setBusy(false); setPdfProgress(''); }
  }
  async function exportCompleteMatrix(format: 'csv' | 'xlsx') {
    setBusy(true);
    try {
      const date = today();
      const rows = state.customers.flatMap(customer => state.products.map(product => {
        const price = resolvePrice(product, customer.id, date, state); const rate = effectiveRate(product, date, state);
        return { customerCode: customer.code, customer: customer.name, sampleCustomer: customer.sample, productCode: product.code, product: product.name, brand: product.brand, category: product.category, listRate: rate, discountPercent: price.value, netPrice: rate === null ? null : unitNet(rate, price), source: price.sourceLabel, asOf: date };
      }));
      await exportSpreadsheet('zahra-plast-complete-customer-matrix', rows, format);
      notify(`${number(rows.length)} customer-product prices exported.`, 'success');
    } catch (cause) { notify(getError(cause), 'error'); }
    finally { setBusy(false); }
  }
  function applyImport() {
    setConfirmOpen(false); setBusy(true); setError('');
    try {
      const checked = validateImport(kind, rawRows, state);
      setResults(checked);
      const accepted = checked.filter(result => !result.errors.length && result.record);
      if (!accepted.length) throw new Error('No valid rows remain. Review the validation errors before importing.');
      let completed = 0;
      if (kind === 'discounts') {
        actions.saveRules(accepted.map(row => row.record as DiscountRule), `Imported ${accepted.length} product discounts from ${filename}`);
        completed = accepted.length;
      } else if (kind === 'rates') {
        const rates = { ...Object.fromEntries(state.products.map(p => [p.id, p.rate])), ...[...state.rateVersions].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.rates };
        accepted.forEach(row => { const record = row.record as { productId: string; rate: number | null }; rates[record.productId] = record.rate; });
        const effectiveDate = (accepted[0].record as { effectiveDate: string }).effectiveDate;
        actions.addRateVersion({ id: uid('rates'), name: `Rate list · ${shortDate(effectiveDate)}`, effectiveDate, rates, createdAt: new Date().toISOString() });
        completed = accepted.length;
      } else {
        accepted.forEach(row => {
          try {
            if (kind === 'products') actions.saveProduct(row.record as Product);
            if (kind === 'customers') actions.saveCustomer(row.record as Customer);
            if (kind === 'suppliers') actions.saveSupplier(row.record as Supplier);
            completed++;
          } catch (cause) { row.errors.push(getError(cause)); }
        });
        setResults([...checked]);
      }
      const rejected = checked.filter(row => row.errors.length).length;
      const summary = `${number(completed)} rows imported${rejected ? `; ${number(rejected)} rows rejected` : ''}.`;
      setApplied(true); setImportSummary(summary); notify(summary, completed ? 'success' : 'error');
    } catch (cause) { setError(getError(cause)); }
    finally { setBusy(false); }
  }
  async function readBackup(file?: File) {
    if (!file) return;
    try {
      const candidate = await parseWorkspaceBackup(file);
      setBackup(candidate);
    } catch (cause) { notify(getError(cause), 'error'); }
    if (backupInput.current) backupInput.current.value = '';
  }

  return <div className="page-stack transfers-page">
    <PageHeader eyebrow="WORKSPACE DATA" title="Bring everything together." description="Move your catalog and customer product discounts in and out of your workspace." />
    <div className="transfer-navigation" role="tablist" aria-label="Data tools"><button type="button" role="tab" aria-selected={tab === 'import'} className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}><Upload size={16} /> Import data</button><button type="button" role="tab" aria-selected={tab === 'export'} className={tab === 'export' ? 'active' : ''} onClick={() => setTab('export')}><ArrowDownToLine size={16} /> Export & backup</button><button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={16} /> Rate list history <span>{state.rateVersions.length}</span></button></div>
    {tab === 'import' && <>
      <div className="transfer-steps"><span className="complete"><i>1</i> Choose your data</span><ChevronRight size={14} /><span className={results.length ? 'complete' : ''}><i>2</i> Upload & review</span><ChevronRight size={14} /><span className={applied ? 'complete' : ''}><i>{applied ? <Check size={13} /> : 3}</i> Apply changes</span></div>
      <div className="transfer-destinations">{destinations.map(({ key, title, detail, icon: Icon }) => <button type="button" key={key} className={kind === key ? 'selected' : ''} onClick={() => { setKind(key); resetFile(); }} aria-pressed={kind === key}><span className="destination-icon"><Icon size={20} /></span><span><strong>{title}</strong><small>{detail}</small></span>{kind === key && <CheckCircle2 size={16} className="destination-check" />}</button>)}</div>
      <div className="transfer-work-grid">
        <section className="card"><div className="card-header"><div><h2>Import {selected.title.toLowerCase()}</h2><p className="text-small text-muted">Upload a spreadsheet, review every row, then apply your changes.</p></div><Badge tone="gray">CSV or XLSX</Badge></div><div className="card-body">
          <input ref={fileInput} type="file" accept=".csv,.xlsx" className="sr-only" tabIndex={-1} onChange={e => readFile(e.target.files?.[0])} />
          <button type="button" className={`transfer-dropzone ${busy ? 'busy' : ''}`} disabled={busy || !permitted} onClick={() => fileInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (permitted && !busy) readFile(e.dataTransfer.files[0]); }}><span className="transfer-upload-icon">{filename ? <FileCheck2 size={28} /> : <FileUp size={28} />}</span><strong>{busy ? 'Reading your spreadsheet…' : filename || 'Choose a file or drop it here'}</strong><span>{filename ? `${number(rawRows.length)} data rows found · Click to choose another file` : 'Excel workbooks and UTF-8 CSV files, up to 10 MB'}</span>{!filename && <span className="transfer-browse">Browse files <ArrowRight size={14} /></span>}</button>
          {!permitted && <div className="transfer-inline-info"><ShieldCheck size={17} /><span>Importing is unavailable for this session. You can still review and export data.</span></div>}
          {error && <div className="error-message" role="alert">{error}</div>}
          {importSummary && <div className="transfer-success" role="status"><CheckCircle2 size={19} /><div><strong>{importSummary}</strong><span>Existing invoices retain their original prices and discounts.</span></div></div>}
          <div className="transfer-template-row"><span><FileSpreadsheet size={17} /> Start with the right columns</span><div className="row"><Button variant="ghost" size="sm" onClick={() => downloadTemplate('csv')}>CSV template <ArrowDownToLine size={14} /></Button><Button variant="ghost" size="sm" onClick={() => downloadTemplate('xlsx')}>Excel template <ArrowDownToLine size={14} /></Button></div></div>
        </div></section>
        <aside className="card transfer-guide"><div className="card-body"><div className="transfer-guide-heading"><ShieldCheck size={20} /><h2>Checked before it changes</h2></div><ul><li><Check size={14} /> Known customer, product, and brand codes</li><li><Check size={14} /> Duplicate records and overlapping dates</li><li><Check size={14} /> Discount percentages from 0 to 100</li><li><Check size={14} /> Clear errors beside each rejected row</li></ul><div className="transfer-guide-note"><Info size={16} /><p>Only valid rows are applied. Existing codes update their matching records. Invalid rows stay out of your workspace.</p></div>{kind === 'discounts' && <p className="text-small text-muted">Use <code>customerCode</code> and <code>productCode</code> to identify each discount. Set <code>discountPercent</code> from 0 to 100. Each row changes one product for one customer.</p>}{kind === 'rates' && <p className="text-small text-muted">Use one new effective date. Products absent from the file retain their previous rate. Customer product discounts and existing invoices stay unchanged.</p>}{kind === 'customers' && <p className="text-small text-muted">The optional <code>sample</code> column accepts true or false. Leaving it blank preserves an existing record?s sample status. Use false only for real supplied customer data.</p>}{kind === 'products' && <p className="text-small text-muted">Source rates are selling prices, not costs. Leave unavailable rates blank and mark those products Inactive. Supplier names must already exist.</p>}<p className="text-small text-muted">Dates: <code>YYYY-MM-DD</code>. Percentages: <code>0–100</code>. </p></div></aside>
      </div>
      {results.length > 0 && <section className="card"><div className="card-header"><div><h2>Review your import</h2><p className="text-small text-muted">{filename} · {number(results.length)} rows checked</p></div><div className="row">{invalid.length > 0 && <Button size="sm" variant="secondary" onClick={() => exportSpreadsheet('zahra-plast-import-errors', invalid.map(r => ({ row: r.row, ...r.data, errors: r.errors.join('; ') })), 'csv').catch(cause => notify(getError(cause), 'error'))}><ArrowDownToLine size={14} /> Error log</Button>}<Button size="sm" variant="primary" disabled={!valid.length || applied || busy || !permitted} onClick={() => setConfirmOpen(true)}>{applied ? <Check size={15} /> : <Upload size={15} />}{applied ? 'Import complete' : `Apply ${number(valid.length)} valid rows`}</Button></div></div>
        <div className="transfer-result-tabs" role="group" aria-label="Filter validation results"><button type="button" className={previewFilter === 'all' ? 'active' : ''} onClick={() => { setPreviewFilter('all'); setPage(1); }}>All rows <span>{results.length}</span></button><button type="button" className={previewFilter === 'valid' ? 'active' : ''} onClick={() => { setPreviewFilter('valid'); setPage(1); }}><CheckCircle2 size={14} /> Valid <span>{valid.length}</span></button><button type="button" className={previewFilter === 'invalid' ? 'active' : ''} onClick={() => { setPreviewFilter('invalid'); setPage(1); }}><XCircle size={14} /> Needs attention <span>{invalid.length}</span></button></div>
        <div className="table-wrap"><table className="data-table transfer-preview"><thead><tr><th>Row</th><th>Record</th><th>Details</th><th>Validation</th></tr></thead><tbody>{preview.slice((page - 1) * 10, page * 10).map(result => <tr key={result.row}><td className="text-muted">{result.row}</td><td><div className="font-medium">{String(result.data.name || result.data.customerCode || result.data.productCode || result.data.code || 'Unnamed row')}</div><span className="text-small text-muted">{String(result.data.code || result.data.productCode || result.data.target || result.data.brand || '')}</span></td><td><div className="transfer-row-data">{Object.entries(result.data).slice(0, 5).map(([key, value]) => <span key={key}><span className="text-muted">{key}: </span>{String(value ?? '—')}</span>)}</div></td><td>{result.errors.length ? <div className="transfer-row-errors"><Badge tone="red">Rejected</Badge>{result.errors.map((message, index) => <span key={index}>{message}</span>)}</div> : <Badge tone="green">{applied ? 'Imported' : 'Ready to import'}</Badge>}</td></tr>)}</tbody></table></div>
        {!preview.length && <EmptyState icon={CheckCircle2} title="No rows in this view" description="Choose another validation filter to review the file." />}
        <div className="pagination"><span className="text-small text-muted">Showing {preview.length ? (page - 1) * 10 + 1 : 0}–{Math.min(page * 10, preview.length)} of {number(preview.length)} rows</span><div className="row"><Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page * 10 >= preview.length} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>
      </section>}
    </>}
    {tab === 'export' && <>
      {pdfProgress && <div className="transfer-inline-info" role="status"><FileText size={17} /><span>{pdfProgress}</span></div>}
      <div className="transfer-export-grid">{destinations.map(({ key, title, detail, icon: Icon }) => {
        const count = key === 'products' || key === 'rates' ? state.products.length : key === 'customers' ? state.customers.length : key === 'suppliers' ? state.suppliers.length : state.rules.filter(rule => rule.scope === 'product' && rule.type === 'percentage').length;
        return <section className="card transfer-export-card" key={key}><div className="transfer-export-icon"><Icon size={23} /></div><h2>{key === 'rates' ? 'Current rate list' : title}</h2><p className="text-small text-muted">{detail}</p><div className="transfer-export-count"><strong>{number(count)}</strong><span>records</span></div><div className="row"><Button size="sm" variant="secondary" disabled={busy} onClick={() => exportPdf(key)}><FileText size={14} /> PDF</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => exportData(key, 'xlsx')}><FileSpreadsheet size={14} /> Excel</Button></div></section>;
      })}<section className="card transfer-export-card"><div className="transfer-export-icon"><Tag size={23} /></div><h2>Complete customer matrix</h2><p className="text-small text-muted">Resolved prices for every customer and product</p><div className="transfer-export-count"><strong>{number(state.customers.length * state.products.length)}</strong><span>combinations</span></div><div className="row"><Button size="sm" variant="secondary" disabled={busy} onClick={() => exportPdf('matrix')}><FileText size={14} /> PDF</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => exportCompleteMatrix('xlsx')}><FileSpreadsheet size={14} /> Excel</Button></div></section></div>
      <section className="card"><div className="card-header"><div><h2>Keep a copy of your workspace</h2><p className="text-small text-muted">A complete backup includes all masters, product discounts, documents, settings, and pricing history.</p></div><Database size={22} /></div><div className="card-body transfer-backup-actions"><div><strong>Workspace backup</strong><p className="text-small text-muted">Save a JSON file before clearing browser data or moving to another device.</p></div><Button variant="primary" onClick={() => downloadText('zahra-plast-workspace-backup.json', JSON.stringify(state), 'application/json')}><ArrowDownToLine size={16} /> Download backup</Button></div><div className="card-body transfer-backup-actions transfer-restore"><div><strong>Restore a previous backup</strong><p className="text-small text-muted">Restore a JSON backup up to 100 MB. Download your current backup before replacing it.</p></div><Button variant="secondary" disabled={!can('settings')} onClick={() => backupInput.current?.click()}><RotateCcw size={15} /> Restore backup</Button><input type="file" className="sr-only" tabIndex={-1} ref={backupInput} accept=".json" onChange={e => readBackup(e.target.files?.[0])} /></div></section>
      <div className="transfer-inline-info"><Info size={17} /><span>Product and supplier names come from the source catalog. Customer records and product discounts marked sample are demonstration data.</span></div>
    </>}
    {tab === 'history' && <section className="card"><div className="card-header"><div><h2>Rate list versions</h2><p className="text-small text-muted">Invoices use the rate list effective on their date. Issued documents retain their original rates.</p></div><Button size="sm" variant="primary" disabled={!can('masters')} onClick={() => { setTab('import'); setKind('rates'); resetFile(); }}><Upload size={15} /> Import new version</Button></div><div className="transfer-rate-history">{[...state.rateVersions].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).map((version, index) => <div className="transfer-rate-version" key={version.id}><div className="transfer-version-marker"><History size={19} /></div><div className="transfer-version-info"><div className="row"><h3>{version.name}</h3>{index === 0 && <Badge tone="green">Latest version</Badge>}</div><p className="text-small text-muted">Effective {shortDate(version.effectiveDate)} · {Object.keys(version.rates).length} products · Added {shortDate(version.createdAt)}</p><span className="text-small">{Object.values(version.rates).filter(r => r !== null).length} numeric prices · {Object.values(version.rates).filter(r => r === null).length} unavailable</span></div><Button size="sm" variant="secondary" disabled={busy} onClick={() => exportSpreadsheet(`rate-list-${version.effectiveDate}`, state.products.map(p => ({ productCode: p.code, name: p.name, brand: p.brand, rate: version.rates[p.id] ?? null, effectiveDate: version.effectiveDate })), 'xlsx').catch(cause => notify(getError(cause), 'error'))}><ArrowDownToLine size={15} /> Export</Button></div>)}</div>{!state.rateVersions.length && <EmptyState icon={History} title="No rate lists yet" description="Import the first effective-dated rate list to get started." />}</section>}

    <Modal title="Apply validated rows?" description={`${number(valid.length)} ${selected.title.toLowerCase()} rows are ready. Review this summary before changing your workspace.`} open={confirmOpen} onClose={() => setConfirmOpen(false)} footer={<><Button variant="secondary" onClick={() => setConfirmOpen(false)}>Keep reviewing</Button><Button variant="primary" onClick={applyImport}>Apply {number(valid.length)} rows</Button></>}><div className="stack"><div className="transfer-confirm-counts"><div><CheckCircle2 size={19} /><strong>{valid.length}</strong><span>Valid rows</span></div><div><XCircle size={19} /><strong>{invalid.length}</strong><span>Rejected rows</span></div></div><p className="text-small text-muted">{kind === 'discounts' ? 'Valid product discounts apply immediately to the listed customer and product. Changes are recorded in the activity log.' : 'New codes create records. Existing codes update matching records. Changes are recorded in the audit log.'} Invalid rows will not be applied.</p>{kind === 'rates' && <p className="text-small text-muted">A new rate version will be added. Existing invoice snapshots and customer product discounts remain intact.</p>}</div></Modal>
    <Modal title="Restore this workspace backup?" description="This replaces the data currently stored in this browser." open={Boolean(backup)} onClose={() => setBackup(null)} footer={<><Button variant="secondary" onClick={() => setBackup(null)}>Cancel</Button><Button variant="danger" onClick={() => { try { if (backup) actions.restoreBackup(backup); setBackup(null); resetFile(); notify('Workspace restored from backup.', 'success'); } catch (cause) { notify(getError(cause), 'error'); } }}>Restore workspace</Button></>}><p>The selected backup contains <strong>{backup?.products.length} products</strong>, <strong>{backup?.customers.length} customers</strong>, <strong>{backup?.rules.filter(rule => rule.scope === 'product' && rule.type === 'percentage').length} product discounts</strong>, and <strong>{backup?.documents.length} documents</strong>. Your current data will be replaced.</p></Modal>
  </div>;
}
