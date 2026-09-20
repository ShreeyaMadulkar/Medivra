import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, Batch, Role, Transfer, TransferStatus, User } from './types';
import { seedActivity, seedBatches, seedTransfers, seedUsers } from './data/mock';
import { nextId, nowIso, todayIso, uid } from './lib/utils';
import { canCreateTransfer, canManageBatches, canManageUsers, transferActions } from './lib/rbac';
import { SECURITY_CONFIG, verifyCredentials } from './services/security';

/**
 * Prototype data layer.
 * --------------------------------------------------------------------------------------
 * Everything lives in React state + localStorage. When the backend is added, replace the
 * bodies of the functions below with API calls. The server must then:
 *   - use PREPARED STATEMENTS (parameterised queries) for every database operation
 *   - re-check RBAC on every request
 *   - write an AUDIT LOG row for every important action (see `log`)
 *   - hash passwords with SHA-512 and encrypt sensitive columns with AES-256
 */

const K = 'medivra.v1.';
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

interface Lock { count: number; until: number }
export type LoginResult = { ok: true } | { ok: false; kind: 'invalid' | 'locked' | 'inactive'; message: string };
export type NewBatch = Omit<Batch, 'id' | 'updatedBy' | 'updatedAt' | 'owner'> & { owner?: string };
export interface NewTransfer { batchId: string; to: string; quantity: number; expectedDelivery: string; notes: string }
export interface Registration { name: string; email: string; phone: string; organization: string; role: Role }

interface Ctx {
  user: User | null;
  users: User[];
  batches: Batch[];
  transfers: Transfer[];
  activity: Activity[];
  visibleBatches: Batch[];
  visibleTransfers: Transfer[];
  visibleActivity: Activity[];
  toast: string | null;
  notify: (m: string) => void;
  login: (email: string, password: string, role: Role) => LoginResult;
  lockRemaining: (email: string) => number;
  logout: () => void;
  register: (r: Registration) => { ok: boolean; message: string };
  log: (action: string, ref?: string) => void;
  addBatch: (b: NewBatch) => Batch | null;
  updateBatch: (id: string, patch: Partial<Batch>) => void;
  deleteBatch: (id: string) => void;
  createTransfer: (t: NewTransfer) => { ok: true; transfer: Transfer } | { ok: false; message: string };
  advanceTransfer: (id: string, next: TransferStatus) => void;
  addUser: (u: Omit<User, 'id' | 'lastLogin'>) => void;
  updateUser: (u: User) => void;
  updateOwnProfile: (patch: Partial<User>) => void;
  resetDemo: () => void;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = usePersisted<User[]>('users', seedUsers);
  const [batches, setBatches] = usePersisted<Batch[]>('batches', seedBatches);
  const [transfers, setTransfers] = usePersisted<Transfer[]>('transfers', seedTransfers);
  const [activity, setActivity] = usePersisted<Activity[]>('activity', seedActivity);
  const [session, setSession] = usePersisted<string | null>('session', null);
  const [lockouts, setLockouts] = usePersisted<Record<string, Lock>>('lockouts', {});
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  const user = useMemo(() => users.find((u) => u.id === session) ?? null, [users, session]);

  const notify = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  /* ---------- Audit logging ---------- */
  const addActivity = (action: string, actor: string, org: string, ref?: string) =>
    setActivity((p) => [{ id: 'A-' + uid(), at: nowIso(), actor, org, action, ref }, ...p].slice(0, 250));
  const log = (action: string, ref?: string) => addActivity(action, user?.name ?? 'Unknown', user?.organization ?? '', ref);

  /* ---------- Account lockout (simulated) ---------- */
  useEffect(() => {
    if (!Object.values(lockouts).some((l) => l.until)) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const expired = Object.entries(lockouts).filter(([, l]) => l.until && l.until <= now).map(([k]) => k);
      if (!expired.length) return;
      setLockouts((p) => {
        const n = { ...p };
        expired.forEach((k) => delete n[k]);
        return n;
      });
      setUsers((p) => p.map((u) => (expired.includes(u.email.toLowerCase()) && u.status === 'Locked' ? { ...u, status: 'Active' } : u)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockouts, setLockouts, setUsers]);

  const lockRemaining = (email: string) => {
    const l = lockouts[email.trim().toLowerCase()];
    return l && l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 1000) : 0;
  };

  const LOCKED_MSG = 'Too many failed attempts. Your account has been temporarily locked.';

  const login: Ctx['login'] = (email, password, role) => {
    const key = email.trim().toLowerCase();
    const now = Date.now();
    const lock = lockouts[key];
    if (lock && lock.until > now) return { ok: false, kind: 'locked', message: LOCKED_MSG };

    const u = users.find((x) => x.email.toLowerCase() === key);
    // BACKEND: replace with POST /api/auth/login (server compares SHA-512 hash, applies its own lockout counter).
    const valid = !!u && u.role === role && verifyCredentials(password);

    if (!valid) {
      const count = (lock && !lock.until ? lock.count : 0) + 1;
      if (count >= SECURITY_CONFIG.maxFailedAttempts) {
        setLockouts((p) => ({ ...p, [key]: { count, until: now + SECURITY_CONFIG.lockoutSeconds * 1000 } }));
        if (u) setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, status: 'Locked' } : x)));
        addActivity('Failed login attempt', u?.name ?? key, '');
        addActivity('Account locked after repeated failed logins', u?.name ?? key, '');
        return { ok: false, kind: 'locked', message: LOCKED_MSG };
      }
      setLockouts((p) => ({ ...p, [key]: { count, until: 0 } }));
      addActivity('Failed login attempt', u?.name ?? key, '');
      return { ok: false, kind: 'invalid', message: `Invalid credentials. ${SECURITY_CONFIG.maxFailedAttempts - count} attempt(s) remaining before the account is locked.` };
    }
    if (u!.status === 'Locked') return { ok: false, kind: 'locked', message: 'This account is locked. Please contact an administrator.' };
    if (u!.status === 'Inactive') return { ok: false, kind: 'inactive', message: 'This account is not active yet. Please contact an administrator.' };

    setLockouts((p) => {
      const n = { ...p };
      delete n[key];
      return n;
    });
    setUsers((p) => p.map((x) => (x.id === u!.id ? { ...x, lastLogin: nowIso() } : x)));
    setSession(u!.id);
    addActivity('User logged in', u!.name, u!.organization);
    return { ok: true };
  };

  const logout = () => {
    if (user) log('User logged out');
    setSession(null);
  };

  const register: Ctx['register'] = (r) => {
    if (users.some((u) => u.email.toLowerCase() === r.email.trim().toLowerCase())) return { ok: false, message: 'An account with this email already exists.' };
    if (r.role === 'ADMIN') return { ok: false, message: 'Administrator accounts cannot be self-registered.' };
    // BACKEND: POST /api/auth/register - server hashes the password (SHA-512) before INSERT via a prepared statement.
    const id = nextId(users.map((u) => u.id), 'U-', 0).replace(/(\d+)$/, (m) => m.padStart(3, '0'));
    setUsers((p) => [...p, { ...r, email: r.email.trim(), id, status: 'Inactive', lastLogin: null }]);
    addActivity('New user registered (awaiting activation)', r.name, '');
    return { ok: true, message: 'Registration submitted. An administrator must activate your account before you can sign in.' };
  };

  /* ---------- Batches ---------- */
  const addBatch: Ctx['addBatch'] = (input) => {
    if (!user || !canManageBatches(user.role)) return null;
    const id = nextId(batches.map((b) => b.id), 'B-', 2052);
    const owner = user.role === 'ADMIN' ? input.owner || 'Medivra Distributors' : user.organization;
    // BACKEND: INSERT INTO batches (...) VALUES (?, ?, ...)  -- prepared statement; encrypt sensitive columns (AES-256).
    const batch: Batch = { ...input, owner, id, updatedBy: user.name, updatedAt: nowIso() };
    setBatches((p) => [batch, ...p]);
    log(`Batch ${id} added`, id);
    return batch;
  };

  const updateBatch: Ctx['updateBatch'] = (id, patch) => {
    if (!user || !canManageBatches(user.role)) return;
    // BACKEND: UPDATE batches SET ... WHERE id = ?  -- prepared statement
    setBatches((p) => p.map((b) => (b.id === id ? { ...b, ...patch, updatedBy: user.name, updatedAt: nowIso() } : b)));
    log(`Batch ${id} updated`, id);
  };

  const deleteBatch: Ctx['deleteBatch'] = (id) => {
    if (!user || !canManageBatches(user.role)) return;
    // BACKEND: DELETE FROM batches WHERE id = ?  -- prepared statement (consider soft delete for traceability)
    setBatches((p) => p.filter((b) => b.id !== id));
    log(`Batch ${id} deleted`, id);
  };

  /* ---------- Transfers ---------- */
  const createTransfer: Ctx['createTransfer'] = (input) => {
    if (!user || !canCreateTransfer(user.role)) return { ok: false, message: 'Your role cannot create transfers.' };
    const batch = batches.find((b) => b.id === input.batchId);
    if (!batch) return { ok: false, message: 'Select a pharmaceutical batch.' };
    if (input.quantity <= 0 || input.quantity > batch.quantity) return { ok: false, message: `Quantity must be between 1 and ${batch.quantity}.` };
    const id = nextId(transfers.map((t) => t.id), 'TR-', 1024);
    const now = nowIso();
    const transfer: Transfer = {
      id, batchId: batch.id, medicine: batch.medicine, from: batch.owner, to: input.to, quantity: input.quantity,
      date: todayIso(), expectedDelivery: input.expectedDelivery, status: 'Pending', notes: input.notes, createdBy: user.name,
      timeline: [{ at: now, label: 'Transfer created', by: user.name }],
    };
    // BACKEND: one DB transaction (prepared statements): INSERT transfer + UPDATE batch quantity + INSERT audit row.
    setTransfers((p) => [transfer, ...p]);
    setBatches((p) => p.map((b) => (b.id === batch.id ? { ...b, quantity: b.quantity - input.quantity, updatedBy: user.name, updatedAt: now } : b)));
    log(`Transfer ${id} created`, id);
    return { ok: true, transfer };
  };

  const advanceTransfer: Ctx['advanceTransfer'] = (id, next) => {
    const t = transfers.find((x) => x.id === id);
    if (!user || !t || !transferActions(user.role, t.status).some((a) => a.next === next)) return;
    const now = nowIso();
    const label = { Approved: 'Transfer approved', 'In Transit': 'Shipment dispatched', Delivered: 'Delivery confirmed', Cancelled: 'Transfer cancelled', Pending: 'Transfer created' }[next];
    const audit = { Approved: `Transfer ${id} approved`, 'In Transit': `Transfer ${id} dispatched`, Delivered: `Pharmacy accepted transfer ${id}`, Cancelled: `Transfer ${id} cancelled`, Pending: '' }[next];

    setTransfers((p) => p.map((x) => (x.id === id ? { ...x, status: next, timeline: [...x.timeline, { at: now, label, by: user.name }] } : x)));

    if (next === 'Cancelled') {
      setBatches((p) => p.map((b) => (b.id === t.batchId ? { ...b, quantity: b.quantity + t.quantity, updatedAt: now, updatedBy: user.name } : b)));
    }
    if (next === 'Delivered') {
      const src = batches.find((b) => b.id === t.batchId);
      setBatches((p) => {
        const existing = src && p.find((b) => b.owner === t.to && b.batchNo === src.batchNo);
        if (existing) return p.map((b) => (b.id === existing.id ? { ...b, quantity: b.quantity + t.quantity, updatedAt: now, updatedBy: user.name } : b));
        if (!src) return p;
        return [{ ...src, id: nextId(p.map((b) => b.id), 'B-', 2052), owner: t.to, quantity: t.quantity, updatedAt: now, updatedBy: user.name }, ...p];
      });
    }
    log(audit, id);
  };

  /* ---------- Users (admin) ---------- */
  const addUser: Ctx['addUser'] = (u) => {
    if (!canManageUsers(user?.role)) return;
    const id = nextId(users.map((x) => x.id), 'U-', 0).replace(/(\d+)$/, (m) => m.padStart(3, '0'));
    setUsers((p) => [...p, { ...u, id, lastLogin: null }]);
    log(`User account created: ${u.name}`);
  };
  const updateUser: Ctx['updateUser'] = (u) => {
    if (!canManageUsers(user?.role)) return;
    setUsers((p) => p.map((x) => (x.id === u.id ? u : x)));
    if (u.status === 'Active') setLockouts((p) => { const n = { ...p }; delete n[u.email.toLowerCase()]; return n; });
    log(`User account updated: ${u.name}`);
  };
  const updateOwnProfile: Ctx['updateOwnProfile'] = (patch) => {
    if (!user) return;
    setUsers((p) => p.map((x) => (x.id === user.id ? { ...x, ...patch } : x)));
    log('Profile details updated');
  };

  const resetDemo = () => {
    setUsers(seedUsers); setBatches(seedBatches); setTransfers(seedTransfers); setActivity(seedActivity); setLockouts({});
    if (!seedUsers.some((u) => u.id === session)) setSession(null);
    notify('Demo data has been reset.');
  };

  const scoped = <T,>(all: T[], pick: (t: T) => string) => (!user ? [] : user.role === 'ADMIN' ? all : all.filter((x) => pick(x) === user.organization));
  const visibleBatches = scoped(batches, (b) => b.owner);
  const visibleTransfers = !user ? [] : user.role === 'ADMIN' ? transfers : user.role === 'DISTRIBUTOR' ? transfers.filter((t) => t.from === user.organization) : transfers.filter((t) => t.to === user.organization);
  const visibleActivity = scoped(activity, (a) => a.org).slice().sort((a, b) => b.at.localeCompare(a.at));

  return (
    <AppCtx.Provider value={{ user, users, batches, transfers, activity, visibleBatches, visibleTransfers, visibleActivity, toast, notify, login, lockRemaining, logout, register, log, addBatch, updateBatch, deleteBatch, createTransfer, advanceTransfer, addUser, updateUser, updateOwnProfile, resetDemo }}>
      {children}
    </AppCtx.Provider>
  );
}
