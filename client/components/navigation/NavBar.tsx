import { AuthProvider } from '@/shared/types/authProviders.types';
import { CreditsDisplay } from '@client/components/stripe/CreditsDisplay';
import { useClickOutside } from '@client/hooks/useClickOutside';
import { useModalStore } from '@client/store/modalStore';
import { useUserStore } from '@client/store/userStore';
import { cn } from '@client/utils/cn';
import { clientEnv } from '@shared/config/env';
import { ChevronDown, Menu, X } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@client/components/i18n/LocaleSwitcher';

export const NavBar = (): JSX.Element => {
  const t = useTranslations('nav');
  const { openAuthModal } = useModalStore();
  const { isAuthenticated, isLoading, user, signOut } = useUserStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsDropdownOpen(false));
  useClickOutside(toolsDropdownRef, () => setIsToolsDropdownOpen(false));

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
          href="/"
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

        <nav className="hidden md:flex items-center gap-8">
          {isAuthenticated && (
            <a
              href="/dashboard"
              className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
            >
              {t('dashboard')}
            </a>
          )}
          <a
            href="/features"
            className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
          >
            {t('features')}
          </a>
          <a
            href="/how-it-works"
            className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
          >
            {t('howItWorks')}
          </a>
          <a
            href="/pricing"
            className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
          >
            {t('pricing')}
          </a>
          <a
            href="/blog"
            className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
          >
            {t('blog')}
          </a>
          <div className="relative" ref={toolsDropdownRef}>
            <button
              onClick={() => setIsToolsDropdownOpen(!isToolsDropdownOpen)}
              className="flex items-center gap-1.5 text-sm font-bold text-text-muted hover:text-white transition-all group"
            >
              {t('tools')}
              <ChevronDown
                size={14}
                className={cn(
                  'text-text-muted transition-transform group-hover:text-white',
                  isToolsDropdownOpen && 'rotate-180'
                )}
              />
            </button>
            {isToolsDropdownOpen && (
              <div className="absolute top-full left-0 mt-4 w-56 glass-dropdown rounded-2xl py-3 z-50 animate-in fade-in zoom-in-95 duration-200">
                <a
                  href="/tools/compress/image-compressor"
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('imageCompressor')}
                </a>
                <a
                  href="/tools/compress/bulk-image-compressor"
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('bulkCompressor')}
                </a>
                <a
                  href="/tools/convert/png-to-jpg"
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('formatConverter')}
                </a>
                <a
                  href="/tools/resize/image-resizer"
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('imageResizer')}
                </a>
                <a
                  href="/tools/resize/bulk-image-resizer"
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('bulkResizer')}
                </a>
                <a
                  href="/tools/ai-background-remover"
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  {t('backgroundRemover')}
                </a>
              </div>
            )}
          </div>
          <a
            href="/help"
            className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
          >
            {t('support')}
          </a>
        </nav>

        <div className="flex items-center gap-4">
          <LocaleSwitcher />
          {isLoading ? (
            <div className="hidden md:flex items-center gap-3">
              <div className="h-10 w-24 bg-white/5 rounded-full animate-pulse"></div>
              <div className="h-10 w-20 bg-white/5 rounded-xl animate-pulse"></div>
            </div>
          ) : !isAuthenticated ? (
            <>
              <div className="hidden sm:flex items-center gap-2 glass-strong px-4 py-2 rounded-full border-border">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-black text-white/80 uppercase tracking-tighter">
                  {t('freeCredits')}
                </span>
              </div>
              <button
                onClick={handleAuthClick}
                className="hidden sm:inline-flex items-center justify-center rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-text-muted hover:text-white hover:bg-white/5 h-10 px-5 py-2"
              >
                {t('signIn')}
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="inline-flex items-center justify-center rounded-xl text-sm font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 gradient-cta shine-effect text-white shadow-lg shadow-accent/20 h-10 px-3 sm:px-6 py-2"
              >
                <span className="hidden sm:inline">{t('getStartedFree')}</span>
                <span className="sm:hidden">{t('getStarted')}</span>
              </button>
            </>
          ) : (
            <>
              <div className="hidden md:flex items-center">
                <CreditsDisplay />
              </div>
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
                    <li className="md:hidden">
                      <div className="pointer-events-none">
                        <CreditsDisplay />
                      </div>
                    </li>
                    <li>
                      <a
                        href="/dashboard"
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('dashboard')}
                      </a>
                    </li>
                    <li>
                      <a
                        href="/dashboard/billing"
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('billing')}
                      </a>
                    </li>
                    <li>
                      <a
                        href="/dashboard/settings"
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('settings')}
                      </a>
                    </li>
                    <li>
                      <a
                        href="/dashboard/history"
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('history')}
                      </a>
                    </li>
                    <li>
                      <a
                        href="/help"
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        {t('support')}
                      </a>
                    </li>
                    <li>
                      <a
                        href="/pricing"
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
            className="md:hidden p-2 text-muted-foreground hover:text-white transition-colors"
            aria-label={t('toggleMenu')}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-surface">
          <nav className="flex flex-col px-4 py-4 space-y-2">
            {isAuthenticated && (
              <a
                href="/dashboard"
                className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('dashboard')}
              </a>
            )}
            <a
              href="/features"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              {t('features')}
            </a>
            <a
              href="/how-it-works"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              {t('howItWorks')}
            </a>
            <a
              href="/pricing"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              {t('pricing')}
            </a>
            <a
              href="/blog"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              {t('blog')}
            </a>
            <div className="py-2">
              <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t('tools')}
              </p>
              <a
                href="/tools/compress/image-compressor"
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('imageCompressor')}
              </a>
              <a
                href="/tools/compress/bulk-image-compressor"
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('bulkCompressor')}
              </a>
              <a
                href="/tools/convert/png-to-jpg"
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('formatConverter')}
              </a>
              <a
                href="/tools/resize/image-resizer"
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('imageResizer')}
              </a>
              <a
                href="/tools/resize/bulk-image-resizer"
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('bulkResizer')}
              </a>
              <a
                href="/tools/ai-background-remover"
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                {t('backgroundRemover')}
              </a>
            </div>
            <a
              href="/help"
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
