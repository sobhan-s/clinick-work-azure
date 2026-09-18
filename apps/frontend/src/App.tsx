import './index.css';
import { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { UploadModal } from './components/UploadModal';

function App() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="app-wrapper">
       <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo-wrap">
            <span className="navbar-logo-icon">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 12 6.5 12 8.5 5 11.5 19 14 9 16.5 14 18.5 12 21 12" />
              </svg>
            </span>
            <span className="navbar-name">ClinicWorks</span>
            <span className="navbar-platform-badge">Platform</span>
          </div>
          <div className="navbar-subtitle">Clinical Document &amp; Measurement Extraction</div>
        </div>

        <div className="navbar-right">
          <button
            id="navbar-refresh-btn"
            className="btn btn-outline"
            onClick={() => setRefreshKey(k => k + 1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>

          <button
            id="navbar-upload-btn"
            className="btn btn-primary"
            onClick={() => setUploadOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload Document
          </button>
        </div>
      </nav>

       <div className="page-body">
        <Dashboard
          refreshKey={refreshKey}
          onUploadClick={() => setUploadOpen(true)}
        />
      </div>

       <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          setRefreshKey(k => k + 1);
          setUploadOpen(false);
        }}
      />
    </div>
  );
}

export default App;
