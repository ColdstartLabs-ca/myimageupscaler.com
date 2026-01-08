'use client';

import { Clock, Image } from 'lucide-react';
import { useTranslations } from 'next-intl';

export const dynamic = 'force-dynamic';

export default function HistoryPage() {
  const t = useTranslations('dashboard.history');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {/* History List */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <Clock size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-primary">{t('recentUploads')}</h2>
            <p className="text-sm text-muted-foreground">{t('yourHistory')}</p>
          </div>
        </div>

        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-surface-light flex items-center justify-center mx-auto mb-4">
            <Image size={32} className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">{t('noImages')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('willAppearHere')}</p>
        </div>
      </div>
    </div>
  );
}
