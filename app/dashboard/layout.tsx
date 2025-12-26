'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import { DashboardLayout } from '@client/components/dashboard';
import { useUserStore } from '@client/store/userStore';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLowCreditWarning } from '@client/hooks/useLowCreditWarning';

// Grace period to allow auth state to settle after OAuth redirect
const AUTH_GRACE_PERIOD_MS = 500;

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useUserStore();
  const router = useRouter();
  const [authGracePeriodElapsed, setAuthGracePeriodElapsed] = useState(false);

  // Initialize low credit warning for authenticated users
  useLowCreditWarning();

  // Start grace period timer on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthGracePeriodElapsed(true);
    }, AUTH_GRACE_PERIOD_MS);
    return () => clearTimeout(timer);
  }, []);

  // Only redirect after grace period has elapsed (gives onAuthStateChange time to fire)
  useEffect(() => {
    if (authGracePeriodElapsed && !isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router, authGracePeriodElapsed]);

  // Show loading while checking auth
  // Also show loading during grace period if not authenticated (waiting for onAuthStateChange)
  const shouldShowLoading = isLoading || (!isAuthenticated && !authGracePeriodElapsed);
  if (shouldShowLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  // Redirect handled by useEffect, but don't render children while not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
