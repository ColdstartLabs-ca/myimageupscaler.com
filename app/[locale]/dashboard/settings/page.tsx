'use client';

import { Bell, Lock, User } from 'lucide-react';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { useTranslations } from 'next-intl';

export default function SettingsPage() {
  const { user } = useUserStore();
  const { openAuthModal } = useModalStore();
  const t = useTranslations('dashboard.settings');

  // Check if user is authenticated through email/password (not OAuth)
  const isPasswordUser = user?.provider === 'email';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {/* Profile Settings */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <User size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-white">{t('profile')}</h2>
            <p className="text-sm text-muted-foreground">{t('profileSubtitle')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1">{t('email')}</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-4 py-2 bg-surface-light border border-border rounded-lg text-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">{t('displayName')}</label>
            <input
              type="text"
              value={user?.name || ''}
              placeholder={t('notSet')}
              disabled
              className="w-full px-4 py-2 bg-surface-light border border-border rounded-lg text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* Security Settings */}
      {isPasswordUser && (
        <div className="bg-surface rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
              <Lock size={20} className="text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-white">{t('security')}</h2>
              <p className="text-sm text-muted-foreground">{t('securitySubtitle')}</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{t('changePassword')}</p>
              <p className="text-sm text-muted-foreground">{t('passwordDescription')}</p>
            </div>
            <button
              onClick={() => openAuthModal('changePassword')}
              className="px-4 py-2 border border-border text-white rounded-lg text-sm font-medium hover:bg-surface/10 transition-colors"
            >
              {t('changePassword')}
            </button>
          </div>
        </div>
      )}

      {/* Notification Settings */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
            <Bell size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-white">{t('notifications')}</h2>
            <p className="text-sm text-muted-foreground">{t('notificationsSubtitle')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-white">{t('productUpdates')}</p>
              <p className="text-sm text-muted-foreground">{t('productUpdatesDescription')}</p>
            </div>
            <input
              type="checkbox"
              defaultChecked
              className="w-5 h-5 text-accent rounded border-border focus:ring-accent"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-white">{t('marketingEmails')}</p>
              <p className="text-sm text-muted-foreground">{t('marketingEmailsDescription')}</p>
            </div>
            <input
              type="checkbox"
              className="w-5 h-5 text-accent rounded border-border focus:ring-accent"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
