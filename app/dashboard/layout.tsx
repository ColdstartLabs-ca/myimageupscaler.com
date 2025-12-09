'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import { DashboardLayout } from '@client/components/dashboard';
import { useUserStore } from '@client/store/userStore';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useLowCreditWarning } from '@client/hooks/useLowCreditWarning';

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useUserStore();
  const router = useRouter();

  // Initialize low credit warning for authenticated users
  useLowCreditWarning();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show nothing while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // Redirect handled by useEffect, but don't render children while not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
