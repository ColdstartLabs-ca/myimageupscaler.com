'use client';

import { Bell, Lock, User } from 'lucide-react';
import { useAuthStore } from '@client/store/authStore';
import { useModalStore } from '@client/store/modalStore';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { open } = useModalStore();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">
          Manage your account preferences
        </p>
      </div>

      {/* Profile Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <User size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Profile</h2>
            <p className="text-sm text-slate-500">Your account information</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={user?.name || ''}
              placeholder="Not set"
              disabled
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <Lock size={20} className="text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Security</h2>
            <p className="text-sm text-slate-500">Password and authentication</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-900">Password</p>
            <p className="text-sm text-slate-500">Change your account password</p>
          </div>
          <button
            onClick={() => open('authenticationModal')}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Change Password
          </button>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <Bell size={20} className="text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Notifications</h2>
            <p className="text-sm text-slate-500">Email and notification preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-slate-900">Product updates</p>
              <p className="text-sm text-slate-500">News about product and feature updates</p>
            </div>
            <input
              type="checkbox"
              defaultChecked
              className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-slate-900">Marketing emails</p>
              <p className="text-sm text-slate-500">Promotions and special offers</p>
            </div>
            <input
              type="checkbox"
              className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
