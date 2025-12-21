'use client';

import { useState } from 'react';
import { DashboardSidebar } from '@client/components/dashboard/DashboardSidebar';
import { CreditsDisplay } from '@client/components/stripe/CreditsDisplay';
import { Menu } from 'lucide-react';
import React from 'react';
import { clientEnv, getAppLogoAbbr } from '@shared/config/env';

interface IDashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<IDashboardLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-main">
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-surface border-b border-white/10">
        <div className="flex items-center justify-between gap-3 px-4 h-14">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">{getAppLogoAbbr()}</span>
            </div>
            <span className="font-semibold text-white">{clientEnv.APP_NAME}</span>
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
            className="p-2 rounded-lg text-muted-foreground hover:text-white hover:bg-surface-light transition-colors"
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
