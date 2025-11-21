'use client';

import { type ReactNode } from 'react';
import { AuthErrorHandler } from './auth/AuthErrorHandler';
import { Toast } from './common/Toast';
import { AuthenticationModal } from './modal/auth/AuthenticationModal';

export function ClientProviders({ children }: { children: ReactNode }): ReactNode {
  return (
    <>
      <AuthErrorHandler />
      <AuthenticationModal />
      <Toast />
      {children}
    </>
  );
}
