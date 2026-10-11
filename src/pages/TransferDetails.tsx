import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Check, X } from 'lucide-react';
import { useApp } from '../store';
import { Card, CardHeader, Empty, PageHeader, StatusBadge } from '../components/ui';
import TransferActions from '../components/TransferActions';
import { fmtDate, fmtDateTime, num } from '../lib/utils';

const STEPS = ['Transfer Created', 'In Transit', 'Delivered'];
const IDX: Record<string, number> = { Pending: 0, 'In Transit': 1, Delivered: 2 };

const Item = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div><dt className="text-xs text-ink-soft">{label}</dt><dd className="mt-0.5 text-sm font-medium">{value}</dd></div>
);

export default function TransferDetails() {
  const { id } = useParams();
  const { visibleTransfers, visibleBatches, activity } = useApp();
  const t = visibleTransfers.find((x) => x.id === id);
  if (!t) return <Card><Empty title="Transfer not found" hint="It may not be part of your organization's transfers." /></Card>;

  const cancelled = t.status === 'Cancelled';
  const current = IDX[t.status] ?? 0;
  const batchVisible = visibleBatches.some((b) => b.id === t.batchId);
  const audit = activity.filter((a) => a.ref === t.id).sort((a, b) => b.at.localeCompare(a.at));
  const discrepancy = t.status === 'Delivered' && t.receivedQuantity != null && t.receivedQuantity !== t.quantity;

  return (
    <>
      <PageHeader title={`Transfer ${t.id}`} subtitle={`${t.medicine} | ${num(t.quantity)} units`} back="/transfers" actions={<><StatusBadge status={t.status} /><TransferActions t={t} /></>} />

      <Card className="p-6">
        {cancelled ? (
          <div className="flex items-center gap-3 rounded-md bg-danger/5 p-4 text-sm text-danger"><X size={18} /> This transfer was cancelled. Reserved stock was returned to the batch.</div>
        ) : (
          <ol className="grid grid-cols-3">
            {STEPS.map((s, i) => {
              const done = i < current || (t.status === 'Delivered' && i === 2);
              const active = i === current && !done;
              return (
                <li key={s} className="relative flex flex-col items-center text-center">
                  {i > 0 && <span className={`absolute right-1/2 top-4 h-0.5 w-full ${i <= current ? 'bg-teal' : 'bg-line'}`} />}
                  <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold ${done ? 'border-teal bg-teal text-white' : active ? 'border-primary bg-primary text-white ring-4 ring-primary/15' : 'border-line bg-white text-ink-mute'}`}>
                    {done ? <Check size={16} /> : i + 1}
                  </span>
                  <span className={`mt-2 text-sm ${active ? 'font-semibold text-primary' : done ? 'font-medium' : 'text-ink-soft'}`}>{s}</span>
                </li>
              );
            })}
          </ol>
        )}
        {discrepancy && (
          <div className="mt-5 flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning/10 px-3.5 py-3 text-sm text-amber-900">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>Quantity discrepancy: {num(t.quantity)} units were dispatched but {num(t.receivedQuantity ?? 0)} were confirmed received.</span>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Transfer details" />
          <dl className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3">
            <Item label="Transfer ID" value={t.id} />
            <Item label="Medicine" value={t.medicine} />
            <Item label="Batch" value={batchVisible ? <Link className="text-primary hover:underline" to={`/batches/${t.batchId}`}>{t.batchId}</Link> : t.batchId} />
            <Item label="Dispatched quantity" value={`${num(t.quantity)} units`} />
            {t.receivedQuantity != null && <Item label="Received quantity" value={`${num(t.receivedQuantity)} units`} />}
            <Item label="From" value={t.from} />
            <Item label="To" value={t.to} />
            <Item label="Created" value={fmtDate(t.date)} />
            <Item label="Expected delivery" value={fmtDate(t.expectedDelivery)} />
            <Item label="Status" value={<StatusBadge status={t.status} />} />
          </dl>
          {t.notes && <div className="border-t border-line p-5"><p className="text-xs text-ink-soft">Notes</p><p className="mt-0.5 text-sm">{t.notes}</p></div>}
        </Card>

        <Card>
          <CardHeader title="Timeline" />
          <ol className="p-5">
            {t.timeline.map((e, i) => (
              <li key={i} className="relative pb-5 pl-6 last:pb-0">
                {i < t.timeline.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-line" />}
                <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-teal" />
                <p className="text-xs text-ink-soft">{fmtDateTime(e.at)}</p>
                <p className="text-sm font-medium">{e.label}</p>
                <p className="text-xs text-ink-soft">by {e.by}{e.byRole ? ` (${e.byRole.charAt(0)}${e.byRole.slice(1).toLowerCase()})` : ''}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent activity on this transfer" />
        {audit.length === 0 ? <Empty title="No recorded activity" /> : (
          <ul className="divide-y divide-line">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span>{a.action}</span><span className="text-xs text-ink-soft">{a.actor} | {fmtDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
