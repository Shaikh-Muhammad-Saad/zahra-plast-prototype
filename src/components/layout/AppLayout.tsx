import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, Users, Factory, SlidersHorizontal, FileText, ReceiptText, ChartNoAxesCombined, History, ArrowLeftRight, ChevronDown, Menu, X, CheckCheck, Leaf, LogOut } from 'lucide-react';
import { useApp } from '../../state/AppProvider';
import { initials } from '../../lib/format';
import { useAuth } from '../../modules/auth/AuthProvider';

const navigation = [
  { label: 'WORKSPACE', items: [{ to: '/', label: 'Overview', icon: LayoutDashboard }, { to: '/products', label: 'Product catalog', icon: Package }, { to: '/customers', label: 'Customers', icon: Users }, { to: '/suppliers', label: 'Suppliers & brands', icon: Factory }] },
  { label: 'SALES & PRICING', items: [{ to: '/pricing', label: 'Discount matrix', icon: SlidersHorizontal }, { to: '/quotes', label: 'Quotations', icon: FileText }, { to: '/invoices', label: 'Invoices', icon: ReceiptText }] },
  { label: 'INSIGHTS', items: [{ to: '/reports', label: 'Reports & analytics', icon: ChartNoAxesCombined }, { to: '/audit', label: 'Activity log', icon: History }] },
];
export default function AppLayout() {
  const { state, user, notifications, dismissNotification, storageStatus, storageError } = useApp();
  const { logout } = useAuth();
  const location = useLocation(); const navigate = useNavigate();
  const [mobile, setMobile] = useState(false);
  useEffect(() => { setMobile(false); }, [location.pathname]);
  const active = [...navigation.flatMap(group => group.items), { to: '/transfers', label: 'Import & export' }].find(item => item.to === location.pathname)?.label || 'Workspace';
  return <div className="app-shell"><a href="#main-content" className="skip-link">Skip to content</a>{mobile && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside className={`sidebar ${mobile ? 'sidebar-open' : ''}`}><NavLink to="/" className="brand"><span className="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 8h18L8 24h17M9 16h15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>Zahra Plast<small>BUSINESS WORKSPACE</small></span></NavLink>
      <nav className="sidebar-nav" aria-label="Main navigation">{navigation.map(group => <div className="nav-group" key={group.label}><p className="nav-label">{group.label}</p>{group.items.map(item => <NavLink end={item.to === '/'} key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><item.icon size={18} strokeWidth={1.7} /><span>{item.label}</span>{item.to === '/products' && <span className="nav-count">{state.products.length}</span>}{item.to === '/invoices' && <span className="nav-count">{state.documents.filter(d => d.kind === 'Invoice' && d.status === 'Draft').length}</span>}</NavLink>)}</div>)}</nav>
      <div className="sidebar-bottom"><NavLink to="/transfers" className="nav-item"><ArrowLeftRight size={18} />Import & export</NavLink></div>
    </aside>
    <div className="app-body"><header className="topbar">
      <div className="row"><button className="icon-button menu-toggle" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={22} /></button><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{active}</strong></div></div>
      <div className="topbar-actions"><details className="account-menu"><summary aria-label="Account menu"><span className="avatar avatar-green">{initials(user.name)}</span><span className="account-name"><strong>{user.name}</strong><small>{user.email}</small></span><ChevronDown size={15} /></summary><div className="account-dropdown"><button type="button" onClick={() => { logout(); navigate('/login', { replace: true }); }}><LogOut size={17} /><span>Log out</span></button></div></details></div>
    </header>
      <main id="main-content" className="main-content" tabIndex={-1}><div className="sr-only" role="status">Workspace storage: {storageStatus}</div>{storageError && <div className="error-message storage-warning" role="alert">{storageError}</div>}<Outlet /></main><footer className="app-footer"><span>© {new Date().getFullYear()} Zahra Plast</span><span><Leaf size={13} /> Thoughtfully organized. Ready for business.</span></footer>
    </div>
    <div className="toast-stack" aria-live="polite">{notifications.map(n => <div className={`toast toast-${n.tone}`} key={n.id}><CheckCheck size={19} /><span>{n.message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => dismissNotification(n.id)}><X size={16} /></button></div>)}</div>
  </div>;
}
