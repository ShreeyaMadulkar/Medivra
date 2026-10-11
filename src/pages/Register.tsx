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
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const x: Record<string, string> = {};
    if (!f.name.trim()) x.name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) x.email = 'Enter a valid email address.';
    if (!/^[+\d][\d\s-]{7,}$/.test(f.phone)) x.phone = 'Enter a valid phone number.';
    if (!f.organization.trim()) x.organization = 'Enter your organization.';
    if (!passwordValid(f.password)) x.password = 'Password does not meet all requirements.';
    if (f.password !== f.confirm) x.confirm = 'Passwords do not match.';
    setErr(x);
    if (Object.keys(x).length) return;
    // BACKEND: send the password over HTTPS only; the server hashes it (SHA-512 + salt) before storing. It is never kept in the frontend.
    const r = register({ name: f.name.trim(), email: f.email, phone: f.phone, organization: f.organization.trim(), role: f.role });
    if (!r.ok) return setErr({ email: r.message });
    notify(r.message);
    nav('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex justify-center"><Link to="/"><Logo size={34} /></Link></div>
        <div className="rounded-lg border border-line bg-white p-8 shadow-card">
          <h1 className="text-2xl font-semibold">Create your account</h1>
          <p className="mt-1 text-sm text-ink-soft">For distributors and pharmacies. Administrator accounts are created by Medivra staff.</p>
          <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Full name" error={err.name}><input className="input" value={f.name} onChange={set('name')} /></Field>
            <Field label="Email" error={err.email}><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Phone number" error={err.phone}><input className="input" value={f.phone} onChange={set('phone')} placeholder="+91 98765 43210" /></Field>
            <Field label="Organization" error={err.organization}><input className="input" value={f.organization} onChange={set('organization')} placeholder="e.g. Apollo Pharmacy" /></Field>
            <Field label="Role">
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
            <div className="flex items-start gap-2.5 rounded-md bg-primary-50 px-3.5 py-3 text-sm text-ink-soft sm:col-span-2">
              <ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary" />
              <span>Your password will be securely protected. Hashing is applied on the server once the backend is connected.</span>
            </div>
            <button className="btn btn-primary sm:col-span-2">Create account</button>
          </form>
          <p className="mt-5 text-center text-sm text-ink-soft">Already registered? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link></p>
        </div>
      </div>
    </div>
  );
}
