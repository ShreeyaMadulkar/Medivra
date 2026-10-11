import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useApp } from '../store';
import { Card, Empty, PageHeader, StatusBadge } from '../components/ui';
import { CATEGORIES } from '../data/mock';
import { aggregateByMedicine, fmtDate, num } from '../lib/utils';
import { canManageBatches } from '../lib/rbac';

/**
 * Inventory answers "what stock is currently available?", aggregated by medicine across every
 * batch an organization holds. For batch-level traceability (which lot, manufacturer, expiry),
 * see the Pharmaceutical Batches page - both read from the same underlying batch records.
 */
export default function Inventory() {
  const { user, visibleBatches } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const manage = canManageBatches(user?.role);
  const isPharmacy = user?.role === 'PHARMACY';

  const summary = aggregateByMedicine(visibleBatches).filter((m) => {
    const text = m.medicine.toLowerCase();
    return (!q || text.includes(q.toLowerCase())) && (!category || m.category === category) && (!status || m.status === status);
  });

  return (
    <>
      <PageHeader
        title={isPharmacy ? 'Received inventory' : 'Inventory'}
        subtitle={isPharmacy ? 'Medicines actually received and confirmed by your pharmacy.' : `${summary.length} medicines across ${visibleBatches.length} batches`}
        actions={manage && <Link to="/batches/new" className="btn btn-primary"><Plus size={16} /> Add Batch</Link>}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <div className="relative min-w-56 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input className="input pl-9" placeholder="Search inventory..." value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} />
          </div>
          <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stock status">
            <option value="">All stock statuses</option>{['In Stock', 'Low Stock', 'Expiring Soon', 'Out of Stock'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        {summary.length === 0 ? <Empty title="No medicines match your filters" hint="Clear a filter or search for a different medicine." /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Medicine name</th><th>Category</th><th>Total available quantity</th><th>Batches</th><th>Next expiry</th><th>Stock status</th><th>Actions</th></tr></thead>
              <tbody>
                {summary.map((m) => (
                  <tr key={m.medicine} className="row-link" onClick={() => nav(`/batches?med=${encodeURIComponent(m.medicine)}`)}>
                    <td className="font-medium">{m.medicine}</td>
                    <td>{m.category}</td>
                    <td>{num(m.totalQuantity)}</td>
                    <td>{m.batchCount}</td>
                    <td>{fmtDate(m.nearestExpiry)}</td>
                    <td><StatusBadge status={m.status} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Link to={`/batches?med=${encodeURIComponent(m.medicine)}`} className="text-xs font-medium text-primary hover:underline">View batches</Link>
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
