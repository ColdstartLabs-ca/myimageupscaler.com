'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { isDevelopment } from '@shared/config/env';

/**
 * Global error boundary for the entire application
 * Catches errors in the app directory and displays a user-friendly error page
 * See: https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to monitoring service
    console.error('Global error caught:', error);

    if (typeof window !== 'undefined') {
      const baselime = (
        window as unknown as { baselime?: { logError: (error: Error, metadata: unknown) => void } }
      ).baselime;
      if (baselime) {
        baselime.logError(error, {
          digest: error.digest,
          boundary: 'global-error',
        });
      }
    }
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-surface px-4">
          <div className="max-w-md w-full bg-surface rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-error/20 rounded-full">
              <AlertTriangle className="h-6 w-6 text-error" />
            </div>

            <div className="mt-6 text-center">
              <h1 className="text-2xl font-bold text-primary">Application Error</h1>
              <p className="mt-2 text-muted-foreground">
                We encountered an unexpected error. Our team has been notified and is working on a
                fix.
              </p>

              {isDevelopment() && error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-muted-foreground">
                    Error details (dev only)
                  </summary>
                  <div className="mt-2 p-3 bg-surface-light rounded text-xs font-mono overflow-auto max-h-48">
                    <p className="font-bold text-error">{error.toString()}</p>
                    {error.digest && (
                      <p className="mt-1 text-muted-foreground">Digest: {error.digest}</p>
                    )}
                    {error.stack && (
                      <pre className="mt-2 text-muted-foreground whitespace-pre-wrap text-xs">
                        {error.stack}
                      </pre>
                    )}
                  </div>
                </details>
              )}
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                onClick={reset}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-accent hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </button>
              <a
                href="/"
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-white/20 rounded-lg shadow-sm text-sm font-medium text-muted-foreground bg-surface hover:bg-surface focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
