import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/server/supabase/supabaseAdmin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Note: This layout relies on middleware for authentication
  // The actual admin check happens client-side via the admin routes
  // For now, we trust that the middleware handles auth
  // TODO: Add proper server-side auth check when server client is available

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Admin Panel</h1>
        <p className="text-sm text-slate-500 mt-1">Manage users, subscriptions, and credits</p>
      </div>
      {children}
    </div>
  );
}
