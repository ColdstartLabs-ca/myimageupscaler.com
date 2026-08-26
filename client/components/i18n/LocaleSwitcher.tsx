'use client';

import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { US, ES, BR, DE, FR, IT, JP } from 'country-flag-icons/react/3x2';
import { ChevronDown } from 'lucide-react';
import { useClickOutside } from '@client/hooks/useClickOutside';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, locales, type Locale } from '@/i18n/config';
import { useTranslations } from 'next-intl';

/** Map locale country codes to flag components */
const FlagComponents = {
  US,
  ES,
  BR,
  DE,
  FR,
  IT,
  JP,
} as const;

/**
 * LocaleSwitcher Component
 *
 * Compact flag dropdown for switching languages.
 */
export function LocaleSwitcher(): JSX.Element {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [preferredLocale, setPreferredLocale] = useState<Locale | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsOpen(false));

  useEffect(() => {
    const storedLocale = document.cookie
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith('locale='))
      ?.slice('locale='.length);
    if (storedLocale && SUPPORTED_LOCALES.includes(storedLocale as Locale)) {
      setPreferredLocale(storedLocale as Locale);
      return;
    }

    const browserLocale = navigator.languages
      .map(value => value.split('-')[0])
      .find(value => SUPPORTED_LOCALES.includes(value as Locale));
    if (browserLocale) setPreferredLocale(browserLocale as Locale);
  }, []);

  const handleLocaleChange = (newLocale: Locale) => {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0];

    const pathWithoutLocale =
      firstSegment && SUPPORTED_LOCALES.includes(firstSegment as Locale)
        ? '/' + segments.slice(1).join('/')
        : pathname;

    const newPathname =
      newLocale === DEFAULT_LOCALE ? pathWithoutLocale || '/' : `/${newLocale}${pathWithoutLocale}`;

    document.cookie = `locale=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    setPreferredLocale(newLocale);

    setIsOpen(false);

    // Use hard navigation to ensure locale context is properly reloaded
    window.location.href = newPathname;
  };

  const currentCountry = locales[locale].country as keyof typeof FlagComponents;
  const CurrentFlag = FlagComponents[currentCountry];

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-1">
        {preferredLocale && preferredLocale !== locale && (
          <button
            onClick={() => handleLocaleChange(preferredLocale)}
            className="px-2 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
          >
            Switch to {locales[preferredLocale].label}
          </button>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
          aria-label={t('i18n.switcher.ariaLabel')}
        >
          <CurrentFlag className="w-5 h-3.5 rounded-sm" />
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-36 glass-dropdown rounded-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-200">
          {SUPPORTED_LOCALES.map(loc => {
            const country = locales[loc].country as keyof typeof FlagComponents;
            const Flag = FlagComponents[country];
            const isActive = locale === loc;

            return (
              <button
                key={loc}
                onClick={() => handleLocaleChange(loc)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'text-white bg-white/10'
                    : 'text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                <Flag className="w-5 h-3.5 rounded-sm" />
                <span className="font-medium">{locales[loc].label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
