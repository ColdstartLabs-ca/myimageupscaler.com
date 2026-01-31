'use client';

import { LoadingBackdrop } from '@client/components/common/LoadingBackdrop';
import { Footer } from '@client/components/layout/Footer';
import { NavBar } from '@client/components/navigation/NavBar';
import { usePathname } from 'next/navigation';
import React, { JSX } from 'react';

interface ILayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: ILayoutProps): JSX.Element => {
  const pathname = usePathname();
  // Check for dashboard routes with or without locale prefix (e.g., /dashboard or /en/dashboard)
  const segments = pathname?.split('/').filter(Boolean);
  const isDashboard = segments?.[0] === 'dashboard' || segments?.[1] === 'dashboard';

  // Dashboard has its own layout, so skip the main wrapper
  if (isDashboard) {
    return (
      <>
        <LoadingBackdrop />
        {children}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-main flex flex-col overflow-x-hidden">
      <LoadingBackdrop />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:shadow-lg focus:text-black"
      >
        Skip to main content
      </a>
      <NavBar />
      <main id="main-content" className="flex-1 w-full">
        {children}
      </main>
      <Footer />
    </div>
  );
};
