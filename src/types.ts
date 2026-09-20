export type Role = 'ADMIN' | 'DISTRIBUTOR' | 'PHARMACY';
export type UserStatus = 'Active' | 'Inactive' | 'Locked';
export type Category = 'Analgesic' | 'Antibiotic' | 'Antihistamine' | 'Antidiabetic' | 'Other';
export type BatchStatus = 'In Stock' | 'Low Stock' | 'Expiring Soon' | 'Out of Stock';
export type TransferStatus = 'Pending' | 'Approved' | 'In Transit' | 'Delivered' | 'Cancelled';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
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
  manufacturer: string;
  quantity: number;
  unitPrice: number;
  mfgDate: string;
  expiryDate: string;
  owner: string; // organization that currently holds the stock
  updatedBy: string;
  updatedAt: string;
}

export interface TimelineEvent {
  at: string;
  label: string;
  by: string;
}

export interface Transfer {
  id: string;
  batchId: string;
  medicine: string;
  from: string;
  to: string;
  quantity: number;
  date: string;
  expectedDelivery: string;
  status: TransferStatus;
  notes: string;
  createdBy: string;
  timeline: TimelineEvent[];
}

export interface Activity {
  id: string;
  at: string;
  actor: string;
  org: string; // '' = visible to admins only
  action: string;
  ref?: string;
}
