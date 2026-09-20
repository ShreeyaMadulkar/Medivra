import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useApp } from '../store';
import { Card, Empty, PageHeader, StatusBadge } from '../components/ui';
import { fmtDate, num } from '../lib/utils';

export default function TransferHistory() {
  const { visibleTransfers } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rows = visibleTransfers
    .filter((t) => t.status === 'Delivered' || t.status === 'Cancelled')
    .filter((t) => (!status || t.status === status) && (!from || t.date >= from) && (!to || t.date <= to)
      && (!q || `${t.id} ${t.medicine} ${t.batchId} ${t.from} ${t.to}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.id.localeCompare(a.id));

  return (
    <>
      <PageHeader title="Transfer history" subtitle="Completed and cancelled transfers. Select a row for details." />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <div className="relative min-w-56 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input className="input pl-9" placeholder="Search history..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Final status">
            <option value="">All final statuses</option><option>Delivered</option><option>Cancelled</option>
          </select>
          <label className="text-xs text-ink-soft">From<input className="input mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs text-ink-soft">To<input className="input mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {rows.length === 0 ? <Empty title="No past transfers match" hint="Try a wider date range or clear the status filter." /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Transfer ID</th><th>Medicine</th><th>Batch</th><th>From</th><th>To</th><th>Quantity</th><th>Date</th><th>Final status</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="row-link" onClick={() => nav(`/transfers/${t.id}`)}>
                    <td className="font-medium text-primary">{t.id}</td><td>{t.medicine}</td><td>{t.batchId}</td><td>{t.from}</td><td>{t.to}</td>
                    <td>{num(t.quantity)}</td><td>{fmtDate(t.date)}</td><td><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
