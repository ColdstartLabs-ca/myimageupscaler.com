'use client';

import { Bell, Lock, User } from 'lucide-react';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';

export default function SettingsPage() {
  const { user } = useUserStore();
  const { openAuthModal } = useModalStore();

  // Check if user is authenticated through email/password (not OAuth)
  const isPasswordUser = user?.provider === 'email';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account preferences</p>
      </div>

      {/* Profile Settings */}
      <div className="bg-surface rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <User size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Profile</h2>
            <p className="text-sm text-muted-foreground">Your account information</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-4 py-2 bg-surface-light border border-white/10 rounded-lg text-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">Display Name</label>
            <input
              type="text"
              value={user?.name || ''}
              placeholder="Not set"
              disabled
              className="w-full px-4 py-2 bg-surface-light border border-white/10 rounded-lg text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* Security Settings */}
      {isPasswordUser && (
        <div className="bg-surface rounded-xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
              <Lock size={20} className="text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Security</h2>
              <p className="text-sm text-muted-foreground">Password and authentication</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white">Password</p>
              <p className="text-sm text-muted-foreground">Change your account password</p>
            </div>
            <button
              onClick={() => openAuthModal('changePassword')}
              className="px-4 py-2 border border-white/10 text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors"
            >
              Change Password
            </button>
          </div>
        </div>
      )}

      {/* Notification Settings */}
      <div className="bg-surface rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
            <Bell size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Notifications</h2>
            <p className="text-sm text-muted-foreground">Email and notification preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-white">Product updates</p>
              <p className="text-sm text-muted-foreground">
                News about product and feature updates
              </p>
            </div>
            <input
              type="checkbox"
              defaultChecked
              className="w-5 h-5 text-accent rounded border-white/10 focus:ring-accent"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-white">Marketing emails</p>
              <p className="text-sm text-muted-foreground">Promotions and special offers</p>
            </div>
            <input
              type="checkbox"
              className="w-5 h-5 text-accent rounded border-white/10 focus:ring-accent"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
