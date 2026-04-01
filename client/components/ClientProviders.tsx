'use client';

import { type ReactNode } from 'react';
import { AnalyticsProvider } from '@client/components/analytics/AnalyticsProvider';
import { AuthErrorHandler } from '@client/components/auth/AuthErrorHandler';
import { Toast } from '@client/components/common/Toast';
import { BaselimeProvider } from '@client/components/monitoring/BaselimeProvider';
import dynamic from 'next/dynamic';

// Auth modals are heavy (react-hook-form, zod, supabase client, social login).
// Lazy-load them since they only render when the user clicks login/signup.
const AuthenticationModal = dynamic(
  () =>
    import('@client/components/modal/auth/AuthenticationModal').then(m => m.AuthenticationModal),
  { ssr: false }
);

const AuthRequiredModal = dynamic(
  () => import('@client/components/modal/auth/AuthRequiredModal').then(m => m.AuthRequiredModal),
  { ssr: false }
);

const PwaInstallBanner = dynamic(
  () => import('@client/components/common/PwaInstallBanner').then(m => m.PwaInstallBanner),
  { ssr: false }
);

export function ClientProviders({ children }: { children: ReactNode }): ReactNode {
  return (
    <AnalyticsProvider>
      <BaselimeProvider>
        <AuthErrorHandler />
        <AuthenticationModal />
        <AuthRequiredModal />
        <Toast vertical="top" />
        <PwaInstallBanner />
        {children}
      </BaselimeProvider>
    </AnalyticsProvider>
  );
}
