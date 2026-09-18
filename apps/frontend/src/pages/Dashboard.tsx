import { useEffect, useState, useCallback } from 'react';
import { documentService } from '../services/api';
import type { ProcessedDocument } from '../types';

// ─── SVG icon components ──────────────────────────────────────────────────

const DocIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const TrendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const FolderIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);
const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const RetryIcon = ({ spin }: { spin?: boolean }) => (
  <svg className={spin ? 'spin' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>
);
const ErrIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────

const MoreIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="18" r="1.5"/>
  </svg>
);

type FilterTab = 'ALL' | 'PROCESSING' | 'SUCCESS' | 'NEEDS_REVIEW' | 'FAILED';

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusCls(s: string | null) {
  switch (s) {
    case 'SUCCESS':      return 's-success';
    case 'FAILED':       return 's-failed';
    case 'NEEDS_REVIEW': return 's-review';
    default:             return 's-processing';
  }
}
function statusLabel(s: string | null) {
  switch (s) {
    case 'SUCCESS':      return 'Success';
    case 'FAILED':       return 'Failed';
    case 'NEEDS_REVIEW': return 'Needs Review';
    case 'PROCESSING':   return 'Processing';
    default:             return 'Processing';
  }
}
function typeCls(t: string | null) {
  if (t === 'BP')    return 'bp';
  if (t === 'HbA1c') return 'a1c';
  return 'none';
}
function typeLabel(t: string | null) {
  if (t === 'BP')    return '🩺 BP';
  if (t === 'HbA1c') return '🧪 HbA1c';
  return '—';
}
function confCls(v: number | null) {
  if (v === null) return 'low';
  if (v >= 0.8)  return 'high';
  if (v >= 0.6)  return 'medium';
  return 'low';
}

// ─── Component ────────────────────────────────────────────────────────────

interface DashboardProps {
  refreshKey: number;
  onUploadClick: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ refreshKey, onUploadClick }) => {
  const [docs, setDocs]       = useState<ProcessedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [tab, setTab]         = useState<FilterTab>('ALL');
  const [retryId, setRetryId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);     // spinning
  const [confirmId, setConfirmId] = useState<string | null>(null);   // confirm prompt
  const [menuId, setMenuId]     = useState<string | null>(null);     // open dropdown

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuId]);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchErr(null);
    try {
      const data = await documentService.getAllDocuments();
      setDocs(data);
    } catch (e: any) {
      setFetchErr(e.message ?? 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Auto-refresh when processing
  useEffect(() => {
    if (!docs.some(d => d.status === 'PROCESSING')) return;
    const t = setInterval(load, 7000);
    return () => clearInterval(t);
  }, [docs, load]);

  // ── Stats ─────────────────────────────────────────────────────────────
  const total     = docs.length;
  const success   = docs.filter(d => d.status === 'SUCCESS').length;
  const review    = docs.filter(d => d.status === 'NEEDS_REVIEW').length;
  const failed    = docs.filter(d => d.status === 'FAILED').length;
  const processing = docs.filter(d => d.status === 'PROCESSING').length;

  const validConf = docs
    .filter(d => d.confidence_score !== null && d.status === 'SUCCESS')
    .map(d => parseFloat(d.confidence_score as any));
  const avgConf = validConf.length
    ? Math.round((validConf.reduce((a, b) => a + b, 0) / validConf.length) * 100)
    : null;

  // ── Filter + Search ───────────────────────────────────────────────────
  const tabCounts: Record<FilterTab, number> = {
    ALL:         total,
    PROCESSING:  processing,
    SUCCESS:     success,
    NEEDS_REVIEW: review,
    FAILED:      failed,
  };

  const filtered = docs.filter(d => {
    const matchTab =
      tab === 'ALL' ||
      (tab === 'SUCCESS'      && d.status === 'SUCCESS') ||
      (tab === 'FAILED'       && d.status === 'FAILED') ||
      (tab === 'NEEDS_REVIEW' && d.status === 'NEEDS_REVIEW') ||
      (tab === 'PROCESSING'   && d.status === 'PROCESSING');

    if (!matchTab) return false;

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.document_name.toLowerCase().includes(q) ||
      (d.result_type ?? '').toLowerCase().includes(q) ||
      (d.status ?? '').toLowerCase().includes(q) ||
      (d.extracted_measure ?? '').toLowerCase().includes(q)
    );
  });

  // ── Retry ─────────────────────────────────────────────────────────────
  const handleRetry = async (id: string) => {
    setRetryId(id);
    try {
      await documentService.retryDocument(id);
      await load();
    } catch (e) {
      console.error('Retry failed', e);
    } finally {
      setRetryId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteId(id);
    setConfirmId(null);
    try {
      await documentService.deleteDocument(id);
      await load();
    } catch (e) {
      console.error('Delete failed', e);
    } finally {
      setDeleteId(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Stats Row ────────────────────────────────── */}
      <div className="stats-row">
        {/* Total */}
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">Total Documents</div>
            <div className="stat-icon-wrap blue"><DocIcon /></div>
          </div>
          <div className="stat-number">{total}</div>
          <div className="stat-sub">All processed or reviewed</div>
        </div>

        {/* Successful */}
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">Successful</div>
            <div className="stat-icon-wrap green"><CheckIcon /></div>
          </div>
          <div className="stat-number">{success}</div>
          <div className="stat-sub">{total > 0 ? `${Math.round((success/total)*100)}% success rate` : 'No data yet'}</div>
        </div>

        {/* Needs Review */}
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">Needs Review</div>
            <div className="stat-icon-wrap amber"><AlertIcon /></div>
          </div>
          <div className="stat-number">{review}</div>
          <div className="stat-sub">{failed > 0 ? `${failed} extraction error${failed>1?'s':''}` : 'No extraction errors'}</div>
        </div>

        {/* Avg Confidence */}
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-label">Avg Confidence</div>
            <div className="stat-icon-wrap purple"><TrendIcon /></div>
          </div>
          <div className="stat-number">
            {avgConf !== null ? `${avgConf}%` : <span style={{ fontSize: 24, fontWeight: 400, color: 'var(--text-4)' }}>—</span>}
          </div>
          <div className="stat-sub">Model certainty</div>
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────────── */}
      {fetchErr && (
        <div className="error-banner">
          <ErrIcon />
          <span>Failed to load documents: {fetchErr}</span>
        </div>
      )}

      {/* ── Documents Panel ──────────────────────────── */}
      <div className="docs-panel">

        {/* toolbar */}
        <div className="panel-toolbar">
          <div className="search-field">
            <SearchIcon />
            <input
              id="doc-search"
              type="text"
              placeholder="Search by ID, filename, measure, type or p…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-tabs">
            {(['ALL', 'PROCESSING', 'SUCCESS', 'NEEDS_REVIEW', 'FAILED'] as FilterTab[]).map(t => {
              const countCls =
                t === 'SUCCESS'      ? 'success-count' :
                t === 'NEEDS_REVIEW' ? 'review-count' :
                t === 'FAILED'       ? 'failed-count' :
                t === 'PROCESSING'   ? 'processing-count' : '';
              return (
                <button
                  key={t}
                  id={`filter-${t.toLowerCase()}`}
                  className={`filter-tab ${tab === t ? 'active' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t === 'ALL' ? 'All' :
                   t === 'NEEDS_REVIEW' ? 'Needs Review' :
                   t.charAt(0) + t.slice(1).toLowerCase()}
                  <span className={`tab-count ${tab === t ? '' : countCls}`}>
                    {tabCounts[t]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="toolbar-spacer" />
          <span className="records-count">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* table */}
        <div className="table-wrap">
          <table className="data-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Type</th>
              <th>Status</th>
              <th>Extracted Value</th>
              <th>Measure Date</th>
              <th>Confidence</th>
              <th>Attempts</th>
              <th>Uploaded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j}>
                      <div className="skel" style={{ width: j === 0 ? '130px' : j === 5 ? '90px' : '60px' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-wrap">
                    <div className="empty-icon-wrap"><FolderIcon /></div>
                    <div className="empty-title">
                      {search || tab !== 'ALL'
                        ? 'No documents match your filter'
                        : 'No documents uploaded yet'}
                    </div>
                    <div className="empty-sub">
                      {(!search && tab === 'ALL')
                        ? 'Upload a clinical PDF to automatically extract BP or HbA1c values.'
                        : 'Try adjusting your search or filter.'}
                    </div>
                    {!search && tab === 'ALL' && (
                      <button className="btn btn-primary" id="empty-upload-btn" onClick={onUploadClick}>
                        <UploadIcon />
                        Upload Document
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(doc => {
                const sCls   = statusCls(doc.status);
                const tCls   = typeCls(doc.result_type);
                const confFloat = doc.confidence_score !== null ? parseFloat(doc.confidence_score as any) : null;
                const cCls   = confCls(confFloat);
                const confPct = confFloat !== null
                  ? Math.round(confFloat * 100)
                  : null;
                const canRetry = doc.status === 'FAILED' || doc.status === 'NEEDS_REVIEW';

                return (
                  <tr key={doc.document_id} id={`row-${doc.document_id}`}>
                    {/* Doc */}
                    <td>
                      <div className="doc-name" title={doc.document_name}>{doc.document_name}</div>
                      <div className="doc-id">{doc.document_id.slice(0, 8)}</div>
                    </td>

                    {/* Type */}
                    <td>
                      <span className={`type-tag ${tCls}`}>{typeLabel(doc.result_type)}</span>
                    </td>

                    {/* Status — clean error message, no raw JSON */}
                    <td>
                      <span className={`status-pill ${sCls}`}>
                        <span className="status-dot" />
                        {statusLabel(doc.status)}
                      </span>
                      {doc.error_message && (
                        <div className="err-row" title={doc.error_message}>
                          {doc.error_message.length > 55
                            ? doc.error_message.slice(0, 52) + '…'
                            : doc.error_message}
                          <div className="err-tooltip">
                            <strong>{doc.error_code ?? 'Error'}:</strong><br />
                            {doc.error_message}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Extracted Value */}
                    <td>
                      {doc.extracted_measure
                        ? <div className="measure-val">{doc.extracted_measure}</div>
                        : <span style={{ color: 'var(--text-4)' }}>—</span>}
                    </td>

                    {/* Measure Date */}
                    <td>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                        {fmtDate(doc.measure_date)}
                      </span>
                    </td>

                    {/* Confidence */}
                    <td>
                      {confPct !== null ? (
                        <div className="conf-wrap">
                          <div className="conf-track">
                            <div className={`conf-fill ${cCls}`} style={{ width: `${confPct}%` }} />
                          </div>
                          <span className="conf-pct">{confPct}%</span>
                        </div>
                      ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                    </td>

                    {/* Attempts */}
                    <td>
                      <span className="att-badge">{doc.processing_attempt ?? 1}</span>
                    </td>

                    {/* Uploaded */}
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {fmtDate(doc.uploaded_at)}
                      </span>
                    </td>

                    {/* Actions — 3 Dots Menu */}
                    <td>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        {confirmId === doc.document_id ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, color: 'var(--failed)', fontWeight: 500 }}>Sure?</span>
                            <button
                              className="btn-retry"
                              style={{ background: '#fef2f2', color: 'var(--failed)', borderColor: '#fecaca', padding: '4px 8px' }}
                              onClick={() => handleDelete(doc.document_id)}
                              disabled={deleteId === doc.document_id}
                            >
                              {deleteId === doc.document_id ? '…' : 'Yes'}
                            </button>
                            <button className="icon-btn" onClick={() => setConfirmId(null)} title="Cancel">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round" style={{width: 14, height: 14}}>
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              className={`icon-btn ${menuId === doc.document_id ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuId(menuId === doc.document_id ? null : doc.document_id);
                              }}
                            >
                              <MoreIcon />
                            </button>

                            {/* Dropdown Menu */}
                            {menuId === doc.document_id && (
                              <div className="action-menu" onClick={(e) => e.stopPropagation()}>
                                {canRetry && (
                                  <button
                                    className="action-menu-item"
                                    onClick={() => { setMenuId(null); handleRetry(doc.document_id); }}
                                    disabled={retryId === doc.document_id}
                                  >
                                    <span style={{ width: 14, height: 14, display: 'inline-flex' }}>
                                      <RetryIcon spin={retryId === doc.document_id} />
                                    </span>
                                    {retryId === doc.document_id ? 'Retrying…' : 'Retry'}
                                  </button>
                                )}
                                <button
                                  className="action-menu-item delete"
                                  onClick={() => { setMenuId(null); setConfirmId(doc.document_id); }}
                                >
                                  <span style={{ width: 14, height: 14, display: 'inline-flex' }}><TrashIcon /></span>
                                  Delete
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
};
