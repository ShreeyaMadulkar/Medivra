import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Circle, ShieldCheck } from 'lucide-react';
import type { Role } from '../types';
import { useApp } from '../store';
import { Field, Logo } from '../components/ui';
import { PASSWORD_RULES, passwordValid } from '../services/security';

export default function Register() {
  const { register, notify } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', confirm: '', organization: '', role: 'DISTRIBUTOR' as Role });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    // Same rules as the server (server/src/validation/auth.schemas.js); the server re-checks everything.
    const x: Record<string, string> = {};
    const name = f.name.trim().replace(/\s+/g, ' ');
    const organization = f.organization.trim().replace(/\s+/g, ' ');
    const email = f.email.trim();
    const phone = f.phone.trim();
    if (name.length < 2) x.name = 'Enter your full name.';
    else if (name.length > 100) x.name = 'Name is too long.';
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) x.email = 'Enter a valid email address.';
    if (!/^[+\d][\d\s-]{7,}$/.test(phone) || phone.length > 20) x.phone = 'Enter a valid phone number.';
    if (organization.length < 2) x.organization = 'Enter your organization.';
    else if (organization.length > 150) x.organization = 'Organization name is too long.';
    if (f.role !== 'DISTRIBUTOR' && f.role !== 'PHARMACY') x.role = 'Choose Distributor or Pharmacy.';
    if (!passwordValid(f.password) || f.password.length > 128) x.password = 'Password does not meet all requirements.';
    if (f.password !== f.confirm) x.confirm = 'Passwords do not match.';
    setErr(x);
    setFormError(null);
    if (Object.keys(x).length) return;
    // The password goes to the API over HTTPS in production; the server hashes it (SHA-512 + salt). It is never stored in the frontend.
    setBusy(true);
    const r = await register({ name, email, phone, organization, role: f.role, password: f.password });
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'EMAIL_EXISTS') return setErr({ email: r.message });
      if (r.code === 'ORGANIZATION_EXISTS') return setErr({ organization: r.message });
      if (r.fieldErrors) {
        const known = new Set(['name', 'email', 'phone', 'organization', 'role', 'password']);
        const mine: Record<string, string> = {};
        for (const [k, v] of Object.entries(r.fieldErrors)) if (known.has(k)) mine[k] = String(v);
        if (Object.keys(mine).length) return setErr(mine);
      }
      return setFormError(r.message); // network problems, rate limiting, unexpected errors: shown on the form, not just a toast
    }
    notify(r.message);
    nav('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex justify-center"><Link to="/"><Logo size={34} /></Link></div>
        <div className="rounded-lg border border-line bg-white p-8 shadow-card">
          <h1 className="text-2xl font-semibold">Create your account</h1>
          {formError && <div role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{formError}</div>}
          <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Full name" error={err.name}><input className="input" value={f.name} onChange={set('name')} /></Field>
            <Field label="Email" error={err.email}><input className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Phone number" error={err.phone}><input className="input" value={f.phone} onChange={set('phone')} placeholder="+91 98765 43210" /></Field>
            <Field label="Organization" error={err.organization}><input className="input" value={f.organization} onChange={set('organization')} placeholder="e.g. Apollo Pharmacy" /></Field>
            <Field label="Role" error={err.role}>
              <select className="input" value={f.role} onChange={set('role')}>
                <option value="DISTRIBUTOR">Distributor</option>
                <option value="PHARMACY">Pharmacy</option>
              </select>
            </Field>
            <div className="hidden sm:block" />
            <Field label="Password" error={err.password}><input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
            <Field label="Confirm password" error={err.confirm}><input className="input" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>

            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:col-span-2">
              {PASSWORD_RULES.map((r) => {
                const ok = r.test(f.password);
                return (
                  <li key={r.id} className={`flex items-center gap-2 ${ok ? 'text-success' : 'text-ink-soft'}`}>
                    {ok ? <Check size={15} /> : <Circle size={15} />} {r.label}
                  </li>
                );
              })}
            </ul>
            <button className="btn btn-primary sm:col-span-2" disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</button>
          </form>
          <p className="mt-5 text-center text-sm text-ink-soft">Already registered? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link></p>
        </div>
      </div>
    </div>
  );
}
