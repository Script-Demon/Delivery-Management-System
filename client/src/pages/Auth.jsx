import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorText } from '../api.js';
import { useSession, homePath } from '../session.jsx';
import { VEHICLE_ICONS } from '../format.js';

const DEMO = [
  ['Customer', 'customer@demo.com', 'customer123'],
  ['Agent', 'agent@demo.com', 'agent123'],
  ['Admin', 'admin@demo.com', 'admin123'],
];

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card stack">
        <div className="brand" style={{ padding: 0, justifyContent: 'center' }}>
          <span className="brand-mark" aria-hidden>🚚</span> Dispatch
        </div>
        <div className="card stack">
          <div>
            <h1>{title}</h1>
            <p className="secondary" style={{ marginTop: 4 }}>{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(creds) {
    setBusy(true);
    setError(null);
    try {
      const res = await api('/auth/login', { method: 'POST', body: creds });
      signIn(res);
      navigate(homePath(res.user.role), { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Manage deliveries, jobs and your fleet.">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(form); }}>
        {error && <div className="alert error">{error}</div>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button className="btn primary lg block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="divider" />
      <div className="stack-sm">
        <span className="label">Try a demo account</span>
        <div className="demo-accounts">
          {DEMO.map(([role, email, password]) => (
            <button key={role} className="btn sm" disabled={busy} onClick={() => submit({ email, password })}>{role}</button>
          ))}
        </div>
      </div>
      <p className="secondary small">New here? <Link to="/register">Create an account</Link></p>
    </AuthShell>
  );
}

export function Register() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'customer', vehicleType: 'motorbike' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api('/auth/register', { method: 'POST', body: form });
      signIn(res);
      navigate(res.user.role === 'customer' ? '/addresses' : homePath(res.user.role), { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create an account" subtitle="Send deliveries, or sign up to deliver them.">
      <form className="stack" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <div className="choice-grid">
          {[['customer', '📦', 'I send deliveries'], ['agent', '🛵', 'I deliver']].map(([role, icon, text]) => (
            <button type="button" key={role} className={`choice ${form.role === role ? 'on' : ''}`} onClick={() => setForm({ ...form, role })}>
              <span className="big" aria-hidden>{icon}</span>
              <b>{text}</b>
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" className="input" required value={form.name} onChange={set('name')} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required value={form.email} onChange={set('email')} />
          </div>
          <div className="field">
            <label htmlFor="phone">Mobile number{form.role === 'agent' ? '' : ' (optional)'}</label>
            <input id="phone" className="input" type="tel" placeholder="01XXXXXXXXX" required={form.role === 'agent'} value={form.phone} onChange={set('phone')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" minLength={6} required value={form.password} onChange={set('password')} />
          <span className="hint">At least 6 characters.</span>
        </div>
        {form.role === 'agent' && (
          <div className="field">
            <label htmlFor="vehicle">Vehicle</label>
            <select id="vehicle" className="input" value={form.vehicleType} onChange={set('vehicleType')}>
              {Object.entries(VEHICLE_ICONS).map(([v, i]) => <option key={v} value={v}>{i} {v[0].toUpperCase() + v.slice(1)}</option>)}
            </select>
          </div>
        )}
        <button className="btn primary lg block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="secondary small">Already have an account? <Link to="/login">Sign in</Link></p>
    </AuthShell>
  );
}
