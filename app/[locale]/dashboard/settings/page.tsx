'use client';

import { Lock, User, Mail, Sliders } from 'lucide-react';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { useTranslations } from 'next-intl';
import { useEmailPreferences } from '@client/hooks/useEmailPreferences';
import {
  isAutoResizeEnabled,
  setAutoResizePreference,
} from '@client/components/features/image-processing/OversizedImageModal';
import { InternalTabs, ITabItem } from '@client/components/ui/InternalTabs';
import { useState, useCallback } from 'react';

// --- Tab content components ---

function ProfileTab() {
  const { user } = useUserStore();
  const { openAuthModal } = useModalStore();
  const t = useTranslations('dashboard.settings');
  const isPasswordUser = user?.provider === 'email';

  return (
    <div className="space-y-6">
      {/* Profile */}
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

      {/* Security */}
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
    </div>
  );
}

function NotificationsTab() {
  const t = useTranslations('dashboard.settings');
  const { preferences, isLoading, isUpdating, toggle } = useEmailPreferences();

  return (
    <div className="bg-surface rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
          <Mail size={20} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-semibold text-white">{t('notifications')}</h2>
          <p className="text-sm text-muted-foreground">{t('notificationsSubtitle')}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading preferences...</div>
      ) : (
        <div className="space-y-4">
          <ToggleRow
            label={t('productUpdates')}
            description={t('productUpdatesDescription')}
            checked={!!preferences?.product_updates}
            disabled={isUpdating}
            onToggle={() => toggle('product_updates')}
          />
          <ToggleRow
            label={t('marketingEmails')}
            description={t('marketingEmailsDescription')}
            checked={!!preferences?.marketing_emails}
            disabled={isUpdating}
            onToggle={() => toggle('marketing_emails')}
          />
          <ToggleRow
            label="Low Credit Alerts"
            description="Get notified when your credits are running low"
            checked={!!preferences?.low_credit_alerts}
            disabled={isUpdating}
            onToggle={() => toggle('low_credit_alerts')}
          />
        </div>
      )}
    </div>
  );
}

function ProcessingTab() {
  const [autoResize, setAutoResize] = useState(() => isAutoResizeEnabled());
  const handleAutoResizeToggle = useCallback(() => {
    const newValue = !autoResize;
    setAutoResize(newValue);
    setAutoResizePreference(newValue);
  }, [autoResize]);

  return (
    <div className="bg-surface rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
          <Sliders size={20} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-semibold text-white">Processing</h2>
          <p className="text-sm text-muted-foreground">Image processing preferences</p>
        </div>
      </div>

      <div className="space-y-4">
        <ToggleRow
          label="Auto-Resize Oversized Images"
          description="Automatically resize images that exceed the pixel or file size limit instead of showing a confirmation dialog"
          checked={autoResize}
          onToggle={handleAutoResizeToggle}
        />
      </div>
    </div>
  );
}

// --- Shared toggle row ---

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <div className="flex-1">
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={e => {
          e.preventDefault();
          if (!disabled) onToggle();
        }}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-light'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

// --- Main page ---

export default function SettingsPage() {
  const t = useTranslations('dashboard.settings');

  const tabs: ITabItem[] = [
    { id: 'profile', label: 'Profile', icon: User, content: <ProfileTab /> },
    { id: 'notifications', label: 'Notifications', icon: Mail, content: <NotificationsTab /> },
    { id: 'processing', label: 'Processing', icon: Sliders, content: <ProcessingTab /> },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <InternalTabs tabs={tabs} defaultTab="profile" />
    </div>
  );
}
