import { useCallback, useState } from 'react';
import { documentService } from '../services/api';

interface Props {
  isOpen:    boolean;
  onClose:   () => void;
  onSuccess: () => void;
}

export const UploadModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile]       = useState<File | null>(null);
  const [over, setOver]       = useState(false);
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; data?: any; err?: string } | null>(null);

  const reset = () => { setFile(null); setResult(null); setOver(false); };
  const close = () => { reset(); onClose(); };

  const pick = (f: File) => { setFile(f); setResult(null); };

  const drop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) pick(f);
  }, []);

  const upload = async () => {
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      const res = await documentService.uploadDocument(file);
      setResult({ ok: true, data: res });
      onSuccess();
    } catch (e: any) {
      setResult({ ok: false, err: e.response?.data?.message ?? e.message ?? 'Upload failed' });
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const pr = result?.data?.processing_result ?? result?.data?.result;

  return (
    <div className="modal-backdrop" id="upload-backdrop"
      onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal-sheet" id="upload-sheet">

        {/* head */}
        <div className="modal-head">
          <h2>Upload Clinical Document</h2>
          <button className="icon-btn" id="modal-close" onClick={close} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* body */}
        <div className="modal-body">
          <div
            className={`drop-zone ${over ? 'over' : ''}`}
            onDrop={drop}
            onDragOver={e => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onClick={() => document.getElementById('file-hidden')?.click()}
          >
            <div className="dz-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16"/>
                <line x1="12" y1="12" x2="12" y2="21"/>
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
              </svg>
            </div>
            <div className="dz-title">Drop your PDF here</div>
            <div className="dz-sub">Blood pressure reports or HbA1c lab results</div>
            <button className="btn btn-outline" type="button"
              onClick={e => { e.stopPropagation(); document.getElementById('file-hidden')?.click(); }}
              id="browse-btn">
              Browse Files
            </button>
          </div>

          <input id="file-hidden" type="file" accept="application/pdf"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); }} />

          {/* selected file chip */}
          {file && !result && (
            <div className="file-chip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="file-chip-name">{file.name}</div>
                <div className="file-chip-size">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <button className="icon-btn" onClick={e => { e.stopPropagation(); reset(); }} title="Remove">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* result */}
          {result?.ok && (
            <div className="result-box ok">
              <div className="result-box-head">✓ Processing complete</div>
              {pr && (
                <div className="result-grid">
                  <span className="k">Type</span>
                  <span className="v">{pr.document_type ?? pr.result_type ?? '—'}</span>
                  <span className="k">Status</span>
                  <span className="v">{pr.status}</span>
                  <span className="k">Extracted</span>
                  <span className="v">{pr.extracted_measure ?? '—'}</span>
                  <span className="k">Confidence</span>
                  <span className="v">
                    {pr.confidence_score != null
                      ? `${Math.round(pr.confidence_score * 100)}%` : '—'}
                  </span>
                  {pr.error_message && (
                    <>
                      <span className="k">Note</span>
                      <span className="v" style={{ color: 'var(--review)' }}>{pr.error_message}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {result?.ok === false && (
            <div className="result-box err">
              <div className="result-box-head">✗ Upload failed</div>
              <div style={{ fontSize: 12, color: 'var(--failed)', marginTop: 4 }}>{result.err}</div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="modal-foot">
          {result?.ok ? (
            <button className="btn btn-primary" id="modal-done" onClick={close}>Done</button>
          ) : (
            <>
              <button className="btn btn-outline" id="modal-cancel" onClick={close}>Cancel</button>
              <button className="btn btn-primary" id="modal-upload"
                onClick={upload} disabled={!file || busy}>
                {busy && (
                  <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ width: 14, height: 14 }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                )}
                {busy ? 'Processing…' : 'Upload & Process'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
