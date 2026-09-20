import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import type { Batch } from '../types';
import { useApp } from '../store';
import { Card, Empty, Modal, PageHeader, StatusBadge } from '../components/ui';
import { CATEGORIES } from '../data/mock';
import { batchStatus, daysUntil, fmtDate, num } from '../lib/utils';
import { canManageBatches } from '../lib/rbac';

export default function Inventory() {
  const { user, visibleBatches, deleteBatch, notify } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [expiry, setExpiry] = useState('');
  const [toDelete, setToDelete] = useState<Batch | null>(null);
  const manage = canManageBatches(user?.role);
  const isPharmacy = user?.role === 'PHARMACY';

  const rows = visibleBatches.filter((b) => {
    const s = batchStatus(b);
    const d = daysUntil(b.expiryDate);
    const text = `${b.id} ${b.batchNo} ${b.medicine} ${b.manufacturer}`.toLowerCase();
    return (!q || text.includes(q.toLowerCase())) && (!category || b.category === category) && (!status || s === status)
      && (!expiry || (expiry === '30' ? d <= 30 : expiry === '90' ? d <= 90 : d > 90));
  });

  return (
    <>
      <PageHeader
        title={isPharmacy ? 'Received inventory' : 'Inventory'}
        subtitle={`${rows.length} of ${visibleBatches.length} batches`}
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
          <select className="input w-auto" value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Expiry">
            <option value="">Any expiry</option><option value="30">Within 30 days</option><option value="90">Within 90 days</option><option value="later">After 90 days</option>
          </select>
        </div>
        {rows.length === 0 ? <Empty title="No batches match your filters" hint="Clear a filter or search for a different medicine." /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Batch ID</th><th>Medicine name</th><th>Category</th><th>Quantity</th><th>Expiry date</th><th>Manufacturer</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="row-link" onClick={() => nav(`/batches/${b.id}`)}>
                    <td className="font-medium text-primary">{b.id}</td>
                    <td className="font-medium">{b.medicine}{user?.role === 'ADMIN' && <span className="block text-xs font-normal text-ink-soft">{b.owner}</span>}</td>
                    <td>{b.category}</td><td>{num(b.quantity)}</td><td>{fmtDate(b.expiryDate)}</td><td>{b.manufacturer}</td>
                    <td><StatusBadge status={batchStatus(b)} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-3 text-xs font-medium">
                        <Link to={`/batches/${b.id}`} className="text-primary hover:underline">View</Link>
                        {manage && <Link to={`/batches/${b.id}/edit`} className="text-primary hover:underline">Edit</Link>}
                        {manage && <button className="text-danger hover:underline" onClick={() => setToDelete(b)}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {toDelete && (
        <Modal title="Delete batch" onClose={() => setToDelete(null)}>
          <p className="text-sm">Delete <strong>{toDelete.id}</strong> ({toDelete.medicine}, {num(toDelete.quantity)} units)? This removes the record from inventory.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setToDelete(null)}>Keep batch</button>
            <button className="btn btn-danger" onClick={() => { deleteBatch(toDelete.id); notify(`Batch ${toDelete.id} deleted.`); setToDelete(null); }}>Delete batch</button>
          </div>
        </Modal>
      )}
    </>
  );
}
