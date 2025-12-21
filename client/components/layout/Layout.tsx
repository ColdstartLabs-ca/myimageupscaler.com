'use client';

import React, { JSX } from 'react';
import { usePathname } from 'next/navigation';
import { LoadingBackdrop } from '@client/components/common/LoadingBackdrop';
import { NavBar } from '@client/components/navigation/NavBar';
import { Footer } from '@client/components/layout/Footer';

interface ILayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: ILayoutProps): JSX.Element => {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith('/dashboard');

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
    <div className="min-h-screen bg-main flex flex-col">
      <LoadingBackdrop />
      <div className="max-w-[1600px] mx-auto w-full flex-1 flex flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
      </div>
      <Footer />
    </div>
  );
};
