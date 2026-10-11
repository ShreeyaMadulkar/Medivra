import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Truck } from 'lucide-react';
import { useApp } from '../store';
import { Card, CardHeader, Empty, PageHeader, StatusBadge } from '../components/ui';
import { batchStatus, daysUntil, fmtDate, fmtDateTime, money, num } from '../lib/utils';
import { canCreateTransfer, canEditBatch } from '../lib/rbac';

const Item = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div><dt className="text-xs text-ink-soft">{label}</dt><dd className="mt-0.5 text-sm font-medium">{value}</dd></div>
);

export default function BatchDetails() {
  const { id } = useParams();
  const { user, visibleBatches, visibleTransfers } = useApp();
  const nav = useNavigate();
  const b = visibleBatches.find((x) => x.id === id);
  if (!b) return <Card><Empty title="Batch not found" hint="It may have been deleted, or it is not part of your organization's records." /></Card>;

  const related = visibleTransfers.filter((t) => t.batchId === b.id);
  const inTransit = related.filter((t) => t.status === 'Pending' || t.status === 'In Transit').reduce((s, t) => s + t.quantity, 0);
  const days = daysUntil(b.expiryDate);
  const dispatched = b.quantity + inTransit;
  const pct = dispatched ? Math.round((b.quantity / dispatched) * 100) : 0;
  const canTransfer = canCreateTransfer(user?.role) && b.owner === user?.organization && b.quantity > 0;

  return (
    <>
      <PageHeader
        title={`${b.medicine}`}
        subtitle={`${b.id} | Batch no. ${b.batchNo}`}
        back="/inventory"
        actions={<>
          {canTransfer && <Link to={`/transfers/new?batch=${b.id}`} className="btn btn-primary"><Truck size={16} /> Create transfer</Link>}
          {canEditBatch(user, b) && <Link to={`/batches/${b.id}/edit`} className="btn btn-secondary"><Pencil size={15} /> Edit</Link>}
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Batch details" action={<StatusBadge status={batchStatus(b)} />} />
          <dl className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3">
            <Item label="Batch ID" value={b.id} />
            <Item label="Medicine name" value={b.medicine} />
            <Item label="Manufacturer" value={b.manufacturer} />
            <Item label="Category" value={b.category} />
            <Item label="Original quantity" value={`${num(b.originalQuantity)} units`} />
            <Item label="Remaining quantity" value={`${num(b.quantity)} units`} />
            <Item label="Unit price" value={money(b.unitPrice)} />
            <Item label="Manufacturing date" value={fmtDate(b.mfgDate)} />
            <Item label="Expiry date" value={<>{fmtDate(b.expiryDate)}<span className="block text-xs font-normal text-ink-soft">{days >= 0 ? `${days} days remaining` : 'Expired'}</span></>} />
            <Item label="Current status" value={<StatusBadge status={batchStatus(b)} />} />
            <Item label="Held by" value={b.owner} />
          </dl>
          <div className="grid gap-5 border-t border-line p-5 sm:grid-cols-2">
            <Item label="Last updated" value={fmtDateTime(b.updatedAt)} />
            <Item label="Updated by" value={b.updatedBy} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Stock information" />
          <div className="space-y-4 p-5">
            <div>
              <div className="mb-1.5 flex justify-between text-sm"><span className="text-ink-soft">Available</span><span className="font-medium">{num(b.quantity)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} /></div>
            </div>
            <div className="flex justify-between text-sm"><span className="text-ink-soft">In open transfers</span><span className="font-medium">{num(inTransit)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-ink-soft">Original quantity</span><span className="font-medium">{num(b.originalQuantity)}</span></div>
            <p className="border-t border-line pt-3 text-xs text-ink-soft">Quantity is reserved when a transfer is created and returned to the batch if the transfer is cancelled.</p>
          </div>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Transfers involving this batch" />
        {related.length === 0 ? <Empty title="No transfers yet" /> : (
          <table className="tbl">
            <thead><tr><th>Transfer ID</th><th>To</th><th>Quantity</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {related.map((t) => (
                <tr key={t.id} className="row-link" onClick={() => nav(`/transfers/${t.id}`)}>
                  <td className="font-medium text-primary">{t.id}</td><td>{t.to}</td><td>{num(t.quantity)}</td><td>{fmtDate(t.date)}</td><td><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
