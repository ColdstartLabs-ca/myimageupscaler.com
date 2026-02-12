import { AuthProvider } from '@/shared/types/authProviders.types';
import { LocaleSwitcher } from '@client/components/i18n/LocaleSwitcher';
import { CreditsDisplay } from '@client/components/stripe/CreditsDisplay';
import { useClickOutside } from '@client/hooks/useClickOutside';
import { useModalStore } from '@client/store/modalStore';
import { useUserStore } from '@client/store/userStore';
import { cn } from '@client/utils/cn';
import { clientEnv } from '@shared/config/env';
import { DEFAULT_LOCALE } from '@/i18n/config';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRef, useState } from 'react';

export const NavBar = (): JSX.Element => {
  const t = useTranslations('nav');
  const locale = useLocale();
  const { openAuthModal } = useModalStore();
  const { isAuthenticated, isLoading, user, signOut } = useUserStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const [isResourcesDropdownOpen, setIsResourcesDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const resourcesDropdownRef = useRef<HTMLDivElement>(null);

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

  useClickOutside(dropdownRef, () => setIsDropdownOpen(false));
  useClickOutside(toolsDropdownRef, () => setIsToolsDropdownOpen(false));
  useClickOutside(resourcesDropdownRef, () => setIsResourcesDropdownOpen(false));

  const handleAuthClick = () => {
    if (!isAuthenticated) {
      openAuthModal('login');
    }
  };

  const handleChangePassword = () => {
    openAuthModal('changePassword');
  };

  // Check if user is authenticated through email/password
  const isPasswordUser = user?.provider === AuthProvider.EMAIL;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-main/80 backdrop-blur-xl transition-all duration-300">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href={localizedPath('/')}
          className="flex items-center cursor-pointer hover:opacity-90 transition-all active:scale-95 flex-shrink-0"
        >
          {/* Compact logo for mobile */}
          <Image
            src="/logo/horizontal-logo-compact.png"
            alt={clientEnv.APP_NAME}
            width={100}
            height={40}
            className="xs:hidden h-8 w-auto drop-shadow-[0_2px_8px_rgba(59,130,246,0.3)]"
            priority
          />
          {/* Full logo for desktop */}
          <Image
            src="/logo/horizontal-logo-full.png"
            alt={clientEnv.APP_NAME}
            width={200}
            height={40}
            className="hidden xs:block h-10 w-auto drop-shadow-[0_2px_8px_rgba(59,130,246,0.3)]"
            priority
          />
        </a>

        <nav className="hidden lg:flex items-center gap-2 xl:gap-4 ml-6 xl:ml-10">
          {isAuthenticated && (
            <a
              href={localizedPath('/dashboard')}
              className="text-sm font-bold text-text-muted-aa hover:text-white transition-colors"
            >
              {t('dashboard')}
            </a>
          )}
          <a
            href={localizedPath('/features')}
            className="text-sm font-bold text-text-muted-aa hover:text-white transition-colors"
          >
            {t('features')}
          </a>

          <div className="relative" ref={resourcesDropdownRef}>
            <button
              onClick={() => setIsResourcesDropdownOpen(!isResourcesDropdownOpen)}
              className="flex items-center gap-1.5 text-sm font-bold text-text-muted-aa hover:text-white transition-all group"
            >
              {t('resources')}
              <ChevronDown
                size={14}
                className={cn(
                  'text-text-muted-aa transition-transform group-hover:text-white',
                  isResourcesDropdownOpen && 'rotate-180'
                )}
              />
            </button>
            {isResourcesDropdownOpen && (
              <div className="absolute top-full left-0 mt-4 w-64 glass-dropdown rounded-2xl py-3 z-50 animate-in fade-in zoom-in-95 duration-200">
                <a
                  href={localizedPath('/how-it-works')}
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('howItWorks')}
                </a>
                <a
                  href={localizedPath('/blog')}
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('blog')}
                </a>
                <div className="border-t border-border my-2 pt-2">
                  <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Guides & Resources
                  </p>
                  <a
                    href={localizedPath('/guides')}
                    className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                  >
                    Guides
                  </a>
                  <a
                    href={localizedPath('/formats')}
                    className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                  >
                    Format Guides
                  </a>
                  <a
                    href={localizedPath('/compare')}
                    className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                  >
                    Comparisons
                  </a>
                  <a
                    href={localizedPath('/use-cases')}
                    className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                  >
                    Use Cases
                  </a>
                  <a
                    href={localizedPath('/scale')}
                    className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                  >
                    Scale & Upscale
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={toolsDropdownRef}>
            <button
              onClick={() => setIsToolsDropdownOpen(!isToolsDropdownOpen)}
              className="flex items-center gap-1.5 text-sm font-bold text-text-muted-aa hover:text-white transition-all group"
            >
              {t('tools')}
              <ChevronDown
                size={14}
                className={cn(
                  'text-text-muted-aa transition-transform group-hover:text-white',
                  isToolsDropdownOpen && 'rotate-180'
                )}
              />
            </button>
            {isToolsDropdownOpen && (
              <div className="absolute top-full left-0 mt-4 w-56 glass-dropdown rounded-2xl py-3 z-50 animate-in fade-in zoom-in-95 duration-200">
                <a
                  href={localizedPath('/tools/compress/image-compressor')}
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('imageCompressor')}
                </a>
                <a
                  href={localizedPath('/tools/compress/bulk-image-compressor')}
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('bulkCompressor')}
                </a>
                <a
                  href={localizedPath('/tools/convert/png-to-jpg')}
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('formatConverter')}
                </a>
                <a
                  href={localizedPath('/tools/resize/image-resizer')}
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('imageResizer')}
                </a>
                <a
                  href={localizedPath('/tools/resize/bulk-image-resizer')}
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('bulkResizer')}
                </a>
                <a
                  href={localizedPath('/tools/ai-background-remover')}
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('backgroundRemover')}
                </a>
              </div>
            )}
          </div>

          <a
            href={localizedPath('/pricing')}
            className="text-sm font-bold text-text-muted-aa hover:text-white transition-colors"
          >
            {t('pricing')}
          </a>

          <a
            href={localizedPath('/help')}
            className="text-sm font-bold text-text-muted-aa hover:text-white transition-colors"
          >
            {t('support')}
          </a>
        </nav>

        <div className="flex items-center gap-2 lg:gap-3 xl:gap-4">
          <LocaleSwitcher />
          {isLoading ? (
            <div className="hidden md:flex items-center gap-3">
              <div className="h-10 w-24 bg-white/5 rounded-full animate-pulse"></div>
              <div className="h-10 w-20 bg-white/5 rounded-xl animate-pulse"></div>
            </div>
          ) : !isAuthenticated ? (
            <>
              <div className="hidden xl:flex items-center gap-1.5 glass-strong px-2.5 py-1.5 rounded-full border-border">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                <span className="text-[10px] font-black text-white/80 uppercase tracking-tighter whitespace-nowrap">
                  {t('freeCredits')}
                </span>
              </div>
              <button
                onClick={handleAuthClick}
                className="hidden xl:inline-flex items-center justify-center rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-text-muted-aa hover:text-white hover:bg-white/5 h-10 px-3 py-2"
              >
                {t('signIn')}
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="inline-flex items-center justify-center rounded-xl text-sm font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 gradient-cta shine-effect text-white shadow-lg shadow-accent/20 h-10 px-3 sm:px-5 py-2"
              >
                <span className="hidden sm:inline">{t('getStartedFree')}</span>
                <span className="sm:hidden">{t('getStarted')}</span>
              </button>
            </>
          ) : (
            <>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="max-w-[180px] truncate">{user?.email}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-4 h-4 text-muted-foreground"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </button>
                {isDropdownOpen && (
                  <ul className="p-2 shadow-2xl glass-dropdown rounded-2xl w-56 absolute top-full right-0 mt-4 z-50 animate-in fade-in zoom-in-95 duration-200">
                    <li>
                      <div className="px-2 py-2 pointer-events-none">
                        <CreditsDisplay />
                      </div>
                    </li>
                    <li>
                      <a
                        href={localizedPath('/dashboard')}
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('dashboard')}
                      </a>
                    </li>
                    <li>
                      <a
                        href={localizedPath('/dashboard/billing')}
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('billing')}
                      </a>
                    </li>
                    <li>
                      <a
                        href={localizedPath('/dashboard/settings')}
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('settings')}
                      </a>
                    </li>
                    <li>
                      <a
                        href={localizedPath('/dashboard/history')}
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('history')}
                      </a>
                    </li>
                    <li>
                      <a
                        href={localizedPath('/help')}
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('support')}
                      </a>
                    </li>
                    <li>
                      <a
                        href={localizedPath('/pricing')}
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('viewPlans')}
                      </a>
                    </li>
                    {isPasswordUser && (
                      <li>
                        <button
                          onClick={handleChangePassword}
                          className="block w-full text-left px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                        >
                          {t('changePassword')}
                        </button>
                      </li>
                    )}
                    <li>
                      <button
                        onClick={signOut}
                        className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-lg transition-colors cursor-pointer"
                      >
                        {t('signOut')}
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            </>
          )}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 text-muted-foreground hover:text-white transition-colors"
            aria-label={t('toggleMenu')}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-border bg-surface">
          <nav className="flex flex-col px-4 py-4 space-y-2">
            {isAuthenticated && (
              <a
                href={localizedPath('/dashboard')}
                className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('dashboard')}
              </a>
            )}
            <a
              href={localizedPath('/features')}
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              {t('features')}
            </a>
            <div className="py-2">
              <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t('resources')}
              </p>
              <a
                href={localizedPath('/how-it-works')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('howItWorks')}
              </a>
              <a
                href={localizedPath('/blog')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('blog')}
              </a>
              <a
                href={localizedPath('/guides')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                Guides
              </a>
              <a
                href={localizedPath('/formats')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                Format Guides
              </a>
              <a
                href={localizedPath('/compare')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                Comparisons
              </a>
              <a
                href={localizedPath('/use-cases')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                Use Cases
              </a>
              <a
                href={localizedPath('/scale')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                Scale & Upscale
              </a>
            </div>
            <a
              href={localizedPath('/pricing')}
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              {t('pricing')}
            </a>
            <div className="py-2">
              <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t('tools')}
              </p>
              <a
                href={localizedPath('/tools/compress/image-compressor')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('imageCompressor')}
              </a>
              <a
                href={localizedPath('/tools/compress/bulk-image-compressor')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('bulkCompressor')}
              </a>
              <a
                href={localizedPath('/tools/convert/png-to-jpg')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('formatConverter')}
              </a>
              <a
                href={localizedPath('/tools/resize/image-resizer')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('imageResizer')}
              </a>
              <a
                href={localizedPath('/tools/resize/bulk-image-resizer')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('bulkResizer')}
              </a>
              <a
                href={localizedPath('/tools/ai-background-remover')}
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('backgroundRemover')}
              </a>
            </div>
            <a
              href={localizedPath('/help')}
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              {t('support')}
            </a>
            {!isAuthenticated && (
              <>
                <div className="border-t border-border my-2 pt-2">
                  <button
                    onClick={handleAuthClick}
                    className="block w-full text-left px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
                  >
                    {t('signIn')}
                  </button>
                  <button
                    onClick={() => openAuthModal('register')}
                    className="block w-full mt-2 px-4 py-2 text-sm font-semibold bg-accent hover:bg-accent-hover text-white rounded-lg transition-all glow-blue"
                  >
                    {t('getStartedFree')}
                  </button>
                </div>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};
