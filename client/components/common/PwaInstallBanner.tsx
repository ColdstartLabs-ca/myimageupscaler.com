'use client';

import { type ReactNode } from 'react';
import { X, MonitorDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePwaInstall } from '@client/hooks/usePwaInstall';
import { clientEnv } from '@shared/config/env';

export function PwaInstallBanner(): ReactNode {
  const { canInstall, promptInstall, dismiss } = usePwaInstall();
  const t = useTranslations('common.common');

  if (!canInstall) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-slide-up">
      <div className="bg-elevated border border-border rounded-xl shadow-lg p-4 flex items-center gap-3">
        <MonitorDown className="shrink-0 text-accent" size={20} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">
            {t('pwaInstallTitle', { appName: clientEnv.APP_NAME })}
          </p>
          <p className="text-xs text-text-muted mt-0.5">{t('pwaInstallDescription')}</p>
        </div>
        <button
          onClick={promptInstall}
          className="shrink-0 bg-accent hover:bg-accent-hover text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {t('pwaInstallButton')}
        </button>
        <button
          onClick={dismiss}
          className="shrink-0 text-text-muted hover:text-text-primary transition-colors"
          aria-label={t('dismiss')}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
