'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CreditCard,
  Settings,
  HelpCircle,
  LogOut,
  Shield,
  X,
  Loader2,
} from 'lucide-react';
import { useUserStore, useIsAdmin, useSubscription } from '@client/store/userStore';
import { CreditsDisplay } from '@client/components/stripe/CreditsDisplay';
import { getPlanDisplayName } from '@shared/config/stripe';
import { useLogger } from '@client/utils/logger';
import { cn } from '@client/utils/cn';
import { clientEnv } from '@shared/config/env';
import { useTranslations } from 'next-intl';

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
  const { signOut, user, isLoading, error } = useUserStore();
  const isAdmin = useIsAdmin();
  const subscription = useSubscription();
  const logger = useLogger('DashboardSidebar');
  const t = useTranslations('dashboard.sidebar');

  // Check if profile data is still loading (but not if there's an error)
  const isProfileLoading = isLoading || (user && !user.profile && !error);

  // Resolve subscription to plan name - prioritize profile's subscription_tier
  const planDisplayName = getPlanDisplayName({
    subscriptionTier: user?.profile?.subscription_tier,
    priceId: subscription?.price_id,
  });

  // Build menu items dynamically based on user role
  const menuItems: ISidebarItem[] = [
    { label: t('dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { label: t('billing'), href: '/dashboard/billing', icon: CreditCard },
    { label: t('settings'), href: '/dashboard/settings', icon: Settings },
  ];

  // Add Admin menu item if user is admin
  if (isAdmin) {
    menuItems.push({ label: t('admin'), href: '/dashboard/admin', icon: Shield });
  }

  const bottomMenuItems: ISidebarItem[] = [
    { label: t('helpSupport'), href: '/dashboard/support', icon: HelpCircle },
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
      // Redirect is handled by auth state change listener in userStore.ts
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
          'flex flex-col w-64 min-h-screen bg-surface border-r border-border',
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
            className="md:hidden absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-white hover:bg-surface-light transition-colors"
            onClick={onClose}
            aria-label={t('closeMenu')}
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Logo/Brand */}
        <div className="p-6 border-b border-border">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo/horizontal-logo-compact.png"
              alt={clientEnv.APP_NAME}
              width={120}
              height={40}
              className="h-8 w-auto"
              priority
            />
          </Link>
        </div>

        {/* User Info */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/30 to-tertiary/30 flex items-center justify-center ring-1 ring-accent/20">
              <span className="text-accent font-semibold text-sm">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
                {isAdmin && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent">
                    {t('admin')}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent">
                {isProfileLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : error ? (
                  t('planUnavailable')
                ) : (
                  `${planDisplayName} ${t('plan')}`
                )}
              </span>
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
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted-foreground hover:bg-surface-light hover:text-white'
                }
              `}
              >
                <Icon
                  size={20}
                  className={`mr-3 ${active ? 'text-accent' : 'text-muted-foreground'}`}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="px-3 py-4 border-t border-border space-y-1">
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
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted-foreground hover:bg-surface-light hover:text-white'
                }
              `}
              >
                <Icon
                  size={20}
                  className={`mr-3 ${active ? 'text-accent' : 'text-muted-foreground'}`}
                />
                {item.label}
              </button>
            );
          })}

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-all duration-200"
          >
            <LogOut size={20} className="mr-3 text-muted-foreground" />
            {t('signOut')}
          </button>
        </div>
      </aside>
    </>
  );
};
