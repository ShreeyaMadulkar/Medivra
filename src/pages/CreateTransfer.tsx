import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../store';
import { Card, Field, InfoNote, PageHeader } from '../components/ui';
import { batchStatus, fmtDate, num, todayIso } from '../lib/utils';

export default function CreateTransfer() {
  const { user, batches, organizations, createTransfer, notify } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  // A distributor may only transfer from batches it owns.
  const available = batches.filter((b) => b.quantity > 0 && b.ownerId === user?.organizationId && b.expiryDate > todayIso() && b.status !== 'Expired');
  const pharmacies = organizations.filter((o) => o.type === 'PHARMACY' && o.status === 'Active');
  const [batchId, setBatchId] = useState(params.get('batch') ?? '');
  const [to, setTo] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expectedDelivery, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [apiErr, setApiErr] = useState('');
  const [busy, setBusy] = useState(false);
  const batch = available.find((b) => b.id === batchId);

  const submit = async (e: React.FormEvent) => {
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
    setApiErr('');
    setBusy(true);
    const r = await createTransfer({ batchId, to, quantity: qty, expectedDelivery, notes });
    setBusy(false);
    if (!r.ok) {
      const FIELD: Record<string, string> = { toOrganizationId: 'to', expectedDelivery: 'date', items: 'quantity' };
      const fe: Record<string, string> = {};
      for (const [k, v] of Object.entries((r.fieldErrors ?? {}) as Record<string, string>)) fe[FIELD[k] ?? (k.startsWith('items') ? 'quantity' : k)] = v;
      setErr(fe);
      return setApiErr(r.message);
    }
    notify(`Transfer ${r.transfer.id} created successfully.`);
    nav('/transfers');
  };

  return (
    <>
      <PageHeader title="Create transfer" subtitle={`Send stock from ${user?.organization} to a registered pharmacy.`} back="/transfers" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Pharmaceutical batch" error={err.batch}>
                <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                  <option value="">Select a batch...</option>
                  {available.length === 0 && <option value="" disabled>No batches with available stock</option>}
                  {available.map((b) => <option key={b.id} value={b.id}>{b.id} | {b.medicine} | {num(b.quantity)} units</option>)}
                </select>
              </Field>
            </div>
            <Field label="Medicine"><input className="input" value={batch?.medicine ?? ''} disabled placeholder="Filled from the batch" /></Field>
            <Field label="Distributor"><input className="input" value={user?.organization ?? ''} disabled /></Field>
            <Field label="Destination pharmacy" error={err.to} hint={pharmacies.length === 0 ? 'No active pharmacies are registered yet, so a transfer cannot be addressed.' : undefined}>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Select a pharmacy...</option>{pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Quantity" error={err.quantity} hint={batch ? `${num(batch.quantity)} units available` : undefined}>
              <input className="input" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Expected delivery date" error={err.date}><input className="input" type="date" min={todayIso()} value={expectedDelivery} onChange={(e) => setExpected(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Notes (optional)"><textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
            {apiErr && <p className="text-sm text-danger sm:col-span-2" role="alert">{apiErr}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating...' : 'Create Transfer'}</button>
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
          <InfoNote>Stock is not deducted while the transfer is Pending. It leaves your inventory when you dispatch, and is added to the pharmacy when it confirms delivery.</InfoNote>
        </div>
      </div>
    </>
  );
}