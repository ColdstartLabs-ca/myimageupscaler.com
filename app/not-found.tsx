import Link from 'next/link';
import { Home, Search } from 'lucide-react';

/**
 * Global 404 Not Found page
 * Displayed when a route doesn't exist in the application
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-slate-200">404</h1>
          <div className="flex items-center justify-center -mt-8">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-primary mb-2">Page Not Found</h2>
        <p className="text-muted-foreground mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-accent hover:bg-accent-hover rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
          >
            <Home className="h-5 w-5 mr-2" />
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-muted-foreground bg-surface border border-white/20 hover:bg-surface rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
