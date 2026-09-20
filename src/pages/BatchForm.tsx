import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Category } from '../types';
import { useApp } from '../store';
import { Card, Field, InfoNote, PageHeader } from '../components/ui';
import { CATEGORIES, DISTRIBUTOR_ORGS, MEDICINES } from '../data/mock';

export default function BatchForm() {
  const { id } = useParams();
  const { user, visibleBatches, addBatch, updateBatch, notify } = useApp();
  const nav = useNavigate();
  const existing = id ? visibleBatches.find((b) => b.id === id) : undefined;
  const [f, setF] = useState({
    medicine: existing?.medicine ?? '', batchNo: existing?.batchNo ?? '', manufacturer: existing?.manufacturer ?? '',
    category: (existing?.category ?? 'Analgesic') as Category, quantity: String(existing?.quantity ?? ''), unitPrice: String(existing?.unitPrice ?? ''),
    mfgDate: existing?.mfgDate ?? '', expiryDate: existing?.expiryDate ?? '', owner: existing?.owner ?? DISTRIBUTOR_ORGS[0],
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  if (id && !existing) return <Card className="p-8 text-center">Batch not found.</Card>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const x: Record<string, string> = {};
    if (!f.medicine.trim()) x.medicine = 'Enter the medicine name.';
    if (!f.batchNo.trim()) x.batchNo = 'Enter the batch number.';
    if (!f.manufacturer.trim()) x.manufacturer = 'Enter the manufacturer.';
    if (!/^\d+$/.test(f.quantity)) x.quantity = 'Enter a whole number, 0 or more.';
    if (!(parseFloat(f.unitPrice) >= 0) || f.unitPrice === '') x.unitPrice = 'Enter a valid unit price.';
    if (!f.mfgDate) x.mfgDate = 'Select the manufacturing date.';
    if (!f.expiryDate) x.expiryDate = 'Select the expiry date.';
    else if (f.mfgDate && f.expiryDate <= f.mfgDate) x.expiryDate = 'Expiry must be after the manufacturing date.';
    setErr(x);
    if (Object.keys(x).length) return;

    const data = { medicine: f.medicine.trim(), batchNo: f.batchNo.trim(), manufacturer: f.manufacturer.trim(), category: f.category, quantity: parseInt(f.quantity, 10), unitPrice: parseFloat(f.unitPrice), mfgDate: f.mfgDate, expiryDate: f.expiryDate };
    if (existing) {
      updateBatch(existing.id, data);
      notify('Pharmaceutical batch successfully updated.');
      nav(`/batches/${existing.id}`);
    } else {
      const b = addBatch({ ...data, owner: f.owner });
      if (!b) return;
      notify('Pharmaceutical batch successfully added.');
      nav(`/batches/${b.id}`);
    }
  };

  return (
    <>
      <PageHeader title={existing ? `Edit batch ${existing.id}` : 'Add pharmaceutical batch'} back={existing ? `/batches/${existing.id}` : '/inventory'} />
      <Card className="max-w-3xl p-6">
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Medicine name" error={err.medicine}>
            <input className="input" list="meds" value={f.medicine} onChange={set('medicine')} />
            <datalist id="meds">{MEDICINES.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Batch number" error={err.batchNo}><input className="input" value={f.batchNo} onChange={set('batchNo')} placeholder="e.g. PCM-26-042" /></Field>
          <Field label="Manufacturer" error={err.manufacturer}><input className="input" value={f.manufacturer} onChange={set('manufacturer')} /></Field>
          <Field label="Category"><select className="input" value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Quantity (units)" error={err.quantity}><input className="input" inputMode="numeric" value={f.quantity} onChange={set('quantity')} /></Field>
          <Field label="Unit price (₹)" error={err.unitPrice}><input className="input" inputMode="decimal" value={f.unitPrice} onChange={set('unitPrice')} /></Field>
          <Field label="Manufacturing date" error={err.mfgDate}><input className="input" type="date" value={f.mfgDate} onChange={set('mfgDate')} /></Field>
          <Field label="Expiry date" error={err.expiryDate}><input className="input" type="date" value={f.expiryDate} onChange={set('expiryDate')} /></Field>
          {user?.role === 'ADMIN' && !existing && (
            <Field label="Holding distributor"><select className="input" value={f.owner} onChange={set('owner')}>{DISTRIBUTOR_ORGS.map((o) => <option key={o}>{o}</option>)}</select></Field>
          )}
          <div className="sm:col-span-2">
            <InfoNote>Batch records are designed to be saved through secure database operations.</InfoNote>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn btn-primary">{existing ? 'Save changes' : 'Add Batch'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => nav(-1)}>Cancel</button>
          </div>
        </form>
      </Card>
    </>
  );
}
