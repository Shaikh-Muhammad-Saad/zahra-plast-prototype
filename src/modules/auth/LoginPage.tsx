import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, Eye, EyeOff, Layers3, LockKeyhole, Mail, Package, ReceiptText } from 'lucide-react';
import { DEMO_ACCOUNT } from '../../../database/auth';
import { Button, Field } from '../../components/ui';
import { useAuth } from './AuthProvider';
import { loginDestination } from './session';
import './auth.css';

export default function LoginPage() {
  const { authenticated, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  if (authenticated) return <Navigate to={loginDestination(location.state?.from)} replace />;
  function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try { login(email, password); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to log in. Please try again.'); }
  }
  return <main className="auth-page">
    <section className="auth-story" aria-label="Zehra Plast workspace">
      <div className="auth-brand"><span className="auth-brand-symbol"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 8h18L8 24h17M9 16h15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>Zehra Plast<small>BUSINESS WORKSPACE</small></span></div>
      <div className="auth-story-content">
        <span className="auth-kicker"><span /> YOUR EVERYDAY BUSINESS, CONNECTED</span>
        <h1>Everything in place.<br /><em>Room to grow.</em></h1>
        <p>Bring your products, customer pricing, and daily billing into one organized workspace.</p>
        <div className="auth-workspace-card" aria-hidden="true">
          <div className="auth-card-heading"><span><Layers3 size={18} />A clearer working day</span><ArrowUpRight size={18} /></div>
          <div className="auth-feature-row"><span className="auth-feature-icon"><Package size={20} /></span><div><strong>Your product library</strong><small>Every product and price, together.</small></div><Check size={16} /></div>
          <div className="auth-feature-row"><span className="auth-feature-icon"><ReceiptText size={20} /></span><div><strong>From agreement to invoice</strong><small>Customer pricing that carries through.</small></div><Check size={16} /></div>
          <div className="auth-card-footer"><span className="auth-online-dot" />Built around the way you work</div>
        </div>
      </div>
      <p className="auth-story-footer">A little less admin. A little more clarity.</p>
    </section>
    <section className="auth-panel" aria-label="Log in">
      <div className="auth-form-wrap">
        <div className="auth-welcome-icon"><LockKeyhole size={25} /></div>
        <span className="auth-form-eyebrow">WELCOME BACK</span>
        <h2>Log in to your workspace</h2>
        <p className="auth-intro">Your business is ready when you are.</p>
        <form className="auth-form" onSubmit={submit}>
          <Field label="Email address"><div className="auth-input-wrap"><Mail size={19} aria-hidden="true" /><input className="input" type="email" name="email" autoComplete="username" required autoFocus placeholder="you@example.com" value={email} onChange={event => { setEmail(event.target.value); setError(''); }} aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} /></div></Field>
          <Field label="Password"><div className="auth-input-wrap"><LockKeyhole size={19} aria-hidden="true" /><input className="input" type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={event => { setPassword(event.target.value); setError(''); }} aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} /><button className="auth-password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>
          {error && <p className="error-message" id="login-error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" className="auth-submit">Log in<ArrowRight size={19} /></Button>
        </form>
        <div className="auth-demo-credentials"><div><span className="auth-demo-dot" /><strong>Demo login details</strong><span>Ready to try</span></div><dl><div><dt>Email</dt><dd><code>{DEMO_ACCOUNT.email}</code></dd></div><div><dt>Password</dt><dd><code>{DEMO_ACCOUNT.password}</code></dd></div></dl></div>
        <p className="auth-local-note">This frontend demo uses a local sign-in. Your workspace data stays in this browser.</p>
      </div>
      <p className="auth-panel-footer">&copy; {new Date().getFullYear()} Zehra Plast</p>
    </section>
  </main>;
}
