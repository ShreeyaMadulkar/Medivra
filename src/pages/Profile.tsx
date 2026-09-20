import { useState } from 'react';
import { Check, Circle, Laptop, Tablet } from 'lucide-react';
import { useApp } from '../store';
import { Card, CardHeader, Field, Modal, PageHeader, RoleBadge, StatusBadge } from '../components/ui';
import { fmtDateTime, initials } from '../lib/utils';
import { PASSWORD_RULES, passwordValid } from '../services/security';

export default function Profile() {
  const { user, updateOwnProfile, log, notify, resetDemo } = useApp();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState('');
  const [sessions, setSessions] = useState([{ id: 1, device: 'This device', detail: 'Current browser session', current: true }, { id: 2, device: 'Tablet', detail: 'Last active yesterday', current: false }]);
  if (!user) return null;

  const save = () => {
    if (!name.trim()) return;
    updateOwnProfile({ name: name.trim(), phone });
    setEdit(false);
    notify('Profile updated.');
  };

  const changePw = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.current) return setPwErr('Enter your current password.');
    if (!passwordValid(pw.next)) return setPwErr('The new password does not meet all requirements.');
    if (pw.next !== pw.confirm) return setPwErr('Passwords do not match.');
    // BACKEND: PATCH /api/auth/password - server verifies the current password, hashes the new one (SHA-512) and stores it.
    log('Password change requested');
    setPwOpen(false); setPw({ current: '', next: '', confirm: '' }); setPwErr('');
    notify('Password change recorded. The backend will apply it once connected.');
  };

  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col items-center px-6 py-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-100 text-2xl font-semibold text-primary">{initials(user.name)}</div>
          <h2 className="mt-4 text-lg font-semibold">{user.name}</h2>
          <p className="text-sm text-ink-soft">{user.organization}</p>
          <div className="mt-3"><RoleBadge role={user.role} /></div>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Personal information" action={!edit ? <button className="text-sm font-medium text-primary hover:underline" onClick={() => setEdit(true)}>Edit</button> : undefined} />
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <Field label="Name"><input className="input" value={edit ? name : user.name} disabled={!edit} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Email"><input className="input" value={user.email} disabled /></Field>
              <Field label="Organization"><input className="input" value={user.organization} disabled /></Field>
              <Field label="Phone"><input className="input" value={edit ? phone : user.phone} disabled={!edit} onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field label="Role"><input className="input" value={user.role} disabled /></Field>
              {edit && <div className="flex items-end gap-2"><button className="btn btn-primary" onClick={save}>Save changes</button><button className="btn btn-secondary" onClick={() => { setEdit(false); setName(user.name); setPhone(user.phone); }}>Cancel</button></div>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Security" />
            <div className="divide-y divide-line">
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div><p className="text-sm font-medium">Password</p><p className="text-xs text-ink-soft">Choose a strong password you do not use elsewhere.</p></div>
                <button className="btn btn-secondary btn-sm" onClick={() => setPwOpen(true)}>Change Password</button>
              </div>
              <div className="flex items-center justify-between px-5 py-4"><p className="text-sm font-medium">Last login</p><p className="text-sm text-ink-soft">{fmtDateTime(user.lastLogin)}</p></div>
              <div className="flex items-center justify-between px-5 py-4"><p className="text-sm font-medium">Account status</p><StatusBadge status={user.status} /></div>
              <div className="px-5 py-4">
                <p className="text-sm font-medium">Active sessions</p>
                <ul className="mt-3 space-y-2">
                  {sessions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        {s.current ? <Laptop size={18} className="text-primary" /> : <Tablet size={18} className="text-ink-soft" />}
                        <div><p className="text-sm font-medium">{s.device}</p><p className="text-xs text-ink-soft">{s.detail}</p></div>
                      </div>
                      {!s.current && <button className="text-xs font-medium text-danger hover:underline" onClick={() => { setSessions((p) => p.filter((x) => x.id !== s.id)); log('Session signed out'); notify('Session signed out.'); }}>Sign out</button>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-between rounded-lg border border-dashed border-line px-5 py-4">
            <p className="text-sm text-ink-soft">Prototype tools: restore the original demo data.</p>
            <button className="btn btn-secondary btn-sm" onClick={() => window.confirm('Reset all batches, transfers, users and activity to the demo data?') && resetDemo()}>Reset demo data</button>
          </div>
        </div>
      </div>

      {pwOpen && (
        <Modal title="Change password" onClose={() => setPwOpen(false)}>
          <form onSubmit={changePw} className="space-y-4" noValidate>
            <Field label="Current password"><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password"><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <ul className="grid grid-cols-2 gap-1.5 text-xs">
              {PASSWORD_RULES.map((r) => { const ok = r.test(pw.next); return <li key={r.id} className={`flex items-center gap-1.5 ${ok ? 'text-success' : 'text-ink-soft'}`}>{ok ? <Check size={13} /> : <Circle size={13} />}{r.label}</li>; })}
            </ul>
            <Field label="Confirm new password"><input className="input" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            {pwErr && <p className="text-sm text-danger">{pwErr}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary" onClick={() => setPwOpen(false)}>Cancel</button><button className="btn btn-primary">Update password</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
