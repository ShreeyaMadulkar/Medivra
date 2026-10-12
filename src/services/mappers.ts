import type { Activity, Batch, Organization, TimelineEvent, Transfer, TransferStatus, User } from '../types';
import type { ApiAuditLog, ApiBatch, ApiOrganization, ApiTransfer } from './api';

/** Backend -> frontend type mapping. The backend schemas live in server/src/services/*.js. */

/**
 * /api/batches returns the caller's OWN remaining stock in `quantity` (admin: platform total).
 * For DISTRIBUTOR/PHARMACY the holder is therefore the signed-in organization; for ADMIN it is the originating organization.
 */
export function mapBatch(b: ApiBatch, user: User): Batch {
  const mine = user.role !== 'ADMIN';
  return {
    id: b.id,
    batchNo: b.batchNumber,
    medicine: b.medicineName,
    category: b.category,
    manufacturer: b.manufacturer,
    originalQuantity: b.originalQuantity,
    quantity: b.quantity,
    unitPrice: b.unitPrice,
    mfgDate: b.manufactureDate,
    expiryDate: b.expiryDate,
    owner: mine ? user.organization : b.originOrganization,
    ownerId: mine ? user.organizationId : b.originOrganizationId,
    updatedBy: '-', // the API does not return who last changed a batch; see the audit log
    updatedAt: b.updatedAt,
    status: b.status,
  };
}

/** Transfers are shown by their reference (TRF-000001); the numeric id the API needs is recovered with transferApiId(). */
export const transferApiId = (ref: string) => String(parseInt(ref.replace(/\D/g, ''), 10) || 0);
export const transferRef = (id: string | number) => `TRF-${String(id).padStart(6, '0')}`;

const TIMELINE: Record<string, { label: string; role: 'DISTRIBUTOR' | 'PHARMACY' }> = {
  CREATED: { label: 'Transfer created', role: 'DISTRIBUTOR' },
  DISPATCHED: { label: 'Shipment dispatched', role: 'DISTRIBUTOR' },
  DELIVERED: { label: 'Delivery confirmed', role: 'PHARMACY' },
  CANCELLED: { label: 'Transfer cancelled', role: 'DISTRIBUTOR' },
};

export function mapTransfer(t: ApiTransfer): Transfer {
  const first = t.items[0];
  const medicine = !first ? '' : t.items.length > 1 ? `${first.medicineName} (+${t.items.length - 1} more)` : first.medicineName;
  const received = t.items.every((i) => i.receivedQuantity != null) && t.items.length ? t.items.reduce((s, i) => s + (i.receivedQuantity ?? 0), 0) : undefined;
  const timeline: TimelineEvent[] = t.timeline.map((e) => ({
    at: e.at,
    label: e.event === 'CANCELLED' && t.cancelReason ? `${TIMELINE.CANCELLED.label}: ${t.cancelReason}` : TIMELINE[e.event]?.label ?? e.event,
    by: e.by ?? 'Unknown',
    byRole: TIMELINE[e.event]?.role,
  }));
  return {
    id: t.reference,
    batchId: first?.batchId ?? '',
    medicine,
    from: t.fromOrganization,
    fromOrgId: t.fromOrganizationId,
    to: t.toOrganization,
    toOrgId: t.toOrganizationId,
    quantity: t.totalQuantity,
    items: t.items.map((i) => ({ batchId: i.batchId, batchNo: i.batchNumber, medicine: i.medicineName, manufacturer: i.manufacturer, expiryDate: i.expiryDate, quantity: i.quantity, receivedQuantity: i.receivedQuantity ?? undefined })),
    receivedQuantity: received,
    date: t.createdAt.slice(0, 10),
    expectedDelivery: t.expectedDelivery ?? '',
    dispatchedAt: t.dispatchedAt ?? undefined,
    deliveredAt: t.deliveredAt ?? undefined,
    status: t.statusLabel as TransferStatus,
    notes: t.notes,
    createdBy: t.timeline[0]?.by ?? '',
    timeline,
  };
}

export const mapOrganization = (o: ApiOrganization | { id: string; name: string; type: 'PHARMACY' }): Organization => ({
  id: o.id,
  name: o.name,
  type: o.type,
  status: 'status' in o ? o.status : 'Active', // the pharmacy directory only lists ACTIVE pharmacies
});

const detailsOf = (d: unknown): Record<string, any> => {
  if (!d) return {};
  if (typeof d === 'string') { try { return JSON.parse(d); } catch { return {}; } }
  return typeof d === 'object' ? (d as Record<string, any>) : {};
};

export function mapAudit(a: ApiAuditLog): Activity {
  const d = detailsOf(a.details);
  const tRef = a.entityType === 'TRANSFER' && a.entityId ? transferRef(a.entityId) : d.transferId ? transferRef(d.transferId) : undefined;
  const ref = tRef ?? (a.entityType === 'BATCH' ? a.entityId ?? undefined : undefined);
  const batch = a.entityId ?? '';
  const label: Record<string, string> = {
    BATCH_CREATED: `Batch ${batch} added`,
    BATCH_UPDATED: `Batch ${batch} updated`,
    STOCK_ADDED: `Stock added to batch ${batch}`,
    STOCK_ADJUSTED: `Stock adjusted for batch ${batch}`,
    STOCK_DEDUCTED: `Stock deducted from batch ${batch}${tRef ? ` for transfer ${tRef}` : ''}`,
    STOCK_RECEIVED: `Stock received into batch ${batch}${tRef ? ` from transfer ${tRef}` : ''}`,
    TRANSFER_CREATED: `Transfer ${tRef} created`,
    TRANSFER_DISPATCHED: `Transfer ${tRef} dispatched`,
    TRANSFER_RECEIVED: `Delivery confirmed for transfer ${tRef}`,
    TRANSFER_CANCELLED: `Transfer ${tRef} cancelled`,
    ORGANIZATION_CREATED: 'Organization created',
    ORGANIZATION_UPDATED: 'Organization updated',
    ORGANIZATION_STATUS_CHANGED: 'Organization status changed',
    USER_CREATED: 'User account created',
    USER_UPDATED: 'User account updated',
    USER_STATUS_CHANGED: 'User account status changed',
  };
  const action = label[a.action] ?? a.action.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return {
    id: `S-${a.id}`,
    at: a.at,
    actor: a.actor ?? 'System',
    actorId: a.actorId ?? undefined,
    actorRole: a.actorRole ?? undefined,
    org: a.organization ?? '',
    action,
    ref,
    outcome: 'success',
  };
}