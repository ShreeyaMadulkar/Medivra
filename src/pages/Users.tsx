import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { OrgType, Organization, Role, User, UserStatus } from '../types';
import { useApp } from '../store';
import { Card, CardHeader, Empty, Field, Modal, PageHeader, RoleBadge, StatusBadge } from '../components/ui';
import { fmtDateTime } from '../lib/utils';
import { isLastActiveAdmin } from '../lib/rbac';
import { passwordValid } from '../services/security';

/** Mirrors server/src/validation/auth.schemas.js (name 2-100, phone pattern + 20 max, email, password rules). */
const PHONE_RE = /^[+\d][\d\s-]{7,}$/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

interface UserDraft { id?: string; name: string; email: string; phone: string; role: Role; organizationId: string; password: string; status: UserStatus }
const EMPTY_USER: UserDraft = { name: '', email: '', phone: '', role: 'DISTRIBUTOR', organizationId: '', password: '', status: 'Active' };
interface OrgDraft { id?: string; name: string; type: OrgType; status: 'Active' | 'Inactive' }
const EMPTY_ORG: OrgDraft = { name: '', type: 'DISTRIBUTOR', status: 'Active' };

export default function Users() {
  const { user, users, organizations, addUser, updateUser, addOrganization, updateOrganization, notify } = useApp();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [orgDraft, setOrgDraft] = useState<OrgDraft | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = users.filter((u) =>
    (!role || u.role === role) && (!status || u.status === status) &&
    (!q || `${u.id} ${u.name} ${u.email} ${u.organization}`.toLowerCase().includes(q.toLowerCase())),
  );
  // Only ACTIVE organizations of the matching type can receive a new account (the server enforces this too).
  const orgOptions = (r: Role) => organizations.filter((o) => o.type === r && o.status === 'Active');

  const openUser = (d: UserDraft) => { setErr({}); setFormErr(''); setDraft(d); };
  const openOrg = (d: OrgDraft) => { setErr({}); setFormErr(''); setOrgDraft(d); };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || busy) return;
    const x: Record<string, string> = {};
    const name = draft.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 100) x.name = 'Enter a name (2-100 characters).';
    if (!PHONE_RE.test(draft.phone.trim()) || draft.phone.trim().length > 20) x.phone = 'Enter a valid phone number.';
    if (!draft.id) {
      if (!EMAIL_RE.test(draft.email.trim())) x.email = 'Enter a valid email.';
      if (users.some((u) => u.email.toLowerCase() === draft.email.trim().toLowerCase())) x.email = 'This email is already in use.';
      if (draft.role !== 'ADMIN' && !draft.organizationId) x.organizationId = 'Select an organization.';
      if (!passwordValid(draft.password)) x.password = 'Min 8 characters with an uppercase letter, a number and a special character.';
    }
    setErr(x);
    if (Object.keys(x).length) return;
    setBusy(true);
    setFormErr('');
    const r = draft.id
      ? await updateUser(draft.id, { name, phone: draft.phone.trim(), status: draft.status })
      : await addUser({ name, email: draft.email.trim().toLowerCase(), phone: draft.phone.trim(), role: draft.role, organizationId: draft.organizationId, password: draft.password });
    setBusy(false);
    if (!r.ok) { setErr(r.fieldErrors ?? {}); setFormErr(r.message); return; }
    notify(draft.id ? 'User account updated.' : 'User account created.');
    setDraft(null);
  };

  const saveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgDraft || busy) return;
    const name = orgDraft.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 150) { setErr({ name: 'Enter an organization name (2-150 characters).' }); return; }
    setErr({});
    setBusy(true);
    setFormErr('');
    const r = orgDraft.id
      ? await updateOrganization(orgDraft.id, { name, status: orgDraft.status })
      : await addOrganization({ name, type: orgDraft.type });
    setBusy(false);
    if (!r.ok) { setErr(r.fieldErrors ?? {}); setFormErr(r.message); return; }
    notify(orgDraft.id ? 'Organization updated.' : 'Organization created.');
    setOrgDraft(null);
  };

  const toggle = async (u: User) => {
    if (u.id === user?.id) return notify('You cannot disable your own account.');
    if (isLastActiveAdmin(users, u)) return notify('This is the last active administrator account and cannot be disabled.');
    const next: UserStatus = u.status === 'Active' ? 'Inactive' : 'Active';
    const r = await updateUser(u.id, { status: next });
    notify(r.ok ? `${u.name} is now ${next.toLowerCase()}.` : r.message);
  };

  const toggleOrg = async (o: Organization) => {
    const next = o.status === 'Active' ? 'Inactive' : 'Active';
    const r = await updateOrganization(o.id, { status: next });
    notify(r.ok ? `${o.name} is now ${next.toLowerCase()}.` : r.message);
  };

  return (
    <>
      <PageHeader title="Organizations / Users" subtitle={`${organizations.length} organizations, ${users.length} accounts across distributors, pharmacies and administrators.`}
        actions={<div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => openOrg(EMPTY_ORG)}><Plus size={16} /> Add Organization</button>
          <button className="btn btn-primary" onClick={() => openUser(EMPTY_USER)}><Plus size={16} /> Add User</button>
        </div>} />
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
                      <button className="text-primary hover:underline" onClick={() => openUser({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, organizationId: u.organizationId, password: '', status: u.status })}>Edit</button>
                      <button className={u.status === 'Active' ? 'text-danger hover:underline' : 'text-success hover:underline'} onClick={() => void toggle(u)}>
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

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Organizations" />
        {organizations.length === 0 ? <Empty title="No organizations yet" /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {organizations.map((o) => (
                  <tr key={o.id}>
                    <td className="text-ink-soft">{o.id}</td><td className="font-medium">{o.name}</td><td>{o.type === 'DISTRIBUTOR' ? 'Distributor' : 'Pharmacy'}</td><td><StatusBadge status={o.status} /></td>
                    <td>
                      <div className="flex gap-3 text-xs font-medium">
                        <button className="text-primary hover:underline" onClick={() => openOrg({ id: o.id, name: o.name, type: o.type, status: o.status })}>Edit</button>
                        <button className={o.status === 'Active' ? 'text-danger hover:underline' : 'text-success hover:underline'} onClick={() => void toggleOrg(o)}>{o.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {draft && (
        <Modal title={draft.id ? `Edit ${draft.name}` : 'Add user'} onClose={() => setDraft(null)}>
          <form onSubmit={saveUser} noValidate className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={err.name}><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Email" error={err.email} hint={draft.id ? 'Email cannot be changed.' : undefined}><input className="input" value={draft.email} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            <Field label="Role" hint={draft.id ? 'Role and organization cannot be changed.' : undefined}>
              <select className="input" value={draft.role} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role, organizationId: '' })}>
                <option value="ADMIN">Admin</option><option value="DISTRIBUTOR">Distributor</option><option value="PHARMACY">Pharmacy</option>
              </select>
            </Field>
            <Field label="Organization" error={err.organizationId}>
              {draft.id || draft.role === 'ADMIN'
                ? <input className="input" disabled value={draft.role === 'ADMIN' ? 'Medivra Systems (platform)' : users.find((u) => u.id === draft.id)?.organization ?? ''} />
                : (
                  <select className="input" value={draft.organizationId} onChange={(e) => setDraft({ ...draft, organizationId: e.target.value })}>
                    <option value="">Select...</option>{orgOptions(draft.role).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )}
            </Field>
            <Field label="Phone" error={err.phone}><input className="input" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
            {draft.id ? (
              <Field label="Status">
                <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as UserStatus })}>
                  <option>Active</option><option>Inactive</option><option value="Locked">Suspended</option>
                </select>
              </Field>
            ) : (
              <Field label="Temporary password" error={err.password}><input className="input" type="password" autoComplete="new-password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} /></Field>
            )}
            {formErr && <p role="alert" className="text-sm text-danger sm:col-span-2">{formErr}</p>}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : draft.id ? 'Save changes' : 'Add user'}</button>
            </div>
          </form>
        </Modal>
      )}

      {orgDraft && (
        <Modal title={orgDraft.id ? `Edit ${orgDraft.name}` : 'Add organization'} onClose={() => setOrgDraft(null)}>
          <form onSubmit={saveOrg} noValidate className="grid gap-4 sm:grid-cols-2">
            <Field label="Organization name" error={err.name}><input className="input" value={orgDraft.name} onChange={(e) => setOrgDraft({ ...orgDraft, name: e.target.value })} /></Field>
            <Field label="Type" error={err.type} hint={orgDraft.id ? 'Type cannot be changed.' : undefined}>
              <select className="input" value={orgDraft.type} disabled={!!orgDraft.id} onChange={(e) => setOrgDraft({ ...orgDraft, type: e.target.value as OrgType })}>
                <option value="DISTRIBUTOR">Distributor</option><option value="PHARMACY">Pharmacy</option>
              </select>
            </Field>
            {orgDraft.id && (
              <Field label="Status">
                <select className="input" value={orgDraft.status} onChange={(e) => setOrgDraft({ ...orgDraft, status: e.target.value as 'Active' | 'Inactive' })}>
                  <option>Active</option><option>Inactive</option>
                </select>
              </Field>
            )}
            {formErr && <p role="alert" className="text-sm text-danger sm:col-span-2">{formErr}</p>}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="btn btn-secondary" onClick={() => setOrgDraft(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : orgDraft.id ? 'Save changes' : 'Add organization'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
