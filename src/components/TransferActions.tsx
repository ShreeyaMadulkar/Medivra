import type { Transfer } from '../types';
import { useApp } from '../store';
import { transferActions } from '../lib/rbac';

export default function TransferActions({ t, small = false }: { t: Transfer; small?: boolean }) {
  const { user, advanceTransfer, notify } = useApp();
  const actions = transferActions(user?.role, t.status);
  return (
    <>
      {actions.map((a) => (
        <button
          key={a.next}
          onClick={(e) => {
            e.stopPropagation();
            if (a.next === 'Cancelled' && !window.confirm(`Cancel transfer ${t.id}? The reserved quantity returns to the batch.`)) return;
            advanceTransfer(t.id, a.next);
            notify(`Transfer ${t.id}: ${a.next === 'Delivered' ? 'delivery confirmed' : a.next.toLowerCase()}.`);
          }}
          className={`btn ${a.tone === 'danger' ? 'btn-secondary text-danger hover:bg-danger/5' : 'btn-primary'} ${small ? 'btn-sm' : ''}`}
        >
          {a.label}
        </button>
      ))}
    </>
  );
}
