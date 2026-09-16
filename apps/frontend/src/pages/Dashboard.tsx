import { useEffect, useState } from 'react';
import { Upload, RefreshCw, CheckCircle2, XCircle, AlertCircle, Search, Loader2 } from 'lucide-react';
import { documentService } from '../services/api';
import type { ProcessedDocument } from '../types';
import { UploadModal } from '../components/UploadModal';

export const Dashboard: React.FC = () => {
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const data = await documentService.getAllDocuments();
      setDocuments(data);
    } catch (error) {
      console.error("Failed to fetch documents", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      await documentService.retryDocument(id);
      await fetchDocuments();
    } catch (error) {
      console.error("Failed to retry", error);
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'SUCCESS': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'FAILED': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'NEEDS_REVIEW': return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'PROCESSING': return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      default: return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'SUCCESS': return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case 'FAILED': return "bg-red-50 text-red-700 border-red-200";
      case 'NEEDS_REVIEW': return "bg-amber-50 text-amber-700 border-amber-200";
      case 'PROCESSING': return "bg-blue-50 text-blue-700 border-blue-200";
      default: return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="flex-1 p-8 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Processed Documents</h1>
            <p className="text-slate-500 mt-1">Manage and monitor AI extraction results from clinical PDFs.</p>
          </div>
          <button 
            onClick={() => setIsUploadOpen(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Upload Document
          </button>
        </div>

        {/* Filters / Search Bar (Dummy for UI polish) */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search documents by name or type..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-100 text-sm outline-none"
            />
          </div>
          <button onClick={fetchDocuments} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors ml-auto">
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/50 text-slate-500 font-medium border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Document</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Extracted Measure</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading documents...
                    </td>
                  </tr>
                ) : documents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      No documents found. Upload one to get started!
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => (
                    <tr key={doc.document_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">{doc.document_name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">ID: {doc.document_id.split('-')[0]} • {new Date(doc.uploaded_at).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(doc.status)}`}>
                          {getStatusIcon(doc.status)}
                          {doc.status || 'UNKNOWN'}
                        </div>
                        {doc.error_message && (
                          <div className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={doc.error_message}>
                            {doc.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-slate-600 font-medium bg-slate-100 px-2 py-1 rounded-md">{doc.result_type || 'N/A'}</span>
                      </td>
                      <td className="px-6 py-4">
                        {doc.extracted_measure ? (
                          <div>
                            <span className="font-bold text-slate-800">{doc.extracted_measure}</span>
                            {doc.measure_date && <span className="text-xs text-slate-400 ml-2">on {new Date(doc.measure_date).toLocaleDateString()}</span>}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {(doc.status === 'FAILED' || doc.status === 'NEEDS_REVIEW') && (
                          <button 
                            onClick={() => handleRetry(doc.document_id)}
                            disabled={retryingId === doc.document_id}
                            className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 bg-white border border-blue-200 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <RefreshCw className={`w-3 h-3 ${retryingId === doc.document_id ? 'animate-spin' : ''}`} />
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <UploadModal 
        isOpen={isUploadOpen} 
        onClose={() => setIsUploadOpen(false)} 
        onSuccess={fetchDocuments}
      />
    </div>
  );
};
