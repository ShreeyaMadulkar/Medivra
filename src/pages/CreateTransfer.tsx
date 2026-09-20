import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import { Card, Field, InfoNote, PageHeader } from '../components/ui';
import { PHARMACY_ORGS, DISTRIBUTOR_ORGS } from '../data/mock';
import { batchStatus, fmtDate, num, todayIso } from '../lib/utils';

export default function CreateTransfer() {
  const { visibleBatches, createTransfer, notify } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const available = visibleBatches.filter((b) => b.quantity > 0 && DISTRIBUTOR_ORGS.includes(b.owner));
  const [batchId, setBatchId] = useState(available.some((b) => b.id === params.get('batch')) ? params.get('batch')! : '');
  const [to, setTo] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expectedDelivery, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const batch = available.find((b) => b.id === batchId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const x: Record<string, string> = {};
    const qty = parseInt(quantity, 10);
    if (!batch) x.batch = 'Select a pharmaceutical batch.';
    if (!to) x.to = 'Select a destination pharmacy.';
    if (!/^\d+$/.test(quantity) || qty < 1) x.quantity = 'Enter a quantity of at least 1.';
    else if (batch && qty > batch.quantity) x.quantity = `Only ${num(batch.quantity)} units are available in this batch.`;
    if (!expectedDelivery) x.date = 'Select the expected delivery date.';
    else if (expectedDelivery < todayIso()) x.date = 'Delivery date cannot be in the past.';
    setErr(x);
    if (Object.keys(x).length) return;
    // BACKEND: POST /api/transfers -> transaction using prepared statements; RBAC check; audit log entry.
    const r = createTransfer({ batchId, to, quantity: qty, expectedDelivery, notes });
    if (!r.ok) return setErr({ quantity: r.message });
    notify(`Transfer ${r.transfer.id} created successfully.`);
    nav('/transfers');
  };

  return (
    <>
      <PageHeader title="Create transfer" subtitle="Send stock from a batch to a pharmacy." back="/transfers" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Pharmaceutical batch" error={err.batch}>
                <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                  <option value="">Select a batch...</option>
                  {available.map((b) => <option key={b.id} value={b.id}>{b.id} | {b.medicine} | {num(b.quantity)} units | {b.owner}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Medicine"><input className="input" value={batch?.medicine ?? ''} disabled placeholder="Filled from the batch" /></Field>
            <Field label="Distributor"><input className="input" value={batch?.owner ?? ''} disabled placeholder="Filled from the batch" /></Field>
            <Field label="Destination pharmacy" error={err.to}>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Select a pharmacy...</option>{PHARMACY_ORGS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Quantity" error={err.quantity} hint={batch ? `${num(batch.quantity)} units available` : undefined}>
              <input className="input" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Expected delivery date" error={err.date}><input className="input" type="date" min={todayIso()} value={expectedDelivery} onChange={(e) => setExpected(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Notes (optional)"><textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
            <div className="flex gap-2 sm:col-span-2">
              <button className="btn btn-primary">Create Transfer</button>
              <button type="button" className="btn btn-secondary" onClick={() => nav('/transfers')}>Cancel</button>
            </div>
          </form>
        </Card>
        <div className="space-y-4">
          {batch && (
            <Card className="p-5 text-sm">
              <p className="font-semibold">{batch.medicine}</p>
              <p className="mt-1 text-ink-soft">{batch.id} | {batch.batchNo}</p>
              <p className="mt-3 text-ink-soft">Expires {fmtDate(batch.expiryDate)}</p>
              {batchStatus(batch) === 'Expiring Soon' && <p className="mt-2 text-orange-700">This batch expires soon. Confirm the pharmacy can use it in time.</p>}
            </Card>
          )}
          <InfoNote>The quantity is reserved as soon as the transfer is created. It returns to the batch if the transfer is cancelled.</InfoNote>
        </div>
      </div>
    </>
  );
}
