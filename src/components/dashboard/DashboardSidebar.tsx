'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CreditCard,
  History,
  Settings,
  HelpCircle,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface ISidebarItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const menuItems: ISidebarItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'History', href: '/dashboard/history', icon: History },
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

const bottomMenuItems: ISidebarItem[] = [
  { label: 'Help & Support', href: '/dashboard/support', icon: HelpCircle },
];

export const DashboardSidebar: React.FC = () => {
  const pathname = usePathname();
  const { signOut, user } = useAuthStore();

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-white border-r border-slate-200">
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
            <p className="text-sm font-medium text-slate-900 truncate">
              {user?.name || 'User'}
            </p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
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
            </Link>
          );
        })}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 py-4 border-t border-slate-100 space-y-1">
        {bottomMenuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
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
            </Link>
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
  );
};
