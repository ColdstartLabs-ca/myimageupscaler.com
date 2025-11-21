'use client';

import React from 'react';
import { DashboardSidebar } from './DashboardSidebar';

interface IDashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<IDashboardLayoutProps> = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
};
