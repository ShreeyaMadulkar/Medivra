import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, Plus } from 'lucide-react';
import { useApp } from '../store';
import { Card, Empty, PageHeader, StatusBadge } from '../components/ui';
import { batchStatus, fmtDate, num } from '../lib/utils';

export default function Batches() {
  const { visibleBatches, user } = useApp();
  const nav = useNavigate();
  const sorted = [...visibleBatches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <PageHeader title="Pharmaceutical batches" subtitle="Every batch registered for your organization." actions={<Link to="/batches/new" className="btn btn-primary"><Plus size={16} /> Add Batch</Link>} />
      {sorted.length === 0 ? <Card><Empty title="No batches yet" hint="Add your first pharmaceutical batch to start tracking stock." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((b) => (
            <Card key={b.id} className="cursor-pointer p-5 transition-colors hover:border-primary/40" >
              <div onClick={() => nav(`/batches/${b.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-primary">{b.id} | {b.batchNo}</p>
                    <h3 className="mt-0.5 font-semibold">{b.medicine}</h3>
                    <p className="text-xs text-ink-soft">{b.manufacturer}</p>
                  </div>
                  <StatusBadge status={batchStatus(b)} />
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div><p className="text-xs text-ink-soft">Quantity</p><p className="text-lg font-semibold">{num(b.quantity)}</p></div>
                  <div className="text-right"><p className="flex items-center justify-end gap-1 text-xs text-ink-soft"><CalendarClock size={12} /> Expires</p><p className="text-sm font-medium">{fmtDate(b.expiryDate)}</p></div>
                </div>
                {user?.role === 'ADMIN' && <p className="mt-3 border-t border-line pt-2 text-xs text-ink-soft">Held by {b.owner}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
