import Link from 'next/link';
import { Home, Search } from 'lucide-react';

/**
 * Global 404 Not Found page
 * Displayed when a route doesn't exist in the application
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-slate-200">404</h1>
          <div className="flex items-center justify-center -mt-8">
            <Search className="h-8 w-8 text-slate-400" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-2">Page Not Found</h2>
        <p className="text-slate-600 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Home className="h-5 w-5 mr-2" />
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
