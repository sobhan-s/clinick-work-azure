import React from 'react';
import { LayoutDashboard, FileText, Settings, Activity } from 'lucide-react';

export const Sidebar: React.FC = () => {
  return (
    <div className="w-64 h-screen bg-slate-900 text-white flex flex-col fixed left-0 top-0">
      <div className="p-6 flex items-center gap-3">
        <Activity className="w-8 h-8 text-blue-400" />
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
          ClinicWorks
        </h1>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-2">
        <a href="#" className="flex items-center gap-3 px-4 py-3 bg-blue-600/20 text-blue-400 rounded-xl transition-colors">
          <LayoutDashboard className="w-5 h-5" />
          <span className="font-medium">Dashboard</span>
        </a>
        <a href="#" className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-white rounded-xl transition-colors">
          <FileText className="w-5 h-5" />
          <span className="font-medium">Documents</span>
        </a>
      </nav>

      <div className="p-4">
        <div className="p-4 bg-slate-800 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-emerald-500 flex items-center justify-center font-bold">
            U
          </div>
          <div>
            <p className="text-sm font-medium">Test User</p>
            <p className="text-xs text-slate-400">Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
};
