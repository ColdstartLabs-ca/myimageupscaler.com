import { clientEnv } from '@shared/config/env';
import Image from 'next/image';
import Link from 'next/link';
import { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@client/components/i18n/LocaleSwitcher';

export const Footer = (): JSX.Element => {
  const t = useTranslations('footer');
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-main text-text-muted mt-auto border-t border-border">
      <div className="max-w-[1600px] mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Company Info */}
          <div className="space-y-4">
            <Link href="/">
              <Image
                src="/logo/horizontal-logo-full.png"
                alt={clientEnv.APP_NAME}
                width={180}
                height={45}
                className="h-10 w-auto"
              />
            </Link>
            <p className="text-sm text-text-muted font-medium leading-relaxed max-w-xs">
              {t('description')}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">{t('product')}</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li>
                <Link href="/pricing" className="hover:text-accent transition-colors">
                  {t('pricingPlans')}
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-accent transition-colors">
                  {t('latestUpdates')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">{t('support')}</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li>
                <Link href="/help" className="hover:text-accent transition-colors">
                  {t('helpCenter')}
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
                  className="hover:text-accent transition-colors"
                >
                  {t('contactSupport')}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">{t('legal')}</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li>
                <Link href="/privacy" className="hover:text-accent transition-colors">
                  {t('privacyPolicy')}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-accent transition-colors">
                  {t('termsOfService')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs font-medium text-text-muted">
            © {currentYear} {clientEnv.APP_NAME}. {t('allRightsReserved')} {t('copyright')}
          </p>
          <div className="flex items-center gap-6">
            <LocaleSwitcher />
            <div className="flex gap-8 text-xs font-black uppercase tracking-widest">
              <Link href="/privacy" className="hover:text-white transition-colors">
                {t('privacy')}
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                {t('terms')}
              </Link>
              <Link href="/help" className="hover:text-white transition-colors">
                {t('help')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
