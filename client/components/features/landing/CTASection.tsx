'use client';

import { useModalStore } from '@client/store/modalStore';
import { clientEnv } from '@shared/config/env';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { DEFAULT_LOCALE } from '@/i18n/config';

export const CTASection = (): JSX.Element => {
  const { openAuthModal } = useModalStore();
  const t = useTranslations('blog.cta');
  const locale = useLocale();

  // Helper to generate localized URLs
  const localizedPath = (path: string) => {
    if (locale === DEFAULT_LOCALE) {
      return path;
    }
    // Handle root path specially to avoid trailing slash redirect
    if (path === '' || path === '/') {
      return `/${locale}`;
    }
    return `/${locale}${path}`;
  };

  return (
    <section className="relative py-32 overflow-hidden section-glow-top">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 via-main to-accent/10"></div>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-30"></div>

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl sm:text-6xl font-black text-white mb-6">{t('title')}</h2>
        <p className="text-xl text-text-secondary mb-12 max-w-2xl mx-auto font-light leading-relaxed">
          {t('description', { appName: clientEnv.APP_NAME })}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <button
            onClick={() => openAuthModal('register')}
            className="group inline-flex items-center gap-3 px-10 py-5 text-white font-bold rounded-xl transition-all duration-300 gradient-cta shine-effect hover:scale-[1.05] active:scale-[0.95] shadow-xl shadow-accent/20"
          >
            <Sparkles size={22} className="group-hover:rotate-12 transition-transform" />
            {t('primaryButton')}
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <a
            href={localizedPath('/pricing')}
            className="inline-flex items-center gap-3 px-10 py-5 glass-strong hover:bg-white/5 text-white font-bold rounded-xl transition-all duration-300 hover:scale-[1.05] active:scale-[0.95]"
          >
            {t('secondaryButton')}
          </a>
        </div>
        <p className="mt-8 text-sm text-text-muted">{t('disclaimer')}</p>
      </div>
    </section>
  );
};
