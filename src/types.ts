export type Role = 'ADMIN' | 'DISTRIBUTOR' | 'PHARMACY';
export type OrgType = 'DISTRIBUTOR' | 'PHARMACY';
export type OrgStatus = 'Active' | 'Inactive';
export type UserStatus = 'Active' | 'Inactive' | 'Locked';
export type Category = 'Analgesic' | 'Antibiotic' | 'Antihistamine' | 'Antidiabetic' | 'Other';
export type BatchStatus = 'In Stock' | 'Low Stock' | 'Expiring Soon' | 'Out of Stock';
/** Pending -> In Transit -> Delivered. Cancelled is a separate terminal state. There is no ordinary admin-approval step. */
export type TransferStatus = 'Pending' | 'In Transit' | 'Delivered' | 'Cancelled';

/** A registered distributor or pharmacy organization. Admin is a platform role, not an organization. */
export interface Organization {
  id: string; // stable identifier; currently the organization's display name
  name: string;
  type: OrgType;
  status: OrgStatus;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string; // display name, kept for convenience
  organizationId: string; // references Organization.id; '' for platform Admin accounts
  role: Role;
  status: UserStatus;
  lastLogin: string | null;
  // NOTE: no password field. Passwords will be stored server-side as SHA-512 hashes only.
}

export interface Batch {
  id: string;
  batchNo: string;
  medicine: string;
  category: Category;
  manufacturer: string; // a property of the batch, not a user/organization
  originalQuantity: number; // quantity this batch record started with
  quantity: number; // current remaining quantity for this owner
  unitPrice: number;
  mfgDate: string;
  expiryDate: string;
  owner: string; // organization NAME that currently holds this stock
  ownerId: string; // organization ID that currently holds this stock
  updatedBy: string;
  updatedAt: string;
}

export interface TimelineEvent {
  at: string;
  label: string;
  by: string;
  byRole?: Role;
}

export interface Transfer {
  id: string;
  batchId: string;
  medicine: string;
  from: string; // sending distributor NAME
  fromOrgId: string; // sending distributor ID
  to: string; // destination pharmacy NAME
  toOrgId: string; // destination pharmacy ID
  quantity: number; // quantity dispatched/requested
  receivedQuantity?: number; // quantity the pharmacy actually confirmed, once delivered
  date: string;
  expectedDelivery: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  status: TransferStatus;
  notes: string;
  createdBy: string;
  timeline: TimelineEvent[];
}

export interface Activity {
  id: string;
  at: string;
  actor: string; // actor display name
  actorId?: string;
  actorRole?: Role;
  org: string; // '' = platform-level event, visible to admins only
  action: string;
  ref?: string; // related batch or transfer ID
  outcome?: 'success' | 'failure';
}
