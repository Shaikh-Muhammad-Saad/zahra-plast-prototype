import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, Link } from 'react-router-dom';
import { AppProvider } from '../state/AppProvider';
import AppLayout from '../components/layout/AppLayout';
import { AuthProvider } from '../modules/auth/AuthProvider';
import ProtectedRoute from '../modules/auth/ProtectedRoute';
const DashboardPage = lazy(() => import('../modules/dashboard/DashboardPage'));
const CatalogPage = lazy(() => import('../modules/catalog/CatalogPage'));
const CustomersPage = lazy(() => import('../modules/customers/CustomersPage'));
const SuppliersPage = lazy(() => import('../modules/suppliers/SuppliersPage'));
const PricingPage = lazy(() => import('../modules/pricing/PricingPage'));
const SalesPage = lazy(() => import('../modules/sales/SalesPage'));
const ReportsPage = lazy(() => import('../modules/reports/ReportsPage'));
const AuditPage = lazy(() => import('../modules/audit/AuditPage'));
const TransfersPage = lazy(() => import('../modules/transfers/TransfersPage'));
const LoginPage = lazy(() => import('../modules/auth/LoginPage'));
export default function App() {
  return <BrowserRouter><AuthProvider><Suspense fallback={<div className="page-loading" role="status"><div className="loading-mark">Z</div><span>Opening your workspace…</span></div>}><Routes><Route path="/login" element={<LoginPage />} /><Route element={<ProtectedRoute />}><Route element={<AppProvider><AppLayout /></AppProvider>}><Route index element={<DashboardPage />} /><Route path="products" element={<CatalogPage />} /><Route path="customers" element={<CustomersPage />} /><Route path="suppliers" element={<SuppliersPage />} /><Route path="pricing" element={<PricingPage />} /><Route path="invoices" element={<SalesPage />} /><Route path="invoices/:id" element={<SalesPage />} /><Route path="quotes" element={<SalesPage kind="Quote" />} /><Route path="quotes/:id" element={<SalesPage kind="Quote" />} /><Route path="reports" element={<ReportsPage />} /><Route path="audit" element={<AuditPage />} /><Route path="transfers" element={<TransfersPage />} /><Route path="*" element={<div className="empty-state"><h1>Page not found</h1><p>Let’s get you back to your workspace.</p><Link className="button button-primary" to="/">Back to overview</Link></div>} /></Route></Route></Routes></Suspense></AuthProvider></BrowserRouter>;
}
