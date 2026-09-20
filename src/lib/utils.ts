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
  Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(DEMO_TODAY + 'T00:00:00').getTime()) / 86400000);

export const batchStatus = (b: Batch): BatchStatus => {
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
