import type { Batch, Organization, Role, Transfer, TransferStatus, User } from '../types';

/**
 * Centralized Role-Based Access Control (UI layer).
 * BACKEND: every rule here must be re-enforced server-side on each API call, using the
 * authenticated user's id/role/organization from the session - never from client input.
 */
export const ALL_ROLES: Role[] = ['ADMIN', 'DISTRIBUTOR', 'PHARMACY'];

/** Pages and operational buttons visible in the sidebar, per role. */
export const canViewUsers = (r?: Role) => r === 'ADMIN';
export const canViewBatchesPage = (r?: Role) => r === 'DISTRIBUTOR';
export const canViewInventory = (r?: Role) => r === 'DISTRIBUTOR' || r === 'PHARMACY';
export const canViewHistory = (r?: Role) => r === 'DISTRIBUTOR' || r === 'PHARMACY';

/** A distributor manages only batches owned by its own organization. Admin does not create/edit batches. */
export const canManageBatches = (r?: Role) => r === 'DISTRIBUTOR';
export const canEditBatch = (user: User | null, batch: Batch) => canManageBatches(user?.role) && user!.organization === batch.owner;

/** Only a distributor creates and dispatches transfers, from its own stock. */
export const canCreateTransfer = (r?: Role) => r === 'DISTRIBUTOR';
export const canDispatch = (user: User | null, t: Transfer) => user?.role === 'DISTRIBUTOR' && user.organization === t.from && t.status === 'Pending';
export const canCancel = (user: User | null, t: Transfer) => user?.role === 'DISTRIBUTOR' && user.organization === t.from && t.status === 'Pending';
/** Only the receiving pharmacy confirms its own delivery. */
export const canConfirmDelivery = (user: User | null, t: Transfer) => user?.role === 'PHARMACY' && user.organization === t.to && t.status === 'In Transit';

export const canManageUsers = (r?: Role) => r === 'ADMIN';
/** The last active Admin account can never be deactivated or demoted - the platform must always keep one administrator. */
export const isLastActiveAdmin = (users: User[], target: User) =>
  target.role === 'ADMIN' && target.status === 'Active' && users.filter((u) => u.role === 'ADMIN' && u.status === 'Active').length <= 1;

export interface TransferAction {
  key: 'dispatch' | 'deliver' | 'cancel';
  next: TransferStatus;
  label: string;
  tone: 'primary' | 'danger';
}

/** Buttons offered for a transfer, scoped to the acting user's role AND organization - never role alone. */
export const transferActions = (user: User | null, t: Transfer): TransferAction[] => {
  const out: TransferAction[] = [];
  if (canDispatch(user, t)) out.push({ key: 'dispatch', next: 'In Transit', label: 'Dispatch shipment', tone: 'primary' });
  if (canConfirmDelivery(user, t)) out.push({ key: 'deliver', next: 'Delivered', label: 'Confirm delivery', tone: 'primary' });
  if (canCancel(user, t)) out.push({ key: 'cancel', next: 'Cancelled', label: 'Cancel', tone: 'danger' });
  return out;
};

export const organizationsOfType = (orgs: Organization[], type: 'DISTRIBUTOR' | 'PHARMACY') => orgs.filter((o) => o.type === type);
