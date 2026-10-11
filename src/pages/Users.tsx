import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Role, User, UserStatus } from '../types';
import { useApp } from '../store';
import { Card, Field, Modal, PageHeader, RoleBadge, StatusBadge } from '../components/ui';
import { DISTRIBUTOR_ORGS, PHARMACY_ORGS } from '../data/mock';
import { fmtDateTime } from '../lib/utils';
import { isLastActiveAdmin } from '../lib/rbac';

type Draft = Omit<User, 'id' | 'lastLogin'> & { id?: string; lastLogin?: string | null };
const EMPTY: Draft = { name: '', email: '', phone: '', organization: '', organizationId: '', role: 'DISTRIBUTOR', status: 'Active' };
const ORG_OPTIONS = ['Medivra Systems', ...DISTRIBUTOR_ORGS, ...PHARMACY_ORGS];

export default function Users() {
  const { user, users, organizations, addUser, updateUser, notify } = useApp();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [k]: v, ...(k === 'organization' ? { organizationId: v } : {}) } : d));

  const rows = users.filter((u) =>
    (!role || u.role === role) && (!status || u.status === status) &&
    (!q || `${u.id} ${u.name} ${u.email} ${u.organization}`.toLowerCase().includes(q.toLowerCase())),
  );

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const x: Record<string, string> = {};
    if (!draft.name.trim()) x.name = 'Enter a name.';
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) x.email = 'Enter a valid email.';
    if (!draft.organization.trim()) x.organization = 'Select an organization.';
    if (users.some((u) => u.id !== draft.id && u.email.toLowerCase() === draft.email.toLowerCase())) x.email = 'This email is already in use.';
    setErr(x);
    if (Object.keys(x).length) return;
    if (draft.id) {
      const r = updateUser(draft as User);
      if (!r.ok) return setErr({ role: r.message ?? '' });
      notify('User account updated.');
    } else {
      addUser(draft);
      notify('User account created.');
    }
    setDraft(null);
  };

  const toggle = (u: User) => {
    if (u.id === user?.id) return notify('You cannot disable your own account.');
    if (isLastActiveAdmin(users, u)) return notify('This is the last active administrator account and cannot be disabled.');
    const next: UserStatus = u.status === 'Active' ? 'Inactive' : 'Active';
    updateUser({ ...u, status: next });
    notify(`${u.name} is now ${next.toLowerCase()}.`);
  };

  return (
    <>
      <PageHeader title="Organizations / Users" subtitle={`${organizations.length} organizations, ${users.length} accounts across distributors, pharmacies and administrators.`}
        actions={<button className="btn btn-primary" onClick={() => { setErr({}); setDraft(EMPTY); }}><Plus size={16} /> Add User</button>} />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <div className="relative min-w-56 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input className="input pl-9" placeholder="Search users or organizations..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
            <option value="">All roles</option><option value="ADMIN">Admin</option><option value="DISTRIBUTOR">Distributor</option><option value="PHARMACY">Pharmacy</option>
          </select>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option><option>Active</option><option>Inactive</option><option>Locked</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>User ID</th><th>Name</th><th>Email</th><th>Organization</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((u) => (
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
            <Field label="Organization" error={err.organization}>
              <select className="input" value={draft.organization} onChange={(e) => set('organization', e.target.value)}>
                <option value="">Select...</option>{ORG_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
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
            {err.role && <p className="text-sm text-danger sm:col-span-2">{err.role}</p>}
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
