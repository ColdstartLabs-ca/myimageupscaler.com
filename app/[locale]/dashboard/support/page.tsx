'use client';

import { BookOpen, Mail, MessageCircle } from 'lucide-react';
import { clientEnv } from '@shared/config/env';
import { useTranslations } from 'next-intl';

export default function SupportPage() {
  const t = useTranslations('dashboard.support');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('subtitle', { appName: clientEnv.APP_NAME })}
        </p>
      </div>

      {/* Support Options */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Documentation */}
        <div className="bg-surface rounded-xl border border-border p-6 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/10 transition-all">
          <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-4">
            <BookOpen size={24} className="text-accent" />
          </div>
          <h2 className="font-semibold text-white mb-2">{t('documentation')}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t('documentationDescription', { appName: clientEnv.APP_NAME })}
          </p>
          <button className="text-accent text-sm font-medium hover:text-accent-hover">
            {t('browseDocs')}
          </button>
        </div>

        {/* FAQ */}
        <div className="bg-surface rounded-xl border border-border p-6 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/10 transition-all">
          <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-4">
            <MessageCircle size={24} className="text-accent" />
          </div>
          <h2 className="font-semibold text-white mb-2">{t('faq')}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t('faqDescription')}</p>
          <button className="text-accent text-sm font-medium hover:text-accent-hover">
            {t('viewFaq')}
          </button>
        </div>
      </div>

      {/* Contact Support */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
            <Mail size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-white">{t('contactSupport')}</h2>
            <p className="text-sm text-muted-foreground">{t('contactSupportSubtitle')}</p>
          </div>
        </div>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1">{t('subject')}</label>
            <input
              type="text"
              placeholder={t('subjectPlaceholder')}
              className="w-full px-4 py-2 bg-surface-light border border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent text-white placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">{t('message')}</label>
            <textarea
              rows={4}
              placeholder={t('messagePlaceholder')}
              className="w-full px-4 py-2 bg-surface-light border border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent resize-none text-white placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            {t('sendMessage')}
          </button>
        </form>
      </div>
    </div>
  );
}
