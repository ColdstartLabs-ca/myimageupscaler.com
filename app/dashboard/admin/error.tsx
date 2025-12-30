'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Shield, RefreshCw, ArrowLeft } from 'lucide-react';
import { isDevelopment } from '@shared/config/env';

/**
 * Error boundary for admin routes
 * Catches errors in /dashboard/admin/* and displays a contextual error page
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin panel error caught:', error);

    if (typeof window !== 'undefined') {
      const baselime = (
        window as unknown as { baselime?: { logError: (error: Error, metadata: unknown) => void } }
      ).baselime;
      if (baselime) {
        baselime.logError(error, {
          digest: error.digest,
          boundary: 'admin-error',
          route: window.location.pathname,
        });
      }
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-surface rounded-lg border border-white/10 p-8">
        <div className="flex items-center justify-center w-12 h-12 mx-auto bg-secondary/20 rounded-full">
          <Shield className="h-6 w-6 text-secondary" />
        </div>

        <div className="mt-6 text-center">
          <h2 className="text-xl font-bold text-primary">Admin Panel Error</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            An error occurred in the admin panel. This has been logged for review.
          </p>

          {isDevelopment() && error && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-muted-foreground">
                Error details (dev only)
              </summary>
              <div className="mt-2 p-3 bg-surface-light rounded text-xs font-mono overflow-auto max-h-40">
                <p className="font-bold text-error">{error.toString()}</p>
                {error.digest && (
                  <p className="mt-1 text-muted-foreground">Digest: {error.digest}</p>
                )}
                {error.stack && (
                  <pre className="mt-2 text-muted-foreground whitespace-pre-wrap text-xs">
                    {error.stack.slice(0, 500)}
                  </pre>
                )}
              </div>
            </details>
          )}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={reset}
            className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </button>
          <Link
            href="/dashboard/admin"
            className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-muted-foreground bg-surface border border-white/20 hover:bg-surface rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Admin Home
          </Link>
        </div>
      </div>
    </div>
  );
}
