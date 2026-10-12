import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, Batch, Organization, Role, Transfer, User } from './types';
import { nextId, nowIso, uid } from './lib/utils';
import { canCreateTransfer, canConfirmDelivery, canDispatch, canCancel, canEditBatch, canManageBatches, isLastActiveAdmin } from './lib/rbac';
import { api, ApiError, setUnauthorizedHandler, tokenExpiresAt, tokenStore } from './services/api';
import type { AdminOverview, InventorySummary } from './services/api';
import { mapAudit, mapBatch, mapOrganization, mapTransfer, transferApiId } from './services/mappers';

/**
 * Data layer.
 * --------------------------------------------------------------------------------------
 * Batches, transfers, organizations, activity and dashboard statistics come from the Express API
 * (see services/api.ts and services/mappers.ts). Nothing is mocked or cached in localStorage for them:
 * the server enforces RBAC, writes the audit log and owns every stock movement, so each mutation below
 * calls the matching endpoint and then reloads server data. The signed-in user comes from the server (login / GET /auth/me);
 * only the JWT is kept, in sessionStorage (see services/api.ts). No user, session or business data is cached in localStorage.
 */

const K = 'medivra.v2.';
/** Keys written by older prototype versions. The session user and mock users must never be trusted from browser storage. */
const LEGACY_KEYS = ['users', 'session', 'batches', 'transfers', 'organizations', 'activity'];

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous' | 'unreachable';

export type LoginResult = { ok: true } | { ok: false; kind: 'invalid' | 'locked' | 'inactive' | 'network'; message: string; retryAfterSeconds?: number };
export type NewBatch = Omit<Batch, 'id' | 'updatedBy' | 'updatedAt' | 'owner' | 'ownerId' | 'originalQuantity'>;
/** `to` is the destination pharmacy's organization id (never a name). */
export interface NewTransfer { batchId: string; to: string; quantity: number; expectedDelivery: string; notes: string }
export interface Registration { name: string; email: string; phone: string; organization: string; role: Role; password: string }
export type RegisterResult = { ok: true; message: string } | { ok: false; message: string; code?: string; fieldErrors?: Record<string, string> };
export type MutationResult = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> };
export type DeliveryResult = MutationResult;

interface Ctx {
  user: User | null;
  authStatus: AuthStatus;
  retrySession: () => void;
  users: User[];
  organizations: Organization[];
  batches: Batch[];
  transfers: Transfer[];
  activity: Activity[];
  visibleBatches: Batch[];
  visibleTransfers: Transfer[];
  visibleActivity: Activity[];
  summary: InventorySummary | null;
  overview: AdminOverview | null;
  dataLoading: boolean;
  dataLoaded: boolean;
  dataError: string | null;
  refresh: () => Promise<void>;
  toast: string | null;
  notify: (m: string) => void;
  login: (email: string, password: string, role: Role) => Promise<LoginResult>;
  logout: () => void;
  register: (r: Registration) => Promise<RegisterResult>;
  log: (action: string, ref?: string, outcome?: Activity['outcome']) => void;
  addBatch: (b: NewBatch) => Promise<({ ok: true; batch: Batch }) | { ok: false; message: string; fieldErrors?: Record<string, string> }>;
  updateBatch: (id: string, patch: Partial<Batch>) => Promise<MutationResult>;
  deleteBatch: (id: string) => Promise<MutationResult>;
  createTransfer: (t: NewTransfer) => Promise<{ ok: true; transfer: Transfer } | { ok: false; message: string; fieldErrors?: Record<string, string> }>;
  dispatchTransfer: (id: string) => Promise<MutationResult>;
  confirmDelivery: (id: string) => Promise<DeliveryResult>;
  cancelTransfer: (id: string) => Promise<MutationResult>;
  addUser: (u: Omit<User, 'id' | 'lastLogin'>) => void;
  updateUser: (u: User) => { ok: boolean; message?: string };
  updateOwnProfile: (patch: Partial<User>) => void;
  resetDemo: () => void;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (tokenStore.get() ? 'checking' : 'anonymous'));
  const [users, setUsers] = useState<User[]>([]); // ADMIN only: loaded from GET /users
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [serverActivity, setServerActivity] = useState<Activity[]>([]);
  const [localActivity, setLocalActivity] = useState<Activity[]>([]); // client-side events of this tab only (e.g. blocked route access)
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  const activity = useMemo(() => [...localActivity, ...serverActivity], [localActivity, serverActivity]);

  // Drop mock data and cached sessions that older prototype versions left in the browser.
  useEffect(() => {
    try { LEGACY_KEYS.forEach((k) => localStorage.removeItem(K + k)); } catch { /* storage unavailable */ }
  }, []);

  const notify = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  /* ---------- Activity: server audit log + this tab's client-side events ---------- */
  const addActivity = (action: string, actor: string, actorId: string | undefined, actorRole: Role | undefined, org: string, ref?: string, outcome: Activity['outcome'] = 'success') =>
    setLocalActivity((p) => [{ id: 'A-' + uid(), at: nowIso(), actor, actorId, actorRole, org, action, ref, outcome }, ...p].slice(0, 50));
  const log: Ctx['log'] = (action, ref, outcome = 'success') => addActivity(action, user?.name ?? 'Unknown', user?.id, user?.role, user?.organization ?? '', ref, outcome);

  /* ---------- Authentication (real API: the server hashes passwords, enforces lockout and issues the JWT) ---------- */
  const clearServerData = () => {
    setOrganizations([]); setBatches([]); setTransfers([]); setServerActivity([]); setLocalActivity([]); setUsers([]);
    setSummary(null); setOverview(null); setDataError(null); setDataLoaded(false); setDataLoading(false);
  };

  /** Ends the local session. Used by logout, token expiry and 401 responses. */
  const endSession = useCallback((message?: string) => {
    tokenStore.clear();
    setUser(null);
    setAuthStatus('anonymous');
    clearServerData();
    if (message) notify(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify]);

  // The server rejected our token (expired, invalid, or the account was deactivated).
  useEffect(() => {
    setUnauthorizedHandler(() => endSession('Your session has expired. Please sign in again.'));
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  // Page load: a stored token only counts if the server still accepts it. The user comes from the server, never from browser storage.
  const verifySession = useCallback(async () => {
    if (!tokenStore.get()) { setAuthStatus('anonymous'); return; }
    setAuthStatus('checking');
    try {
      setUser(await api.me());
      setAuthStatus('authenticated');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { tokenStore.clear(); setUser(null); setAuthStatus('anonymous'); }
      else setAuthStatus('unreachable'); // server down: keep the token, let the person retry
    }
  }, []);
  useEffect(() => { void verifySession(); }, [verifySession]);

  // Sign out automatically when the JWT reaches its expiry time.
  useEffect(() => {
    if (!user) return;
    const exp = tokenExpiresAt();
    if (!exp) return;
    const id = window.setTimeout(() => endSession('Your session has expired. Please sign in again.'), Math.min(Math.max(exp - Date.now(), 0), 2_147_000_000));
    return () => window.clearTimeout(id);
  }, [user?.id, endSession]);

  const login: Ctx['login'] = async (email, password, role) => {
    try {
      const { token, user: u } = await api.login({ email: email.trim(), password, role });
      tokenStore.set(token);
      setUser(u);
      setAuthStatus('authenticated');
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'ACCOUNT_LOCKED') return { ok: false, kind: 'locked', message: e.message, retryAfterSeconds: e.retryAfterSeconds };
        if (e.code === 'NETWORK') return { ok: false, kind: 'network', message: e.message };
        return { ok: false, kind: e.status === 403 ? 'inactive' : 'invalid', message: e.message };
      }
      return { ok: false, kind: 'network', message: 'Something went wrong. Please try again.' };
    }
  };

  const logout = () => endSession();

  /* ---------- Server data: loaded after login / page reload, and refreshed after every mutation ---------- */
  const loadSeq = useRef(0);
  const refresh = useCallback(async () => {
    if (!user || !tokenStore.get()) return;
    const seq = ++loadSeq.current;
    setDataLoading(true);
    const admin = user.role === 'ADMIN';
    const jobs: [string, Promise<unknown>, (v: any) => void][] = [
      ['batches', api.listBatches(), (v) => setBatches(v.map((b: any) => mapBatch(b, user)))],
      ['transfers', api.listTransfers(), (v) => setTransfers(v.map(mapTransfer))],
      ['activity', api.listAuditLogs(), (v) => setServerActivity(v.map(mapAudit))],
      ['inventory summary', api.inventorySummary(), (v) => setSummary(v)],
    ];
    if (admin) {
      jobs.push(['organizations', api.listOrganizations(), (v) => setOrganizations(v.map(mapOrganization))]);
      jobs.push(['users', api.listUsers(), (v) => setUsers(v)]);
      jobs.push(['platform overview', api.adminOverview(), (v) => setOverview(v)]);
    } else if (user.role === 'DISTRIBUTOR') {
      jobs.push(['pharmacies', api.listPharmacies(), (v) => setOrganizations(v.map(mapOrganization))]);
    }
    const results = await Promise.allSettled(jobs.map((j) => j[1]));
    if (seq !== loadSeq.current) return; // a newer load superseded this one
    const failures: string[] = [];
    let unauthorized = false;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') jobs[i][2](r.value);
      else {
        const e = r.reason;
        if (e instanceof ApiError && e.status === 401) unauthorized = true;
        failures.push(`${jobs[i][0]}: ${e instanceof ApiError ? e.message : 'unexpected error'}`);
      }
    });
    setDataLoading(false);
    if (unauthorized) return; // the 401 handler has already signed the user out
    setDataError(failures.length ? `Some data could not be loaded from the server (${failures.join('; ')}).` : null);
    // Show the app once the core lists (batches, transfers) loaded; otherwise stay on the error + Retry state instead of pretending the lists are empty.
    if (results[0].status === 'fulfilled' && results[1].status === 'fulfilled') setDataLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, user?.organizationId]);

  useEffect(() => {
    if (user && tokenStore.get()) void refresh();
  }, [user?.id, refresh]);

  const fail = (e: unknown, fallback: string): { ok: false; message: string; fieldErrors?: Record<string, string> } => {
    if (e instanceof ApiError) return { ok: false, message: e.message, fieldErrors: e.details };
    return { ok: false, message: fallback };
  };
  /** After a successful write, reload from the server. A reload failure is shown via dataError, never reported as a write failure. */
  const afterWrite = async () => { await refresh(); };

  const register: Ctx['register'] = async (r) => {
    try {
      const res = await api.register(r);
      return { ok: true, message: res.message };
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, message: e.message, code: e.code, fieldErrors: e.details };
      return { ok: false, message: 'Cannot reach the server. Please try again.' };
    }
  };

  /* ---------- Batches (DISTRIBUTOR writes; the server re-checks role and organization) ---------- */
  const addBatch: Ctx['addBatch'] = async (input) => {
    if (!user || !canManageBatches(user.role)) return { ok: false, message: 'Your role cannot add batches.' };
    try {
      const created = await api.createBatch({
        batchNumber: input.batchNo, medicineName: input.medicine, category: input.category, manufacturer: input.manufacturer,
        manufactureDate: input.mfgDate, expiryDate: input.expiryDate, unitPrice: input.unitPrice, quantity: input.quantity,
      });
      await afterWrite();
      return { ok: true, batch: mapBatch(created, user) };
    } catch (e) {
      return fail(e, 'Could not add the batch.');
    }
  };

  const updateBatch: Ctx['updateBatch'] = async (id, patch) => {
    const existing = batches.find((b) => b.id === id);
    if (!user || !existing || !canEditBatch(user, existing)) return { ok: false, message: 'You cannot edit this batch.' };
    try {
      await api.updateBatch(id, {
        batchNumber: patch.batchNo, medicineName: patch.medicine, category: patch.category, manufacturer: patch.manufacturer,
        manufactureDate: patch.mfgDate, expiryDate: patch.expiryDate, unitPrice: patch.unitPrice,
      });
      // Quantity is not part of PATCH /batches/:id; the backend changes it only through an audited stock adjustment.
      if (patch.quantity !== undefined && patch.quantity !== existing.quantity) {
        await api.adjustStock(id, { delta: patch.quantity - existing.quantity, reason: 'Quantity corrected from the batch edit form' });
      }
      await afterWrite();
      return { ok: true };
    } catch (e) {
      await afterWrite(); // a partial success (details saved, stock adjustment rejected) must not leave the UI stale
      return fail(e, 'Could not update the batch.');
    }
  };

  /** The backend has no batch-delete endpoint (batches are traceability records), so this is refused instead of faked. */
  const deleteBatch: Ctx['deleteBatch'] = async () => ({ ok: false, message: 'Deleting batches is not supported by the server.' });

  /* ---------- Transfers: Pending -> In Transit -> Delivered, or Cancelled ---------- */
  const createTransfer: Ctx['createTransfer'] = async (input) => {
    if (!user || !canCreateTransfer(user.role)) return { ok: false, message: 'Your role cannot create transfers.' };
    const destination = organizations.find((o) => o.id === input.to && o.type === 'PHARMACY' && o.status === 'Active');
    if (!destination) return { ok: false, message: 'Select a valid, active destination pharmacy.' };
    try {
      const created = await api.createTransfer({
        toOrganizationId: destination.id,
        items: [{ batchId: input.batchId, quantity: input.quantity }],
        expectedDelivery: input.expectedDelivery || undefined,
        notes: input.notes.trim() || undefined,
      });
      await afterWrite();
      return { ok: true, transfer: mapTransfer(created) };
    } catch (e) {
      return fail(e, 'Could not create the transfer.');
    }
  };

  /** Only the sending distributor may dispatch its own Pending transfer. The server deducts the sender's stock here. */
  const dispatchTransfer: Ctx['dispatchTransfer'] = async (id) => {
    const t = transfers.find((x) => x.id === id);
    if (!user || !t || !canDispatch(user, t)) return { ok: false, message: 'You are not authorized to dispatch this transfer.' };
    try {
      await api.dispatchTransfer(transferApiId(id));
      await afterWrite();
      return { ok: true };
    } catch (e) {
      await afterWrite();
      return fail(e, 'Could not dispatch the transfer.');
    }
  };

  /**
   * Only the destination pharmacy may confirm its own In Transit delivery. POST /transfers/:id/receive
   * takes no quantity: the server books the full dispatched quantity into the pharmacy's stock.
   */
  const confirmDelivery: Ctx['confirmDelivery'] = async (id) => {
    const t = transfers.find((x) => x.id === id);
    if (!user || !t || !canConfirmDelivery(user, t)) return { ok: false, message: 'You are not authorized to confirm this delivery.' };
    try {
      await api.receiveTransfer(transferApiId(id));
      await afterWrite();
      return { ok: true };
    } catch (e) {
      await afterWrite();
      return fail(e, 'Could not confirm the delivery.');
    }
  };

  /** Only the sending distributor may cancel its own Pending transfer. No stock has moved yet, so none is returned. */
  const cancelTransfer: Ctx['cancelTransfer'] = async (id) => {
    const t = transfers.find((x) => x.id === id);
    if (!user || !t || !canCancel(user, t)) return { ok: false, message: 'You are not authorized to cancel this transfer.' };
    try {
      await api.cancelTransfer(transferApiId(id));
      await afterWrite();
      return { ok: true };
    } catch (e) {
      await afterWrite();
      return fail(e, 'Could not cancel the transfer.');
    }
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
    setUser({ ...user, ...patch }); // TODO(Group 4): the API has no self-service profile endpoint yet, so this is local to the tab
    setUsers((p) => p.map((x) => (x.id === user.id ? { ...x, ...patch } : x)));
    log('Profile details updated');
  };

  /** The database is never reset from the UI. This only discards this tab's local events and reloads everything from the server. */
  const resetDemo = () => {
    setLocalActivity([]);
    void refresh().then(() => notify('Data reloaded from the server.'));
  };

  // The server already limits every list to what this account may see; these filters are a second, id-based guard (never names).
  const orgId = user?.organizationId ?? '';
  const visibleBatches = !user ? [] : user.role === 'ADMIN' ? batches : batches.filter((b) => b.ownerId === orgId);
  const visibleTransfers = !user ? [] : user.role === 'ADMIN' ? transfers : user.role === 'DISTRIBUTOR' ? transfers.filter((t) => t.fromOrgId === orgId) : transfers.filter((t) => t.toOrgId === orgId);
  const visibleActivity = (!user ? [] : user.role === 'ADMIN' ? activity : activity.filter((a) => a.org === user.organization)).slice().sort((a, b) => b.at.localeCompare(a.at));

  return (
    <AppCtx.Provider value={{ user, authStatus, retrySession: () => void verifySession(), users, organizations, batches, transfers, activity, visibleBatches, visibleTransfers, visibleActivity, summary, overview, dataLoading, dataLoaded, dataError, refresh, toast, notify, login, logout, register, log, addBatch, updateBatch, deleteBatch, createTransfer, dispatchTransfer, confirmDelivery, cancelTransfer, addUser, updateUser, updateOwnProfile, resetDemo }}>
      {children}
    </AppCtx.Provider>
  );
}