import { CreditsDisplay } from '@client/components/stripe/CreditsDisplay';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { loadEnv } from '@shared/config/env';
import { AuthProvider } from '@shared/types/authProviders';
import { Menu, Zap, X, ChevronDown } from 'lucide-react';
import { useState, useRef } from 'react';
import { useClickOutside } from '@client/hooks/useClickOutside';

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
  const { APP_NAME } = loadEnv();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href="/"
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Zap size={20} fill="currentColor" />
          </div>
          <span className="hidden xs:inline text-xl font-bold tracking-tight text-slate-900">
            {APP_NAME}
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {isAuthenticated && (
            <a
              href="/dashboard"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Dashboard
            </a>
          )}
          <div className="relative" ref={toolsDropdownRef}>
            <button
              onClick={() => setIsToolsDropdownOpen(!isToolsDropdownOpen)}
              className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Tools
              <ChevronDown size={16} className="text-slate-500" />
            </button>
            {isToolsDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-10">
                <a
                  href="/tools/compress/image-compressor"
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Image Compressor
                </a>
                <a
                  href="/tools/convert/png-to-jpg"
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Format Converter
                </a>
                <a
                  href="/tools/resize/image-resizer"
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Image Resizer
                </a>
              </div>
            )}
          </div>
          <a href="/features" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Features
          </a>
          <a
            href="/how-it-works"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            How it Works
          </a>
          <a href="/pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Pricing
          </a>
          <a href="/blog" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Blog
          </a>
        </nav>

        <div className="flex items-center gap-4">
          {isLoading ? (
            <div className="hidden md:flex items-center gap-3">
              <div className="h-8 w-24 bg-slate-200 rounded-full animate-pulse"></div>
              <div className="h-9 w-20 bg-slate-200 rounded-lg animate-pulse"></div>
            </div>
          ) : !isAuthenticated ? (
            <>
              <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                <span className="text-xs font-medium text-slate-700">10 Free Credits</span>
              </div>
              <button
                onClick={handleAuthClick}
                className="hidden sm:inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 h-9 px-4 py-2"
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-700 hover:via-violet-700 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 h-9 px-3 sm:px-5 py-2"
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
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <span className="max-w-[180px] truncate">{user?.email}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-4 h-4 text-slate-600"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </button>
                {isDropdownOpen && (
                  <ul className="p-2 shadow-lg bg-white rounded-xl w-52 border border-slate-200 absolute top-full right-0 mt-2 z-10">
                    <li className="md:hidden">
                      <div className="pointer-events-none">
                        <CreditsDisplay />
                      </div>
                    </li>
                    <li>
                      <a
                        href="/dashboard"
                        className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      >
                        Dashboard
                      </a>
                    </li>
                    <li>
                      <a
                        href="/dashboard/billing"
                        className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      >
                        Billing
                      </a>
                    </li>
                    <li>
                      <a
                        href="/dashboard/settings"
                        className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      >
                        Settings
                      </a>
                    </li>
                    <li>
                      <a
                        href="/dashboard/history"
                        className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      >
                        History
                      </a>
                    </li>
                    <li>
                      <a
                        href="/help"
                        className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      >
                        Help
                      </a>
                    </li>
                    <li>
                      <a
                        href="/pricing"
                        className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      >
                        View Plans
                      </a>
                    </li>
                    {isPasswordUser && (
                      <li>
                        <button
                          onClick={handleChangePassword}
                          className="block w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                        >
                          Change Password
                        </button>
                      </li>
                    )}
                    <li>
                      <button
                        onClick={signOut}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
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
            className="md:hidden p-2 text-slate-600"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white">
          <nav className="flex flex-col px-4 py-4 space-y-2">
            {isAuthenticated && (
              <a
                href="/dashboard"
                className="block px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Dashboard
              </a>
            )}
            <div className="py-2">
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Tools
              </p>
              <a
                href="/tools/compress/image-compressor"
                className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Image Compressor
              </a>
              <a
                href="/tools/convert/png-to-jpg"
                className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Format Converter
              </a>
              <a
                href="/tools/resize/image-resizer"
                className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Image Resizer
              </a>
            </div>
            <a
              href="/features"
              className="block px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Features
            </a>
            <a
              href="/how-it-works"
              className="block px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              How it Works
            </a>
            <a
              href="/pricing"
              className="block px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Pricing
            </a>
            <a
              href="/blog"
              className="block px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Blog
            </a>
            {!isAuthenticated && (
              <>
                <div className="border-t border-slate-200 my-2 pt-2">
                  <button
                    onClick={handleAuthClick}
                    className="block w-full text-left px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => openAuthModal('register')}
                    className="block w-full mt-2 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-700 hover:via-violet-700 hover:to-purple-700 text-white rounded-lg transition-all"
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
