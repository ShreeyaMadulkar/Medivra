import { useState } from 'react';
import type { Transfer } from '../types';
import { useApp } from '../store';
import { transferActions } from '../lib/rbac';
import { Field, Modal } from './ui';
import { num } from '../lib/utils';

export default function TransferActions({ t, small = false }: { t: Transfer; small?: boolean }) {
  const { user, dispatchTransfer, confirmDelivery, cancelTransfer, notify } = useApp();
  const actions = transferActions(user, t);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [received, setReceived] = useState(String(t.quantity));
  const [err, setErr] = useState('');

  const run = (key: (typeof actions)[number]['key'], e: React.MouseEvent) => {
    e.stopPropagation();
    if (key === 'dispatch') {
      dispatchTransfer(t.id);
      notify(`Transfer ${t.id} dispatched.`);
    } else if (key === 'cancel') {
      if (!window.confirm(`Cancel transfer ${t.id}? The reserved quantity returns to the batch.`)) return;
      cancelTransfer(t.id);
      notify(`Transfer ${t.id} cancelled.`);
    } else if (key === 'deliver') {
      setReceived(String(t.quantity));
      setErr('');
      setDeliverOpen(true);
    }
  };

  const submitDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(received, 10);
    if (!Number.isFinite(qty) || qty < 0) return setErr('Enter a valid received quantity.');
    const r = confirmDelivery(t.id, qty);
    if (!r.ok) return setErr(r.message);
    setDeliverOpen(false);
    notify(r.discrepancy ? `Transfer ${t.id}: delivery confirmed with a quantity discrepancy.` : `Transfer ${t.id}: delivery confirmed.`);
  };

  return (
    <>
      {actions.map((a) => (
        <button
          key={a.key}
          onClick={(e) => run(a.key, e)}
          className={`btn ${a.tone === 'danger' ? 'btn-secondary text-danger hover:bg-danger/5' : 'btn-primary'} ${small ? 'btn-sm' : ''}`}
        >
          {a.label}
        </button>
      ))}

      {deliverOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <Modal title={`Confirm delivery - ${t.id}`} onClose={() => setDeliverOpen(false)}>
            <form onSubmit={submitDelivery} noValidate className="space-y-4">
              <p className="text-sm text-ink-soft">{t.medicine} - dispatched quantity: {num(t.quantity)} units.</p>
              <Field label="Quantity received" error={err}>
                <input className="input" inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value)} autoFocus />
              </Field>
              <p className="text-xs text-ink-soft">If this differs from the dispatched quantity, the transfer will be recorded as delivered with a discrepancy rather than silently marked as fully received.</p>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setDeliverOpen(false)}>Cancel</button>
                <button className="btn btn-primary">Confirm delivery</button>
              </div>
            </form>
          </Modal>
        </div>
      )}
    </>
  );
}
