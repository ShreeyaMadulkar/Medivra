import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, Eye, EyeOff, Lock, ShieldCheck, Store } from 'lucide-react';
import type { Role } from '../types';
import { useApp } from '../store';
import { Logo, Modal } from '../components/ui';
import { DEMO_PASSWORD } from '../services/security';

const ROLES: { id: Role; label: string; icon: typeof Lock }[] = [
  { id: 'ADMIN', label: 'Admin', icon: ShieldCheck },
  { id: 'DISTRIBUTOR', label: 'Distributor', icon: Building2 },
  { id: 'PHARMACY', label: 'Pharmacy', icon: Store },
];
const DEMO = [
  { role: 'ADMIN' as Role, email: 'admin@medivra.com', label: 'Admin' },
  { role: 'DISTRIBUTOR' as Role, email: 'john.smith@medivra.com', label: 'Distributor' },
  { role: 'PHARMACY' as Role, email: 'sarah.patel@apollopharmacy.com', label: 'Pharmacy' },
];

export default function Login() {
  const { user, login, lockRemaining, notify } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('DISTRIBUTOR');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (user) return <Navigate to="/" replace />;

  const remaining = lockRemaining(email);
  const locked = remaining > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    const r = login(email, password, role);
    if (r.ok) nav('/');
    else setError(r.message);
  };

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-primary-dark p-12 text-white lg:flex">
        <Logo light size={36} />
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight">Secure pharmaceutical supply, simplified.</h1>
          <p className="mt-4 max-w-md text-primary-100">
            Track batches, manage inventory and move stock from distributors to pharmacies with a clear record of every step.
          </p>
          <svg viewBox="0 0 420 120" className="mt-10 w-full max-w-md" aria-hidden="true">
            <g fill="none" stroke="#7FB3EA" strokeWidth="2">
              <path d="M70 60h100" strokeDasharray="5 6" />
              <path d="M250 60h100" strokeDasharray="5 6" />
            </g>
            {[{ x: 40, t: 'Distributor' }, { x: 210, t: 'Batch transfer' }, { x: 380, t: 'Pharmacy' }].map((n, i) => (
              <g key={n.t}>
                <circle cx={n.x} cy="60" r="26" fill={i === 1 ? '#00897B' : '#fff'} />
                <path d={`M${n.x - 7} 60h14M${n.x} 53v14`} stroke={i === 1 ? '#fff' : '#1565C0'} strokeWidth="4" strokeLinecap="round" />
                <text x={n.x} y="108" textAnchor="middle" fill="#D6E6F7" fontSize="12">{n.t}</text>
              </g>
            ))}
          </svg>
        </div>
        <p className="text-sm text-primary-100">Medivra</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-semibold">Sign in to Medivra</h2>
          <p className="mt-1 text-sm text-ink-soft">Secure Pharmaceutical Supply &amp; Transfer Management</p>

          {locked ? (
            <div role="alert" className="mt-6 flex gap-3 rounded-md border border-danger/30 bg-danger/5 p-3.5 text-sm text-danger">
              <Lock size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Too many failed attempts. Your account has been temporarily locked.</p>
                <p className="mt-0.5 text-danger/80">Try again in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}.</p>
              </div>
            </div>
          ) : (
            error && (
              <div role="alert" className="mt-6 flex gap-3 rounded-md border border-warning/40 bg-warning/10 p-3.5 text-sm text-amber-900">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <span className="label">Sign in as</span>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map(({ id, label, icon: Icon }) => (
                  <button type="button" key={id} onClick={() => setRole(id)} aria-pressed={role === id}
                    className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-sm font-medium transition-colors ${role === id ? 'border-primary bg-primary-50 text-primary' : 'border-line bg-white text-ink-soft hover:bg-canvas'}`}>
                    <Icon size={18} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="email">Email or username</label>
              <input id="email" className="input" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} autoComplete="username" required />
            </div>
            <div>
              <label className="label" htmlFor="pw">Password</label>
              <div className="relative">
                <input id="pw" className="input pr-10" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-soft hover:text-ink">
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <div className="text-right">
              <button type="button" onClick={() => setForgot(true)} className="text-sm font-medium text-primary hover:underline">Forgot password?</button>
            </div>
            <button className="btn btn-primary w-full py-2.5" disabled={locked}>Log in</button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-soft">
            New to Medivra? <Link to="/register" className="font-medium text-primary hover:underline">Register</Link>
          </p>

          <div className="mt-8 rounded-md border border-dashed border-line bg-white p-4">
            <p className="text-sm font-medium">Demo accounts</p>
            <div className="mt-3 flex gap-2">
              {DEMO.map((d) => (
                <button key={d.role} type="button" className="btn btn-secondary btn-sm flex-1"
                  onClick={() => { setRole(d.role); setEmail(d.email); setPassword(DEMO_PASSWORD); setError(null); }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {forgot && (
        <Modal title="Reset your password" onClose={() => setForgot(false)}>
          <p className="text-sm text-ink-soft">Enter your account email. Password reset emails will be sent by the backend once it is connected.</p>
          <input className="input mt-4" type="email" placeholder="you@organization.com" />
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setForgot(false)}>Close</button>
            <button className="btn btn-primary" onClick={() => { setForgot(false); notify('Password reset is not available yet.'); }}>Send reset link</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
