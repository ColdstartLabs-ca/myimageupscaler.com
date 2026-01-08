import React from 'react';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Note: This layout relies on middleware for authentication
  // The middleware.ts file already protects admin routes and handles authentication
  // If user reaches here, they are authenticated and authorized
  // Server-side auth check can be added here in the future if needed

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-semibold text-primary">Admin Panel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage users, subscriptions, and credits
        </p>
      </div>
      {children}
    </div>
  );
}
