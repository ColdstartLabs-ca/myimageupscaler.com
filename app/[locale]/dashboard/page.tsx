'use client';

import { useTranslations } from 'next-intl';
import Workspace from '@client/components/features/workspace/Workspace';

export default function DashboardPage() {
  const t = useTranslations('dashboard');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {/* Workspace with Upload Dropzone */}
      <Workspace />
    </div>
  );
}
