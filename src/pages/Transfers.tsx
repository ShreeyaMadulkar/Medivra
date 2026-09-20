import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useApp } from '../store';
import { Card, Empty, PageHeader, StatusBadge } from '../components/ui';
import TransferActions from '../components/TransferActions';
import { fmtDate, num } from '../lib/utils';
import { canCreateTransfer } from '../lib/rbac';

export default function Transfers() {
  const { user, visibleTransfers } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [status, setStatus] = useState('');
  const rows = [...visibleTransfers]
    .sort((a, b) => b.id.localeCompare(a.id))
    .filter((t) => (!status || t.status === status) && (!q || `${t.id} ${t.batchId} ${t.medicine} ${t.from} ${t.to}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <PageHeader
        title={user?.role === 'PHARMACY' ? 'Incoming transfers' : 'Transfers'}
        subtitle={user?.role === 'PHARMACY' ? 'Confirm deliveries when shipments arrive.' : 'Track stock moving from distributors to pharmacies.'}
        actions={canCreateTransfer(user?.role) && <Link to="/transfers/new" className="btn btn-primary"><Plus size={16} /> Create Transfer</Link>}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <div className="relative min-w-56 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input className="input pl-9" placeholder="Search transfers..." value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} />
          </div>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>{['Pending', 'Approved', 'In Transit', 'Delivered', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {rows.length === 0 ? <Empty title="No transfers found" hint="Adjust your search or status filter." /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Transfer ID</th><th>Batch ID</th><th>Medicine</th><th>From</th><th>To</th><th>Quantity</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="row-link" onClick={() => nav(`/transfers/${t.id}`)}>
                    <td className="font-medium text-primary">{t.id}</td><td>{t.batchId}</td><td>{t.medicine}</td><td>{t.from}</td><td>{t.to}</td>
                    <td>{num(t.quantity)}</td><td>{fmtDate(t.date)}</td><td><StatusBadge status={t.status} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Link to={`/transfers/${t.id}`} className="text-xs font-medium text-primary hover:underline">View</Link>
                        <TransferActions t={t} small />
                      </div>
                    </td>
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
