import { AuthProvider } from '@/shared/types/authProviders.types';
import { CreditsDisplay } from '@client/components/stripe/CreditsDisplay';
import { useClickOutside } from '@client/hooks/useClickOutside';
import { useModalStore } from '@client/store/modalStore';
import { useUserStore } from '@client/store/userStore';
import { clientEnv } from '@shared/config/env';
import { ChevronDown, Menu, X, Zap } from 'lucide-react';
import { useRef, useState } from 'react';

export const NavBar = (): JSX.Element => {
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
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-main/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href="/"
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <Zap size={20} fill="currentColor" />
          </div>
          <span className="hidden xs:inline text-xl font-bold tracking-tight text-white">
            {clientEnv.APP_NAME}
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {isAuthenticated && (
            <a
              href="/dashboard"
              className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
            >
              Dashboard
            </a>
          )}
          <div className="relative" ref={toolsDropdownRef}>
            <button
              onClick={() => setIsToolsDropdownOpen(!isToolsDropdownOpen)}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-white transition-colors"
            >
              Tools
              <ChevronDown size={16} className="text-muted-foreground" />
            </button>
            {isToolsDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-56 glass rounded-xl shadow-lg py-2 z-10">
                <a
                  href="/tools/compress/image-compressor"
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  Image Compressor
                </a>
                <a
                  href="/tools/convert/png-to-jpg"
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  Format Converter
                </a>
                <a
                  href="/tools/resize/image-resizer"
                  className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white transition-colors"
                >
                  Image Resizer
                </a>
              </div>
            )}
          </div>
          <a
            href="/features"
            className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
          >
            Features
          </a>
          <a
            href="/how-it-works"
            className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
          >
            How it Works
          </a>
          <a
            href="/pricing"
            className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
          >
            Pricing
          </a>
          <a
            href="/blog"
            className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
          >
            Blog
          </a>
        </nav>

        <div className="flex items-center gap-4">
          {isLoading ? (
            <div className="hidden md:flex items-center gap-3">
              <div className="h-8 w-24 bg-surface rounded-full animate-pulse"></div>
              <div className="h-9 w-20 bg-surface rounded-lg animate-pulse"></div>
            </div>
          ) : !isAuthenticated ? (
            <>
              <div className="hidden sm:flex items-center gap-2 glass px-3 py-1 rounded-full">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                <span className="text-xs font-medium text-muted-foreground">10 Free Credits</span>
              </div>
              <button
                onClick={handleAuthClick}
                className="hidden sm:inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground hover:text-white hover:bg-surface/10 h-9 px-4 py-2"
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-accent hover:bg-accent-hover text-white shadow-lg glow-blue hover:glow-blue-lg h-9 px-3 sm:px-5 py-2"
              >
                <span className="hidden sm:inline">Get Started Free</span>
                <span className="sm:hidden">Get Started</span>
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
                  <ul className="p-2 shadow-lg glass rounded-xl w-52 absolute top-full right-0 mt-2 z-10">
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
                        Dashboard
                      </a>
                    </li>
                    <li>
                      <a
                        href="/dashboard/billing"
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        Billing
                      </a>
                    </li>
                    <li>
                      <a
                        href="/dashboard/settings"
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        Settings
                      </a>
                    </li>
                    <li>
                      <a
                        href="/dashboard/history"
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        History
                      </a>
                    </li>
                    <li>
                      <a
                        href="/help"
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        Help
                      </a>
                    </li>
                    <li>
                      <a
                        href="/pricing"
                        className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        View Plans
                      </a>
                    </li>
                    {isPasswordUser && (
                      <li>
                        <button
                          onClick={handleChangePassword}
                          className="block w-full text-left px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors cursor-pointer"
                        >
                          Change Password
                        </button>
                      </li>
                    )}
                    <li>
                      <button
                        onClick={signOut}
                        className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-lg transition-colors cursor-pointer"
                      >
                        Sign Out
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
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-surface">
          <nav className="flex flex-col px-4 py-4 space-y-2">
            {isAuthenticated && (
              <a
                href="/dashboard"
                className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                Dashboard
              </a>
            )}
            <div className="py-2">
              <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Tools
              </p>
              <a
                href="/tools/compress/image-compressor"
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                Image Compressor
              </a>
              <a
                href="/tools/convert/png-to-jpg"
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                Format Converter
              </a>
              <a
                href="/tools/resize/image-resizer"
                className="block px-4 py-2 text-sm text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
              >
                Image Resizer
              </a>
            </div>
            <a
              href="/features"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              Features
            </a>
            <a
              href="/how-it-works"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              How it Works
            </a>
            <a
              href="/pricing"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              Pricing
            </a>
            <a
              href="/blog"
              className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
            >
              Blog
            </a>
            {!isAuthenticated && (
              <>
                <div className="border-t border-white/10 my-2 pt-2">
                  <button
                    onClick={handleAuthClick}
                    className="block w-full text-left px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface/10 hover:text-white rounded-lg transition-colors"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => openAuthModal('register')}
                    className="block w-full mt-2 px-4 py-2 text-sm font-semibold bg-accent hover:bg-accent-hover text-white rounded-lg transition-all glow-blue"
                  >
                    Get Started Free
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
