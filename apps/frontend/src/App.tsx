import { Dashboard } from './pages/Dashboard';
import { Activity } from 'lucide-react';

function App() {
  return (
    <div className="bg-slate-50 min-h-screen font-sans flex flex-col">
      {/* Top Navigation */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-blue-600" />
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-emerald-600 tracking-tight">
            ClinicWorks
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 w-full">
        <Dashboard />
      </div>
    </div>
  );
}

export default App;
