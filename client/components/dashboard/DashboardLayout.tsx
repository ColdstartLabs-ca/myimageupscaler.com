'use client';

import { useState } from 'react';
import { DashboardSidebar } from '@client/components/dashboard/DashboardSidebar';
import { CreditsDisplay } from '@client/components/stripe/CreditsDisplay';
import { Menu } from 'lucide-react';
import React from 'react';

interface IDashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<IDashboardLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between gap-3 px-4 h-14">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">PP</span>
            </div>
            <span className="font-semibold text-slate-900">PixelPerfect</span>
          </div>

          {/* Credits Display */}
          <div className="flex-1 flex justify-center max-w-[150px]">
            <div className="scale-90 origin-center">
              <CreditsDisplay />
            </div>
          </div>

          {/* Hamburger Menu */}
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>

      {/* Sidebar - Desktop: static, Mobile: drawer */}
      <DashboardSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
};
