import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, Package, ShieldAlert, Store, Truck } from 'lucide-react';
import { useApp } from '../store';
import { Card, CardHeader, Empty, RoleBadge, StatusBadge, TextLink } from '../components/ui';
import { fmtDate, fmtDateTime, num } from '../lib/utils';

export default function AdminDashboard() {
  const { user, users, organizations, batches, transfers, activity, overview } = useApp();
  const nav = useNavigate();
  if (!user) return null;

  const distributors = organizations.filter((o) => o.type === 'DISTRIBUTOR');
  const pharmacies = organizations.filter((o) => o.type === 'PHARMACY');
  const inProgress = transfers.filter((t) => t.status === 'Pending' || t.status === 'In Transit').length;
  const locked = users.filter((u) => u.status === 'Locked').length;
  const pendingAccounts = users.filter((u) => u.status === 'Inactive').length;
  const expiringBatches = batches.filter((b) => b.quantity > 0 && b.status === 'Expiring Soon').length;

  const stats = [
    { label: 'Registered distributors', value: num(overview?.organizations.distributors ?? distributors.length), icon: Building2, tone: 'bg-primary/10 text-primary' },
    { label: 'Registered pharmacies', value: num(overview?.organizations.pharmacies ?? pharmacies.length), icon: Store, tone: 'bg-teal/10 text-teal' },
    { label: 'Pharmaceutical batches (platform)', value: num(overview?.inventory.distinctBatches ?? batches.length), icon: Package, tone: 'bg-success/10 text-success' },
    { label: 'Transfers in progress', value: num(overview ? overview.transfers.PENDING + overview.transfers.IN_TRANSIT : inProgress), icon: Truck, tone: 'bg-warning/15 text-amber-700' },
  ];

  const recentTransfers = [...transfers].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 6);
  const recentAccountActivity = activity.filter((a) => /logged in|logged out|locked|registered|account/i.test(a.action)).slice(0, 6);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Welcome back, {user.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">Platform overview across every registered organization.</p>
        </div>
        <RoleBadge role={user.role} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="flex items-center gap-4 p-5">
            <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone}`}><Icon size={22} /></div>
            <div>
              <p className="text-sm text-ink-soft">{label}</p>
              <p className="text-xl font-semibold">{value}</p>
            </div>
          </Card>
        ))}
      </div>

      {(locked > 0 || pendingAccounts > 0 || expiringBatches > 0) && (
        <Card className="mt-6">
          <CardHeader title="Operational alerts" />
          <ul className="divide-y divide-line">
            {locked > 0 && (
              <li className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="flex items-center gap-2"><ShieldAlert size={16} className="text-danger" /> {locked} account{locked > 1 ? 's are' : ' is'} currently locked out</span>
                <TextLink to="/users">Review</TextLink>
              </li>
            )}
            {pendingAccounts > 0 && (
              <li className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="flex items-center gap-2"><AlertTriangle size={16} className="text-warning" /> {pendingAccounts} registration{pendingAccounts > 1 ? 's' : ''} awaiting activation</span>
                <TextLink to="/users">Review</TextLink>
              </li>
            )}
            {expiringBatches > 0 && (
              <li className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="flex items-center gap-2"><AlertTriangle size={16} className="text-orange-600" /> {expiringBatches} batch{expiringBatches > 1 ? 'es' : ''} expiring soon across the platform</span>
              </li>
            )}
          </ul>
        </Card>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title="Recent platform-wide transfers" action={<TextLink to="/transfers">View all</TextLink>} />
          {recentTransfers.length === 0 ? <Empty title="No transfers yet" /> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Transfer ID</th><th>Medicine</th><th>From</th><th>To</th><th>Quantity</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>
                  {recentTransfers.map((t) => (
                    <tr key={t.id} className="row-link" onClick={() => nav(`/transfers/${t.id}`)}>
                      <td className="font-medium text-primary">{t.id}</td><td>{t.medicine}</td><td>{t.from}</td><td>{t.to}</td>
                      <td>{num(t.quantity)}</td><td>{fmtDate(t.date)}</td><td><StatusBadge status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent account activity" />
          {recentAccountActivity.length === 0 ? <Empty title="No activity yet" /> : (
            <ol className="space-y-4 p-5">
              {recentAccountActivity.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.outcome === 'failure' ? 'bg-danger' : 'bg-teal'}`} />
                  <div>
                    <p className="text-sm">{a.action}</p>
                    <p className="text-xs text-ink-soft">{a.actor} | {fmtDateTime(a.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}