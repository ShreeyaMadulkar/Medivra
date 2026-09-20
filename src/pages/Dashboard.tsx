import { useNavigate } from 'react-router-dom';
import { Boxes, CheckCircle2, Clock, Package } from 'lucide-react';
import { useApp } from '../store';
import { Card, CardHeader, Empty, PageHeader, RoleBadge, StatusBadge, TextLink } from '../components/ui';
import { batchStatus, fmtDate, fmtDateTime, num } from '../lib/utils';
import type { TransferStatus } from '../types';

const STATUS_COLOR: Record<TransferStatus, string> = { Pending: '#F9A825', Approved: '#1565C0', 'In Transit': '#00897B', Delivered: '#2E7D32', Cancelled: '#D32F2F' };

export default function Dashboard() {
  const { user, visibleBatches, visibleTransfers, visibleActivity } = useApp();
  const nav = useNavigate();
  if (!user) return null;

  const products = new Set(visibleBatches.map((b) => b.medicine)).size;
  const stock = visibleBatches.reduce((s, b) => s + b.quantity, 0);
  const pending = visibleTransfers.filter((t) => ['Pending', 'Approved', 'In Transit'].includes(t.status)).length;
  const completed = visibleTransfers.filter((t) => t.status === 'Delivered').length;
  const stats = [
    { label: 'Total Products', value: num(products), icon: Package, tone: 'bg-primary/10 text-primary' },
    { label: 'Available Stock', value: `${num(stock)} units`, icon: Boxes, tone: 'bg-teal/10 text-teal' },
    { label: 'Pending Transfers', value: num(pending), icon: Clock, tone: 'bg-warning/15 text-amber-700' },
    { label: 'Completed Transfers', value: num(completed), icon: CheckCircle2, tone: 'bg-success/10 text-success' },
  ];

  const byMedicine = Object.entries(visibleBatches.reduce<Record<string, number>>((m, b) => ({ ...m, [b.medicine]: (m[b.medicine] ?? 0) + b.quantity }), {})).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...byMedicine.map((x) => x[1]));
  const statusCounts = (Object.keys(STATUS_COLOR) as TransferStatus[]).map((s) => ({ s, n: visibleTransfers.filter((t) => t.status === s).length }));
  const totalT = Math.max(1, visibleTransfers.length);

  const recent = [...visibleTransfers].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5);
  const low = visibleBatches.filter((b) => ['Low Stock', 'Out of Stock'].includes(batchStatus(b))).slice(0, 5);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name}`}
        subtitle={user.role === 'PHARMACY' ? `${user.organization} | received stock and incoming deliveries` : `${user.organization} | inventory and transfer overview`}
        actions={<RoleBadge role={user.role} />}
      />

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

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Stock by medicine" />
          <div className="p-5">
            {byMedicine.length === 0 ? <Empty title="No stock yet" /> : (
              <div className="flex h-44 items-end gap-3">
                {byMedicine.map(([name, qty]) => (
                  <div key={name} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${name}: ${num(qty)} units`}>
                    <span className="text-xs font-medium text-ink-soft">{num(qty)}</span>
                    <div className="w-full max-w-12 rounded-t bg-primary" style={{ height: `${Math.max(4, (qty / max) * 78)}%` }} />
                    <span className="w-full truncate text-center text-[11px] text-ink-soft">{name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-sm font-medium">Transfers by status</p>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-canvas">
                {statusCounts.filter((x) => x.n).map((x) => <div key={x.s} style={{ width: `${(x.n / totalT) * 100}%`, background: STATUS_COLOR[x.s] }} title={`${x.s}: ${x.n}`} />)}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                {statusCounts.map((x) => (
                  <span key={x.s} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[x.s] }} />{x.s} ({x.n})</span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Low stock" action={<TextLink to="/inventory">View inventory</TextLink>} />
          {low.length === 0 ? <Empty title="No low stock items" hint="Everything is above the reorder level." /> : (
            <ul className="divide-y divide-line">
              {low.map((b) => (
                <li key={b.id} className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 hover:bg-primary/5" onClick={() => nav(`/batches/${b.id}`)}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.medicine}</p>
                    <p className="text-xs text-ink-soft">Stock: {num(b.quantity)}</p>
                  </div>
                  <StatusBadge status={batchStatus(b)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title="Recent transfers" action={<TextLink to="/transfers">View all</TextLink>} />
          {recent.length === 0 ? <Empty title="No transfers yet" /> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Transfer ID</th><th>Medicine</th><th>From</th><th>To</th><th>Quantity</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>
                  {recent.map((t) => (
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
          <CardHeader title="Recent activity" />
          {visibleActivity.length === 0 ? <Empty title="No activity yet" /> : (
            <ol className="space-y-4 p-5">
              {visibleActivity.slice(0, 6).map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal" />
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
