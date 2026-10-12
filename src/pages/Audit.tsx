import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../store';
import { api, ApiError } from '../services/api';
import type { Pagination } from '../services/api';
import { mapAudit } from '../services/mappers';
import type { Activity } from '../types';
import { Card, Empty, PageHeader, RoleBadge } from '../components/ui';
import { fmtDateTime } from '../lib/utils';

const PAGE_SIZE = 25;
const ENTITIES = ['BATCH', 'TRANSFER', 'USER', 'ORGANIZATION'];

/**
 * Audit log. Read-only, loaded page by page from GET /audit-logs.
 * The server scopes it: ADMIN sees the whole platform, DISTRIBUTOR/PHARMACY only their own organization.
 */
export default function Audit() {
  const { user } = useApp();
  const [rows, setRows] = useState<Activity[]>([]);
  const [pg, setPg] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api.listAuditPage({ page, limit: PAGE_SIZE, entityType, from, to });
      setRows(r.auditLogs.map(mapAudit));
      setPg(r.pagination);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the audit log.');
    } finally {
      setLoading(false);
    }
  }, [page, entityType, from, to]);
  useEffect(() => { void load(); }, [load]);

  if (!user) return null;
  const filter = (fn: () => void) => { fn(); setPage(1); };

  return (
    <>
      <PageHeader title="Audit log" subtitle={user.role === 'ADMIN' ? 'Every recorded action across the platform, newest first.' : `Recorded actions for ${user.organization}, newest first.`} />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <select className="input w-auto" value={entityType} onChange={(e) => filter(() => setEntityType(e.target.value))} aria-label="Record type">
            <option value="">All record types</option>{ENTITIES.map((x) => <option key={x} value={x}>{x[0] + x.slice(1).toLowerCase()}</option>)}
          </select>
          <label className="text-xs text-ink-soft">From<input type="date" className="input mt-1" value={from} onChange={(e) => filter(() => setFrom(e.target.value))} /></label>
          <label className="text-xs text-ink-soft">To<input type="date" className="input mt-1" value={to} onChange={(e) => filter(() => setTo(e.target.value))} /></label>
          {(entityType || from || to) && <button className="btn btn-secondary btn-sm" onClick={() => { setEntityType(''); setFrom(''); setTo(''); setPage(1); }}>Clear filters</button>}
        </div>
        {error ? (
          <div role="alert" className="flex items-center justify-between gap-3 px-5 py-4 text-sm text-danger">
            <span>{error}</span><button className="btn btn-secondary btn-sm" onClick={() => void load()}>Retry</button>
          </div>
        ) : loading ? <p role="status" className="px-5 py-10 text-center text-sm text-ink-soft">Loading audit log...</p>
          : rows.length === 0 ? <Empty title="No audit entries" hint="Nothing matches these filters." /> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>When</th><th>Action</th><th>Reference</th><th>Actor</th><th>Role</th>{user.role === 'ADMIN' && <th>Organization</th>}</tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap text-ink-soft">{fmtDateTime(a.at)}</td>
                      <td>{a.action}</td>
                      <td className="text-ink-soft">{a.ref ?? '-'}</td>
                      <td className="font-medium">{a.actor}</td>
                      <td>{a.actorRole ? <RoleBadge role={a.actorRole} /> : '-'}</td>
                      {user.role === 'ADMIN' && <td>{a.org || 'Platform'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {pg && pg.totalPages > 1 && !error && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-soft">
            <span>Page {pg.page} of {pg.totalPages} ({pg.total} entries)</span>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button>
              <button className="btn btn-secondary btn-sm" disabled={page >= pg.totalPages || loading} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
