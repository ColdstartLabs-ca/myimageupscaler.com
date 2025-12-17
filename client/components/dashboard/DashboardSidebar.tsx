'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, CreditCard, Settings, HelpCircle, LogOut, Shield, X } from 'lucide-react';
import { useUserStore, useIsAdmin } from '@client/store/userStore';
import { CreditsDisplay } from '@client/components/stripe/CreditsDisplay';
import { useLogger } from '@client/utils/logger';
import { cn } from '@client/utils/cn';

interface ISidebarItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface IDashboardSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const DashboardSidebar: React.FC<IDashboardSidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut, user } = useUserStore();
  const isAdmin = useIsAdmin();
  const logger = useLogger('DashboardSidebar');

  // Build menu items dynamically based on user role
  const menuItems: ISidebarItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  // Add Admin menu item if user is admin
  if (isAdmin) {
    menuItems.push({ label: 'Admin', href: '/dashboard/admin', icon: Shield });
  }

  const bottomMenuItems: ISidebarItem[] = [
    { label: 'Help & Support', href: '/dashboard/support', icon: HelpCircle },
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      logger.error('Error signing out', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userEmail: user?.email,
      });
    }
  };

  const handleNavigation = (href: string) => {
    router.push(href);
    // Close drawer on mobile after navigation
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop - Mobile only */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          // Base styles
          'flex flex-col w-64 min-h-screen bg-white border-r border-slate-200',
          // Desktop: static positioning
          'hidden md:flex',
          // Mobile: drawer positioning
          isOpen && 'fixed inset-y-0 left-0 z-50 flex md:relative',
          // Animation
          'transition-transform duration-200 ease-in-out',
          !isOpen && '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Close button - Mobile only */}
        {isOpen && onClose && (
          <button
            className="md:hidden absolute top-4 right-4 p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Logo/Brand */}
        <div className="p-6 border-b border-slate-100">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">PP</span>
            </div>
            <span className="font-semibold text-slate-900">PixelPerfect</span>
          </Link>
        </div>

        {/* User Info */}
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
              <span className="text-indigo-600 font-medium text-sm">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {user?.name || 'User'}
                </p>
                {isAdmin && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          {/* Credits Display */}
          <div className="mt-3">
            <CreditsDisplay />
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {menuItems.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <button
                key={item.href}
                onClick={() => handleNavigation(item.href)}
                className={`
                flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full text-left
                ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }
              `}
              >
                <Icon
                  size={20}
                  className={`mr-3 ${active ? 'text-indigo-600' : 'text-slate-400'}`}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="px-3 py-4 border-t border-slate-100 space-y-1">
          {bottomMenuItems.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <button
                key={item.href}
                onClick={() => handleNavigation(item.href)}
                className={`
                flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full text-left
                ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }
              `}
              >
                <Icon
                  size={20}
                  className={`mr-3 ${active ? 'text-indigo-600' : 'text-slate-400'}`}
                />
                {item.label}
              </button>
            );
          })}

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
          >
            <LogOut size={20} className="mr-3 text-slate-400" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
};
