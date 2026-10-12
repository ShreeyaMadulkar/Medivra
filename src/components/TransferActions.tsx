import { useState } from 'react';
import type { Transfer } from '../types';
import { useApp } from '../store';
import { transferActions } from '../lib/rbac';
import { Modal } from './ui';
import { num } from '../lib/utils';

export default function TransferActions({ t, small = false }: { t: Transfer; small?: boolean }) {
  const { user, dispatchTransfer, confirmDelivery, cancelTransfer, notify } = useApp();
  const actions = transferActions(user, t);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (key: (typeof actions)[number]['key'], e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (key === 'deliver') {
      setErr('');
      setDeliverOpen(true);
      return;
    }
    if (key === 'cancel' && !window.confirm(`Cancel transfer ${t.id}? It has not been dispatched, so no stock has moved.`)) return;
    setBusy(true);
    const r = key === 'dispatch' ? await dispatchTransfer(t.id) : await cancelTransfer(t.id);
    setBusy(false);
    if (!r.ok) return notify(r.message);
    notify(key === 'dispatch' ? `Transfer ${t.id} dispatched.` : `Transfer ${t.id} cancelled.`);
  };

  const submitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    const r = await confirmDelivery(t.id);
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setDeliverOpen(false);
    notify(`Transfer ${t.id}: delivery confirmed.`);
  };

  return (
    <>
      {actions.map((a) => (
        <button
          key={a.key}
          disabled={busy}
          onClick={(e) => run(a.key, e)}
          className={`btn ${a.tone === 'danger' ? 'btn-secondary text-danger hover:bg-danger/5' : 'btn-primary'} ${small ? 'btn-sm' : ''}`}
        >
          {busy && !deliverOpen ? 'Working...' : a.label}
        </button>
      ))}

      {deliverOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <Modal title={`Confirm delivery - ${t.id}`} onClose={() => setDeliverOpen(false)}>
            <form onSubmit={submitDelivery} noValidate className="space-y-4">
              <p className="text-sm text-ink-soft">{t.medicine} - dispatched quantity: {num(t.quantity)} units.</p>
              <p className="text-sm">Confirming records the full dispatched quantity ({num(t.quantity)} units) as received and adds it to your stock.</p>
              {err && <p className="text-sm text-danger" role="alert">{err}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setDeliverOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy}>{busy ? 'Confirming...' : 'Confirm delivery'}</button>
              </div>
            </form>
          </Modal>
        </div>
      )}
    </>
  );
}