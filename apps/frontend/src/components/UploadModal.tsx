import React, { useCallback, useState } from 'react';
import { UploadCloud, X, File, Loader2 } from 'lucide-react';
import { documentService } from '../services/api';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      await documentService.uploadDocument(file);
      onSuccess();
      setFile(null);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800">Upload Clinical Document</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <div 
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 hover:border-blue-400 transition-all cursor-pointer group"
          >
            <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-8 h-8" />
            </div>
            <p className="text-slate-600 font-medium text-center">
              Drag and drop your PDF here<br/>
              <span className="text-sm text-slate-400 font-normal">or click to browse files</span>
            </p>
            <input 
              type="file" 
              className="hidden" 
              id="fileInput" 
              accept="application/pdf,image/*" 
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <button 
              onClick={() => document.getElementById('fileInput')?.click()}
              className="mt-4 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Select File
            </button>
          </div>

          {file && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
              <File className="w-5 h-5 text-emerald-500" />
              <div className="flex-1 truncate">
                <p className="text-sm font-medium text-emerald-800 truncate">{file.name}</p>
                <p className="text-xs text-emerald-600">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button onClick={() => setFile(null)} className="text-emerald-500 hover:text-emerald-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
              {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-lg shadow-blue-600/30 flex items-center gap-2"
          >
            {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isUploading ? 'Processing...' : 'Upload & Process'}
          </button>
        </div>
      </div>
    </div>
  );
};
