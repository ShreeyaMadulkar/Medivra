/// <reference types="vite/client" />
import type { Category, Role, User } from '../types';

/** Backend base URL. Override with VITE_API_URL in a root .env.local if the API is not on port 5000. */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5000/api';

/** The JWT lives in sessionStorage (cleared when the tab closes). It is sent as a Bearer header. */
const TOKEN_KEY = 'medivra.token';
export const tokenStore = {
  get: (): string | null => {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string) => {
    try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ }
  },
  clear: () => {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

/** Reads the (unverified) `exp` claim only to schedule a friendly sign-out. The server remains the authority on validity. */
export function tokenExpiresAt(): number | null {
  const t = tokenStore.get();
  if (!t) return null;
  try {
    const part = t.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const exp = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Called when the server answers 401 to a request that carried a token (expired, tampered, revoked or the
 * account/organization was deactivated). The store registers a handler that signs the user out.
 */
let unauthorizedHandler: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { unauthorizedHandler = fn; };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string>,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

async function request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check that the backend is running and try again.');
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) unauthorizedHandler?.();
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Request failed.', e?.details, e?.retryAfterSeconds);
  }
  return data as T;
}

export interface RegisterInput { name: string; email: string; phone: string; organization: string; role: Role; password: string }

/* ---------- Backend response shapes (see server/src/services/*.js) ---------- */
export interface Pagination { page: number; limit: number; total: number; totalPages: number }
export type ApiBatchStatus = 'In Stock' | 'Low Stock' | 'Expiring Soon' | 'Out of Stock' | 'Expired';
export interface ApiBatch {
  id: string; batchId: string; batchNumber: string; medicineName: string; category: Category; manufacturer: string;
  manufactureDate: string; expiryDate: string; originalQuantity: number; unitPrice: number; notes: string;
  originOrganizationId: string; originOrganization: string;
  quantity: number; status: ApiBatchStatus; createdAt: string; updatedAt: string;
}
export type ApiTransferStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
export interface ApiTransferItem {
  batchId: string; batchNumber: string; medicineName: string; manufacturer: string; expiryDate: string;
  quantity: number; receivedQuantity: number | null;
}
export interface ApiTransfer {
  id: string; reference: string; status: ApiTransferStatus; statusLabel: 'Pending' | 'In Transit' | 'Delivered' | 'Cancelled';
  fromOrganizationId: string; fromOrganization: string; toOrganizationId: string; toOrganization: string;
  items: ApiTransferItem[]; totalQuantity: number; expectedDelivery: string | null; notes: string; cancelReason: string | null;
  createdAt: string; dispatchedAt: string | null; deliveredAt: string | null; cancelledAt: string | null;
  timeline: { at: string; event: 'CREATED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'; by: string | null }[];
}
export interface ApiOrganization { id: string; name: string; type: 'DISTRIBUTOR' | 'PHARMACY'; status: 'Active' | 'Inactive' }
export interface ApiAuditLog {
  ip?: string | null;
  id: string; at: string; action: string; entityType: string; entityId: string | null; actorId: string | null; actor: string | null;
  actorRole: Role | null; organizationId: string | null; organization: string | null; details: unknown;
}
export interface InventorySummary {
  scope: 'ORGANIZATION' | 'PLATFORM'; distinctBatches: number; availableUnits: number; inventoryValue: number;
  lowStockBatches: number; outOfStockBatches: number; expiringSoonBatches: number; expiredBatchesWithStock: number; pendingTransfers: number;
  inTransitOutUnits?: number; inTransitInUnits?: number; inTransitUnits?: number;
}
export interface AdminOverview {
  organizations: { total: number; active: number; distributors: number; pharmacies: number };
  users: { total: number; active: number; admins: number };
  inventory: { distinctBatches: number; availableUnits: number; inTransitUnits: number };
  transfers: Record<ApiTransferStatus, number>;
}
export interface CreateUserInput { name: string; email: string; phone: string; role: Role; organizationId?: string; password: string }
export interface UpdateUserInput { name?: string; phone?: string; status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' }
export interface CreateBatchInput {
  batchNumber: string; medicineName: string; category: Category; manufacturer: string;
  manufactureDate: string; expiryDate: string; unitPrice: number; quantity: number; notes?: string;
}
export type UpdateBatchInput = Partial<Omit<CreateBatchInput, 'quantity'>>;
export interface CreateTransferInput { toOrganizationId: string; items: { batchId: string; quantity: number }[]; expectedDelivery?: string; notes?: string }

/** The list endpoints are paginated (max 100 per page); this walks every page so the UI never shows a silent partial list. */
async function fetchAll<T>(path: string, key: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await request<Record<string, any>>('GET', `${path}${sep}page=${page}&limit=100`);
    out.push(...((r[key] as T[]) ?? []));
    const pg = r.pagination as Pagination | undefined;
    if (!pg || page >= pg.totalPages) break;
  }
  return out;
}

export const api = {
  login: (b: { email: string; password: string; role: Role }) => request<{ token: string; user: User }>('POST', '/auth/login', b),
  register: (b: RegisterInput) => request<{ user: User; message: string }>('POST', '/auth/register', b),
  me: () => request<{ user: User }>('GET', '/auth/me').then((r) => r.user),

  /* reads */
  listBatches: () => fetchAll<ApiBatch>('/batches', 'batches'),
  listTransfers: () => fetchAll<ApiTransfer>('/transfers', 'transfers'),
  /** DISTRIBUTOR (and ADMIN): active pharmacies a transfer can be addressed to. */
  listPharmacies: () => fetchAll<{ id: string; name: string; type: 'PHARMACY' }>('/organizations/pharmacies', 'organizations'),
  /** ADMIN only. */
  listOrganizations: () => fetchAll<ApiOrganization>('/organizations', 'organizations'),
  listUsers: () => fetchAll<User>('/users', 'users'),
  /** One filtered, paginated page of the audit log (ADMIN: platform-wide; others: own organization only, enforced by the server). */
  listAuditPage: (params: { page?: number; limit?: number; action?: string; entityType?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    return request<{ auditLogs: ApiAuditLog[]; pagination: Pagination }>('GET', `/audit-logs?${qs.toString()}`);
  },
  listAuditLogs: () => request<{ auditLogs: ApiAuditLog[] }>('GET', '/audit-logs?limit=100').then((r) => r.auditLogs),
  inventorySummary: () => request<{ summary: InventorySummary }>('GET', '/inventory/summary').then((r) => r.summary),
  adminOverview: () => request<{ overview: AdminOverview }>('GET', '/admin/overview').then((r) => r.overview),

  /* admin: users and organizations (ADMIN only; the server re-checks the role) */
  createUser: (b: CreateUserInput) => request<{ user: User }>('POST', '/users', b).then((r) => r.user),
  updateUser: (id: string, b: UpdateUserInput) => request<{ user: User }>('PATCH', `/users/${id}`, b).then((r) => r.user),
  createOrganization: (b: { name: string; type: 'DISTRIBUTOR' | 'PHARMACY' }) => request<{ organization: ApiOrganization }>('POST', '/organizations', b).then((r) => r.organization),
  updateOrganization: (id: string, b: { name?: string; status?: 'ACTIVE' | 'INACTIVE' }) => request<{ organization: ApiOrganization }>('PATCH', `/organizations/${id}`, b).then((r) => r.organization),

  /* batches (DISTRIBUTOR) */
  createBatch: (b: CreateBatchInput) => request<{ batch: ApiBatch }>('POST', '/batches', b).then((r) => r.batch),
  updateBatch: (id: string, b: UpdateBatchInput) => request<{ batch: ApiBatch }>('PATCH', `/batches/${id}`, b).then((r) => r.batch),
  adjustStock: (id: string, b: { delta: number; reason: string }) => request<{ before: number; after: number }>('POST', `/inventory/${id}/adjust`, b),

  /* transfers: PENDING -> IN_TRANSIT -> DELIVERED, or PENDING -> CANCELLED */
  createTransfer: (b: CreateTransferInput) => request<{ transfer: ApiTransfer }>('POST', '/transfers', b).then((r) => r.transfer),
  dispatchTransfer: (id: string) => request<{ transfer: ApiTransfer }>('POST', `/transfers/${id}/dispatch`).then((r) => r.transfer),
  receiveTransfer: (id: string) => request<{ transfer: ApiTransfer }>('POST', `/transfers/${id}/receive`).then((r) => r.transfer),
  cancelTransfer: (id: string, reason?: string) => request<{ transfer: ApiTransfer }>('POST', `/transfers/${id}/cancel`, reason ? { reason } : {}).then((r) => r.transfer),
};
