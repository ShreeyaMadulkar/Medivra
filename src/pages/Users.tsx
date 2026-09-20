import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Role, User, UserStatus } from '../types';
import { useApp } from '../store';
import { Card, Field, Modal, PageHeader, RoleBadge, StatusBadge } from '../components/ui';
import { fmtDateTime } from '../lib/utils';

type Draft = Omit<User, 'id' | 'lastLogin'> & { id?: string; lastLogin?: string | null };
const EMPTY: Draft = { name: '', email: '', phone: '', organization: '', role: 'DISTRIBUTOR', status: 'Active' };

export default function Users() {
  const { user, users, addUser, updateUser, notify } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const x: Record<string, string> = {};
    if (!draft.name.trim()) x.name = 'Enter a name.';
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) x.email = 'Enter a valid email.';
    if (!draft.organization.trim()) x.organization = 'Enter an organization.';
    if (users.some((u) => u.id !== draft.id && u.email.toLowerCase() === draft.email.toLowerCase())) x.email = 'This email is already in use.';
    setErr(x);
    if (Object.keys(x).length) return;
    if (draft.id) { updateUser(draft as User); notify('User account updated.'); }
    else { addUser(draft); notify('User account created.'); }
    setDraft(null);
  };

  const toggle = (u: User) => {
    if (u.id === user?.id) return notify('You cannot disable your own account.');
    const status: UserStatus = u.status === 'Active' ? 'Inactive' : 'Active';
    updateUser({ ...u, status });
    notify(`${u.name} is now ${status.toLowerCase()}.`);
  };

  return (
    <>
      <PageHeader title="User management" subtitle={`${users.length} accounts across distributors, pharmacies and administrators.`}
        actions={<button className="btn btn-primary" onClick={() => { setErr({}); setDraft(EMPTY); }}><Plus size={16} /> Add User</button>} />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>User ID</th><th>Name</th><th>Email</th><th>Organization</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="text-ink-soft">{u.id}</td><td className="font-medium">{u.name}</td><td>{u.email}</td><td>{u.organization}</td>
                  <td><RoleBadge role={u.role} /></td><td><StatusBadge status={u.status} /></td><td>{fmtDateTime(u.lastLogin)}</td>
                  <td>
                    <div className="flex gap-3 text-xs font-medium">
                      <button className="text-primary hover:underline" onClick={() => { setErr({}); setDraft(u); }}>Edit</button>
                      <button className={u.status === 'Active' ? 'text-danger hover:underline' : 'text-success hover:underline'} onClick={() => toggle(u)}>
                        {u.status === 'Active' ? 'Disable' : u.status === 'Locked' ? 'Unlock' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {draft && (
        <Modal title={draft.id ? `Edit ${draft.name}` : 'Add user'} onClose={() => setDraft(null)}>
          <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={err.name}><input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Email" error={err.email}><input className="input" value={draft.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Organization" error={err.organization}><input className="input" value={draft.organization} onChange={(e) => set('organization', e.target.value)} /></Field>
            <Field label="Phone"><input className="input" value={draft.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Role">
              <select className="input" value={draft.role} onChange={(e) => set('role', e.target.value as Role)}>
                <option value="ADMIN">Admin</option><option value="DISTRIBUTOR">Distributor</option><option value="PHARMACY">Pharmacy</option>
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={draft.status} onChange={(e) => set('status', e.target.value)}>
                <option>Active</option><option>Inactive</option><option>Locked</option>
              </select>
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn btn-primary">{draft.id ? 'Save changes' : 'Add user'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
