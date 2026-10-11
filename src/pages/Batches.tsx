import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, Plus, Search, X } from 'lucide-react';
import { useApp } from '../store';
import { Card, Empty, PageHeader, StatusBadge } from '../components/ui';
import { batchStatus, fmtDate, num } from '../lib/utils';

/**
 * Pharmaceutical Batches is the batch-level ledger: which specific lot a medicine came from,
 * its manufacturer, and its own quantity history - distinct from the aggregated Inventory view.
 */
export default function Batches() {
  const { visibleBatches } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const med = params.get('med') ?? '';
  const [q, setQ] = useState('');

  const rows = [...visibleBatches]
    .filter((b) => !med || b.medicine === med)
    .filter((b) => !q || `${b.id} ${b.batchNo} ${b.medicine} ${b.manufacturer}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <PageHeader
        title="Pharmaceutical batches"
        subtitle={med ? `Batches of ${med}` : 'Every batch registered for your organization.'}
        actions={<Link to="/batches/new" className="btn btn-primary"><Plus size={16} /> Add Batch</Link>}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input className="input pl-9" placeholder="Search batches..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {med && (
          <button className="btn btn-secondary btn-sm" onClick={() => setParams({})}>
            <X size={14} /> {med}
          </button>
        )}
      </div>
      {rows.length === 0 ? <Card><Empty title="No batches found" hint="Add your first pharmaceutical batch to start tracking stock." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => (
            <Card key={b.id} className="cursor-pointer p-5 transition-colors hover:border-primary/40">
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
                  <div>
                    <p className="text-xs text-ink-soft">Remaining / original</p>
                    <p className="text-lg font-semibold">{num(b.quantity)} <span className="text-sm font-normal text-ink-soft">/ {num(b.originalQuantity)}</span></p>
                  </div>
                  <div className="text-right"><p className="flex items-center justify-end gap-1 text-xs text-ink-soft"><CalendarClock size={12} /> Expires</p><p className="text-sm font-medium">{fmtDate(b.expiryDate)}</p></div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
