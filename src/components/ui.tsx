import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import type { Role } from '../types';
import { useApp } from '../store';

export function Logo({ light = false, size = 32 }: { light?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 2 4 7v9c0 7 5 12 12 14 7-2 12-7 12-14V7z" fill={light ? '#fff' : '#1565C0'} />
        <path d="M14 9.5h4v4.5h4.5v4H18v4.5h-4V18H9.5v-4H14z" fill={light ? '#1565C0' : '#fff'} />
        <path d="M6.5 25.5c2.5 2.2 5.8 3.6 9.5 4.5" stroke="#00897B" strokeWidth="2" strokeLinecap="round" fill="none" opacity={light ? 0 : 1} />
      </svg>
      <span className={`text-lg font-bold tracking-[0.12em] ${light ? 'text-white' : 'text-primary'}`}>MEDIVRA</span>
    </span>
  );
}

export const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-line bg-white shadow-card ${className}`}>{children}</div>
);

export const CardHeader = ({ title, action }: { title: string; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
    <h2 className="text-[15px] font-semibold">{title}</h2>
    {action}
  </div>
);

const TONES: Record<string, string> = {
  success: 'bg-success/10 text-success ring-success/20',
  warning: 'bg-warning/15 text-amber-800 ring-warning/30',
  danger: 'bg-danger/10 text-danger ring-danger/20',
  info: 'bg-primary/10 text-primary ring-primary/20',
  teal: 'bg-teal/10 text-teal ring-teal/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const STATUS_TONE: Record<string, string> = {
  'In Stock': 'success', 'Low Stock': 'warning', 'Expiring Soon': 'orange', 'Out of Stock': 'danger',
  Pending: 'warning', Approved: 'info', 'In Transit': 'teal', Delivered: 'success', Cancelled: 'danger',
  Active: 'success', Inactive: 'neutral', Locked: 'danger',
};
export const StatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[STATUS_TONE[status] ?? 'neutral']}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {status}
  </span>
);

const ROLE_STYLE: Record<Role, string> = {
  ADMIN: 'bg-ink text-white',
  DISTRIBUTOR: 'bg-primary text-white',
  PHARMACY: 'bg-teal text-white',
};
export const RoleBadge = ({ role }: { role: Role }) => (
  <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide ${ROLE_STYLE[role]}`}>{role}</span>
);

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: string; actions?: React.ReactNode; back?: string }) {
  const nav = useNavigate();
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        {back && (
          <button onClick={() => nav(back)} className="mb-1 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-primary">
            <ArrowLeft size={14} /> Back
          </button>
        )}
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const Field = ({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <label className="label">{label}</label>
    {children}
    {hint && !error && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    {error && <p className="mt-1 text-xs text-danger">{error}</p>}
  </div>
);

export function Modal({ title, onClose, children, width = 'max-w-lg' }: { title: string; onClose: () => void; children: React.ReactNode; width?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${width} rounded-lg bg-white shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-soft hover:bg-canvas"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export const Empty = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="px-6 py-12 text-center">
    <p className="font-medium">{title}</p>
    {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
  </div>
);

export const InfoNote = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2.5 rounded-md border border-primary/15 bg-primary-50 px-3.5 py-3 text-sm text-ink-soft">
    <ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary" />
    <span>{children}</span>
  </div>
);

export function ToastHost() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2.5 rounded-md bg-ink px-4 py-3 text-sm text-white shadow-lg">
      <CheckCircle2 size={18} className="text-emerald-400" /> {toast}
    </div>
  );
}

export const TextLink = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link to={to} className="font-medium text-primary hover:underline">{children}</Link>
);

export function AccessDenied({ what }: { what: string }) {
  const { user } = useApp();
  return (
    <Card className="mx-auto mt-10 max-w-md px-8 py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger"><ShieldCheck size={24} /></div>
      <h1 className="text-lg font-semibold">Access restricted</h1>
      <p className="mt-2 text-sm text-ink-soft">{what} is not available to the {user?.role.toLowerCase()} role. If you need access, contact your administrator.</p>
      <Link to="/" className="btn btn-primary mt-5">Back to dashboard</Link>
    </Card>
  );
}
