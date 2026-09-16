import React from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';

function App() {
  return (
    <div className="flex bg-slate-50 min-h-screen font-sans">
      <Sidebar />
      <div className="ml-64 flex-1">
        <Dashboard />
      </div>
    </div>
  );
}

export default App;
