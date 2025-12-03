'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

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

    if (typeof window !== 'undefined' && (window as any).baselime) {
      (window as any).baselime.logError(error, {
        digest: error.digest,
        boundary: 'global-error',
      });
    }
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>

            <div className="mt-6 text-center">
              <h1 className="text-2xl font-bold text-slate-900">Application Error</h1>
              <p className="mt-2 text-slate-600">
                We encountered an unexpected error. Our team has been notified and is working on a
                fix.
              </p>

              {process.env.NODE_ENV === 'development' && error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">
                    Error details (dev only)
                  </summary>
                  <div className="mt-2 p-3 bg-slate-100 rounded text-xs font-mono overflow-auto max-h-48">
                    <p className="font-bold text-red-600">{error.toString()}</p>
                    {error.digest && <p className="mt-1 text-slate-600">Digest: {error.digest}</p>}
                    {error.stack && (
                      <pre className="mt-2 text-slate-700 whitespace-pre-wrap text-xs">
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
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </button>
              <a
                href="/"
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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
