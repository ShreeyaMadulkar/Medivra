import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, Batch, Organization, Role, Transfer, User } from './types';
import { seedActivity, seedBatches, seedOrganizations, seedTransfers, seedUsers } from './data/mock';
import { nextId, nowIso, todayIso, uid } from './lib/utils';
import { canCreateTransfer, canConfirmDelivery, canDispatch, canCancel, canEditBatch, canManageBatches, isLastActiveAdmin } from './lib/rbac';
import { api, ApiError, tokenStore } from './services/api';

/**
 * Prototype data layer.
 * --------------------------------------------------------------------------------------
 * Everything lives in React state + localStorage. When the Node/Express backend is added,
 * replace the bodies of the functions below with API calls. The server must then:
 *   - use PREPARED STATEMENTS (parameterised queries, e.g. mysql2) for every database operation
 *   - re-check RBAC on every request using the authenticated session, not client-supplied role/org
 *   - write an AUDIT LOG row for every important action (see `log`)
 *   - hash passwords with SHA-512 + per-user salt, and encrypt sensitive columns with AES-256-GCM
 */

const K = 'medivra.v2.';
function usePersisted<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(K + key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(K + key, JSON.stringify(v));
    } catch {
      /* storage unavailable - prototype keeps working in memory */
    }
  }, [key, v]);
  return [v, setV];
}

export type LoginResult = { ok: true } | { ok: false; kind: 'invalid' | 'locked' | 'inactive'; message: string; retryAfterSeconds?: number };
export type NewBatch = Omit<Batch, 'id' | 'updatedBy' | 'updatedAt' | 'owner' | 'ownerId' | 'originalQuantity'>;
export interface NewTransfer { batchId: string; to: string; quantity: number; expectedDelivery: string; notes: string }
export interface Registration { name: string; email: string; phone: string; organization: string; role: Role; password: string }
export type RegisterResult = { ok: true; message: string } | { ok: false; message: string; code?: string; fieldErrors?: Record<string, string> };
export type DeliveryResult = { ok: true; discrepancy: boolean } | { ok: false; message: string };

interface Ctx {
  user: User | null;
  users: User[];
  organizations: Organization[];
  batches: Batch[];
  transfers: Transfer[];
  activity: Activity[];
  visibleBatches: Batch[];
  visibleTransfers: Transfer[];
  visibleActivity: Activity[];
  toast: string | null;
  notify: (m: string) => void;
  login: (email: string, password: string, role: Role) => Promise<LoginResult>;
  logout: () => void;
  register: (r: Registration) => Promise<RegisterResult>;
  log: (action: string, ref?: string, outcome?: Activity['outcome']) => void;
  addBatch: (b: NewBatch) => Batch | null;
  updateBatch: (id: string, patch: Partial<Batch>) => boolean;
  deleteBatch: (id: string) => boolean;
  createTransfer: (t: NewTransfer) => { ok: true; transfer: Transfer } | { ok: false; message: string };
  dispatchTransfer: (id: string) => boolean;
  confirmDelivery: (id: string, receivedQuantity: number) => DeliveryResult;
  cancelTransfer: (id: string) => boolean;
  addUser: (u: Omit<User, 'id' | 'lastLogin'>) => void;
  updateUser: (u: User) => { ok: boolean; message?: string };
  updateOwnProfile: (patch: Partial<User>) => void;
  resetDemo: () => void;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = usePersisted<User[]>('users', seedUsers);
  const [organizations] = usePersisted<Organization[]>('organizations', seedOrganizations);
  const [batches, setBatches] = usePersisted<Batch[]>('batches', seedBatches);
  const [transfers, setTransfers] = usePersisted<Transfer[]>('transfers', seedTransfers);
  const [activity, setActivity] = usePersisted<Activity[]>('activity', seedActivity);
  const [session, setSession] = usePersisted<string | null>('session', null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  const user = useMemo(() => users.find((u) => u.id === session) ?? null, [users, session]);

  const notify = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  /* ---------- Audit logging (prototype) ---------- */
  const addActivity = (action: string, actor: string, actorId: string | undefined, actorRole: Role | undefined, org: string, ref?: string, outcome: Activity['outcome'] = 'success') =>
    setActivity((p) => [{ id: 'A-' + uid(), at: nowIso(), actor, actorId, actorRole, org, action, ref, outcome }, ...p].slice(0, 250));
  const log: Ctx['log'] = (action, ref, outcome = 'success') => addActivity(action, user?.name ?? 'Unknown', user?.id, user?.role, user?.organization ?? '', ref, outcome);

  /* ---------- Authentication (real API: the server hashes passwords, enforces lockout and issues the JWT) ---------- */
  const applyServerUser = useCallback((u: User) => {
    setUsers((p) => (p.some((x) => x.id === u.id) ? p.map((x) => (x.id === u.id ? u : x)) : [...p, u]));
    setSession(u.id);
  }, [setUsers, setSession]);

  // On page load, only keep the session if the stored token is still accepted by the server.
  useEffect(() => {
    if (!session) return;
    if (!tokenStore.get()) { setSession(null); return; }
    api.me().then(applyServerUser).catch((e) => {
      if (e instanceof ApiError && e.status === 401) { tokenStore.clear(); setSession(null); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login: Ctx['login'] = async (email, password, role) => {
    try {
      const { token, user: u } = await api.login({ email, password, role });
      tokenStore.set(token);
      applyServerUser(u);
      addActivity('User logged in', u.name, u.id, u.role, u.organization);
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'ACCOUNT_LOCKED') return { ok: false, kind: 'locked', message: e.message, retryAfterSeconds: e.retryAfterSeconds };
        return { ok: false, kind: e.status === 403 ? 'inactive' : 'invalid', message: e.message };
      }
      return { ok: false, kind: 'invalid', message: 'Cannot reach the server. Please try again.' };
    }
  };

  const logout = () => {
    if (user) log('User logged out');
    tokenStore.clear();
    setSession(null);
  };

  const register: Ctx['register'] = async (r) => {
    try {
      const res = await api.register(r);
      return { ok: true, message: res.message };
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, message: e.message, code: e.code, fieldErrors: e.details };
      return { ok: false, message: 'Cannot reach the server. Please try again.' };
    }
  };

  /* ---------- Batches (organization-scoped) ---------- */
  const addBatch: Ctx['addBatch'] = (input) => {
    if (!user || !canManageBatches(user.role)) return null;
    const id = nextId(batches.map((b) => b.id), 'B-', 2052);
    // BACKEND: INSERT INTO batches (...) VALUES (?, ?, ...)  -- prepared statement; encrypt sensitive columns (AES-256-GCM).
    const batch: Batch = { ...input, originalQuantity: input.quantity, owner: user.organization, ownerId: user.organizationId, id, updatedBy: user.name, updatedAt: nowIso() };
    setBatches((p) => [batch, ...p]);
    log(`Batch ${id} added`, id);
    return batch;
  };

  const updateBatch: Ctx['updateBatch'] = (id, patch) => {
    const existing = batches.find((b) => b.id === id);
    if (!user || !existing || !canEditBatch(user, existing)) return false;
    // BACKEND: UPDATE batches SET ... WHERE id = ? AND owner_id = ?  -- prepared statement, re-checked server-side
    setBatches((p) => p.map((b) => (b.id === id ? { ...b, ...patch, updatedBy: user.name, updatedAt: nowIso() } : b)));
    log(`Batch ${id} updated`, id);
    return true;
  };

  const deleteBatch: Ctx['deleteBatch'] = (id) => {
    const existing = batches.find((b) => b.id === id);
    if (!user || !existing || !canEditBatch(user, existing)) return false;
    // BACKEND: DELETE FROM batches WHERE id = ? AND owner_id = ?  -- prepared statement (consider soft delete for traceability)
    setBatches((p) => p.filter((b) => b.id !== id));
    log(`Batch ${id} deleted`, id);
    return true;
  };

  /* ---------- Transfers: Pending -> In Transit -> Delivered, or Cancelled ---------- */
  const createTransfer: Ctx['createTransfer'] = (input) => {
    if (!user || !canCreateTransfer(user.role)) return { ok: false, message: 'Your role cannot create transfers.' };
    const batch = batches.find((b) => b.id === input.batchId);
    if (!batch || batch.owner !== user.organization) return { ok: false, message: 'Select a pharmaceutical batch that belongs to your organization.' };
    const destination = organizations.find((o) => o.name === input.to && o.type === 'PHARMACY' && o.status === 'Active');
    if (!destination) return { ok: false, message: 'Select a valid, active destination pharmacy.' };
    if (input.quantity <= 0 || input.quantity > batch.quantity) return { ok: false, message: `Quantity must be between 1 and ${batch.quantity}.` };
    if (batch.expiryDate < todayIso()) return { ok: false, message: 'This batch has expired and cannot be transferred.' };
    const id = nextId(transfers.map((t) => t.id), 'TR-', 1024);
    const now = nowIso();
    const transfer: Transfer = {
      id, batchId: batch.id, medicine: batch.medicine, from: batch.owner, fromOrgId: batch.ownerId, to: destination.name, toOrgId: destination.id,
      quantity: input.quantity, date: todayIso(), expectedDelivery: input.expectedDelivery, status: 'Pending', notes: input.notes, createdBy: user.name,
      timeline: [{ at: now, label: 'Transfer created', by: user.name, byRole: 'DISTRIBUTOR' }],
    };
    // BACKEND: one DB transaction (prepared statements): INSERT transfer + UPDATE batch quantity + INSERT audit row.
    setTransfers((p) => [transfer, ...p]);
    setBatches((p) => p.map((b) => (b.id === batch.id ? { ...b, quantity: b.quantity - input.quantity, updatedBy: user.name, updatedAt: now } : b)));
    log(`Transfer ${id} created`, id);
    return { ok: true, transfer };
  };

  /** Only the sending distributor may dispatch its own Pending transfer. */
  const dispatchTransfer: Ctx['dispatchTransfer'] = (id) => {
    const t = transfers.find((x) => x.id === id);
    if (!user || !t || !canDispatch(user, t)) return false;
    const now = nowIso();
    setTransfers((p) => p.map((x) => (x.id === id ? { ...x, status: 'In Transit', dispatchedAt: now, timeline: [...x.timeline, { at: now, label: 'Shipment dispatched', by: user.name, byRole: 'DISTRIBUTOR' }] } : x)));
    log(`Transfer ${id} dispatched`, id);
    return true;
  };

  /**
   * Only the destination pharmacy may confirm its own In Transit delivery, and it records the
   * quantity actually received. A mismatch against the dispatched quantity is never silently
   * accepted as a full delivery - it is flagged as a discrepancy in the record and the activity log.
   */
  const confirmDelivery: Ctx['confirmDelivery'] = (id, receivedQuantity) => {
    const t = transfers.find((x) => x.id === id);
    if (!user || !t || !canConfirmDelivery(user, t)) return { ok: false, message: 'You are not authorized to confirm this delivery.' };
    if (!Number.isFinite(receivedQuantity) || receivedQuantity < 0) return { ok: false, message: 'Enter a valid received quantity.' };
    const discrepancy = receivedQuantity !== t.quantity;
    const now = nowIso();
    const label = discrepancy ? `Delivery confirmed with discrepancy (expected ${t.quantity}, received ${receivedQuantity})` : 'Delivery confirmed';

    setTransfers((p) => p.map((x) => (x.id === id ? { ...x, status: 'Delivered', deliveredAt: now, receivedQuantity, timeline: [...x.timeline, { at: now, label, by: user.name, byRole: 'PHARMACY' }] } : x)));

    // BACKEND: single transaction - UPDATE transfer, UPSERT the destination's batch stock, INSERT audit row.
    if (receivedQuantity > 0) {
      const src = batches.find((b) => b.id === t.batchId);
      setBatches((p) => {
        const existing = src && p.find((b) => b.ownerId === t.toOrgId && b.batchNo === src.batchNo);
        if (existing) return p.map((b) => (b.id === existing.id ? { ...b, quantity: b.quantity + receivedQuantity, updatedAt: now, updatedBy: user.name } : b));
        if (!src) return p;
        return [{ ...src, id: nextId(p.map((b) => b.id), 'B-', 2052), owner: t.to, ownerId: t.toOrgId, originalQuantity: receivedQuantity, quantity: receivedQuantity, updatedAt: now, updatedBy: user.name }, ...p];
      });
    }
    log(discrepancy ? `Delivery confirmed for transfer ${id} with a quantity discrepancy` : `Delivery confirmed for transfer ${id}`, id, discrepancy ? 'failure' : 'success');
    return { ok: true, discrepancy };
  };

  /** Only the sending distributor may cancel its own Pending transfer; the reserved stock returns to the batch. */
  const cancelTransfer: Ctx['cancelTransfer'] = (id) => {
    const t = transfers.find((x) => x.id === id);
    if (!user || !t || !canCancel(user, t)) return false;
    const now = nowIso();
    setTransfers((p) => p.map((x) => (x.id === id ? { ...x, status: 'Cancelled', timeline: [...x.timeline, { at: now, label: 'Transfer cancelled', by: user.name, byRole: 'DISTRIBUTOR' }] } : x)));
    setBatches((p) => p.map((b) => (b.id === t.batchId ? { ...b, quantity: b.quantity + t.quantity, updatedAt: now, updatedBy: user.name } : b)));
    log(`Transfer ${id} cancelled`, id);
    return true;
  };

  /* ---------- Users / Organizations (admin) ---------- */
  const addUser: Ctx['addUser'] = (u) => {
    if (!user || user.role !== 'ADMIN') return;
    const id = nextId(users.map((x) => x.id), 'U-', 0).replace(/(\d+)$/, (m) => m.padStart(3, '0'));
    setUsers((p) => [...p, { ...u, id, lastLogin: null }]);
    log(`User account created: ${u.name}`, id);
  };
  const updateUser: Ctx['updateUser'] = (u) => {
    if (!user || user.role !== 'ADMIN') return { ok: false, message: 'Not authorized.' };
    const before = users.find((x) => x.id === u.id);
    if (before && isLastActiveAdmin(users, before) && (u.role !== 'ADMIN' || u.status !== 'Active')) {
      return { ok: false, message: 'This is the last active administrator account. Promote another admin before changing this one.' };
    }
    setUsers((p) => p.map((x) => (x.id === u.id ? u : x)));
    log(`User account updated: ${u.name}`, u.id);
    return { ok: true };
  };
  const updateOwnProfile: Ctx['updateOwnProfile'] = (patch) => {
    if (!user) return;
    setUsers((p) => p.map((x) => (x.id === user.id ? { ...x, ...patch } : x)));
    log('Profile details updated');
  };

  const resetDemo = () => {
    setUsers(seedUsers); setBatches(seedBatches); setTransfers(seedTransfers); setActivity(seedActivity);
    if (!seedUsers.some((u) => u.id === session)) { tokenStore.clear(); setSession(null); }
    notify('Demo data has been reset.');
  };

  const scoped = <T,>(all: T[], pick: (t: T) => string) => (!user ? [] : user.role === 'ADMIN' ? all : all.filter((x) => pick(x) === user.organization));
  const visibleBatches = scoped(batches, (b) => b.owner);
  const visibleTransfers = !user ? [] : user.role === 'ADMIN' ? transfers : user.role === 'DISTRIBUTOR' ? transfers.filter((t) => t.from === user.organization) : transfers.filter((t) => t.to === user.organization);
  const visibleActivity = scoped(activity, (a) => a.org).slice().sort((a, b) => b.at.localeCompare(a.at));

  return (
    <AppCtx.Provider value={{ user, users, organizations, batches, transfers, activity, visibleBatches, visibleTransfers, visibleActivity, toast, notify, login, logout, register, log, addBatch, updateBatch, deleteBatch, createTransfer, dispatchTransfer, confirmDelivery, cancelTransfer, addUser, updateUser, updateOwnProfile, resetDemo }}>
      {children}
    </AppCtx.Provider>
  );
}
