import type { Batch, BatchStatus } from '../types';

/** Fixed "today" so the demo data (expiry dates etc.) always looks the same. */
export const DEMO_TODAY = '2026-09-21';
export const LOW_STOCK_LIMIT = 200;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');

export const nowIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
};
export const todayIso = () => nowIso().slice(0, 10);

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return `${p2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return `${fmtDate(iso)}, ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
export const daysUntil = (iso: string) =>
  Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(todayIso() + 'T00:00:00').getTime()) / 86400000);

export const batchStatus = (b: Batch): BatchStatus => {
  if (b.status) return b.status; // the server computes this (expired / expiring / low stock thresholds)
  if (b.quantity <= 0) return 'Out of Stock';
  if (daysUntil(b.expiryDate) <= 90) return 'Expiring Soon';
  if (b.quantity < LOW_STOCK_LIMIT) return 'Low Stock';
  return 'In Stock';
};

export const nextId = (ids: string[], prefix: string, base: number) =>
  `${prefix}${Math.max(base, ...ids.map((i) => parseInt(i.slice(prefix.length), 10) || 0)) + 1}`;

export const uid = () => Math.random().toString(36).slice(2, 10);
export const num = (n: number) => n.toLocaleString('en-IN');
export const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export interface MedicineSummary {
  medicine: string;
  category: string;
  totalQuantity: number;
  batchCount: number;
  nearestExpiry: string | null;
  status: BatchStatus;
}

const STATUS_RANK: Record<BatchStatus, number> = { Expired: 4, 'Out of Stock': 3, 'Expiring Soon': 2, 'Low Stock': 1, 'In Stock': 0 };

/**
 * Inventory is an operational overview of what stock is currently available, aggregated by
 * medicine across every batch an organization holds - distinct from the batch-level ledger
 * on the Pharmaceutical Batches page. Only remaining (not yet transferred) quantity counts.
 */
export const aggregateByMedicine = (batches: Batch[]): MedicineSummary[] => {
  const groups = new Map<string, Batch[]>();
  for (const b of batches) groups.set(b.medicine, [...(groups.get(b.medicine) ?? []), b]);
  return [...groups.entries()].map(([medicine, rows]) => {
    const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
    const statuses = rows.map(batchStatus);
    const worst = statuses.reduce((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), statuses[0]);
    const withStock = rows.filter((r) => r.quantity > 0);
    const nearestExpiry = withStock.length ? withStock.reduce((a, r) => (r.expiryDate < a ? r.expiryDate : a), withStock[0].expiryDate) : null;
    return { medicine, category: rows[0].category, totalQuantity, batchCount: rows.length, nearestExpiry, status: totalQuantity > 0 ? worst : 'Out of Stock' };
  });
};