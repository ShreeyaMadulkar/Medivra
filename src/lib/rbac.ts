import type { Role, TransferStatus } from '../types';

/**
 * Role-Based Access Control (UI layer).
 * BACKEND: every rule here must be re-enforced server-side on each API call.
 * Hiding a button in the browser is a convenience, never a security control.
 */
export const ALL_ROLES: Role[] = ['ADMIN', 'DISTRIBUTOR', 'PHARMACY'];

export const canManageBatches = (r?: Role) => r === 'ADMIN' || r === 'DISTRIBUTOR';
export const canCreateTransfer = (r?: Role) => r === 'ADMIN' || r === 'DISTRIBUTOR';
export const canManageUsers = (r?: Role) => r === 'ADMIN';

export interface TransferAction {
  next: TransferStatus;
  label: string;
  tone: 'primary' | 'danger';
}

export const transferActions = (role: Role | undefined, status: TransferStatus): TransferAction[] => {
  if (!role) return [];
  const seller = role === 'ADMIN' || role === 'DISTRIBUTOR';
  const buyer = role === 'ADMIN' || role === 'PHARMACY';
  const out: TransferAction[] = [];
  if (status === 'Pending' && seller) out.push({ next: 'Approved', label: 'Approve', tone: 'primary' });
  if (status === 'Approved' && seller) out.push({ next: 'In Transit', label: 'Dispatch', tone: 'primary' });
  if (status === 'In Transit' && buyer) out.push({ next: 'Delivered', label: 'Confirm delivery', tone: 'primary' });
  if ((status === 'Pending' || status === 'Approved') && seller) out.push({ next: 'Cancelled', label: 'Cancel', tone: 'danger' });
  return out;
};
