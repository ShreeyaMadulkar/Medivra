import { Laptop } from 'lucide-react';
import { useApp } from '../store';
import { Card, CardHeader, Field, InfoNote, PageHeader, RoleBadge, StatusBadge } from '../components/ui';
import { fmtDateTime, initials } from '../lib/utils';

/**
 * Read-only profile. The API has no self-service endpoint for changing your own name, phone or password
 * (only ADMIN can PATCH /users/:id), so nothing here pretends to save. Everything shown comes from GET /auth/me.
 */
export default function Profile() {
  const { user, resetDemo } = useApp();
  if (!user) return null;

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
            <CardHeader title="Personal information" />
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <Field label="Name"><input className="input" value={user.name} disabled /></Field>
              <Field label="Email"><input className="input" value={user.email} disabled /></Field>
              <Field label="Organization"><input className="input" value={user.organization} disabled /></Field>
              <Field label="Phone"><input className="input" value={user.phone} disabled /></Field>
              <Field label="Role"><input className="input" value={user.role} disabled /></Field>
              <div className="sm:col-span-2">
                <InfoNote>Profile details are read-only here. To change your name or phone number, ask a Medivra administrator; password changes are not available in this version.</InfoNote>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Security" />
            <div className="divide-y divide-line">
              <div className="flex items-center justify-between px-5 py-4"><p className="text-sm font-medium">Last login</p><p className="text-sm text-ink-soft">{fmtDateTime(user.lastLogin)}</p></div>
              <div className="flex items-center justify-between px-5 py-4"><p className="text-sm font-medium">Account status</p><StatusBadge status={user.status} /></div>
              <div className="px-5 py-4">
                <p className="text-sm font-medium">Current session</p>
                <div className="mt-3 flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
                  <Laptop size={18} className="text-primary" />
                  <div><p className="text-sm font-medium">This browser</p><p className="text-xs text-ink-soft">Signed in until your token expires or you log out.</p></div>
                </div>
              </div>
            </div>
          </Card>

          {user.role === 'ADMIN' && (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-line px-5 py-4">
              <p className="text-sm text-ink-soft">Admin tool: discard local session events and reload all data from the server. The database itself is not changed.</p>
              <button className="btn btn-secondary btn-sm" onClick={() => resetDemo()}>Reload data</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
