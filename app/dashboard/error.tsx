'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

/**
 * Error boundary for dashboard routes
 * Catches errors in /dashboard/* and displays a contextual error page
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error caught:', error);

    if (typeof window !== 'undefined' && (window as any).baselime) {
      (window as any).baselime.logError(error, {
        digest: error.digest,
        boundary: 'dashboard-error',
        route: window.location.pathname,
      });
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>

        <div className="mt-6 text-center">
          <h2 className="text-xl font-bold text-slate-900">Dashboard Error</h2>
          <p className="mt-2 text-sm text-slate-600">
            We encountered an error loading this dashboard page. Please try again.
          </p>

          {process.env.NODE_ENV === 'development' && error && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">
                Error details (dev only)
              </summary>
              <div className="mt-2 p-3 bg-slate-100 rounded text-xs font-mono overflow-auto max-h-40">
                <p className="font-bold text-red-600">{error.toString()}</p>
                {error.digest && <p className="mt-1 text-slate-600">Digest: {error.digest}</p>}
                {error.stack && (
                  <pre className="mt-2 text-slate-700 whitespace-pre-wrap text-xs">
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
            className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
