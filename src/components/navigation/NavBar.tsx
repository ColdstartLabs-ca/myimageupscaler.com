import { loadEnv } from '@config/env';
import { Menu, Zap } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useModalStore } from '../../store/modalStore';
import { AuthProvider } from '../../types/authProviders';
import { CreditsDisplay } from '../stripe/CreditsDisplay';

export const NavBar = (): JSX.Element => {
  const { open } = useModalStore();
  const { isAuthenticated, user, signOut } = useAuthStore();

  const handleAuthClick = () => {
    if (!isAuthenticated) {
      open('authenticationModal');
    }
  };

  const handleChangePassword = () => {
    open('authenticationModal');
  };

  // Check if user is authenticated through email/password
  const isPasswordUser = user?.provider === AuthProvider.EMAIL;
  const { APP_NAME } = loadEnv();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          href="/"
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Zap size={20} fill="currentColor" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">{APP_NAME}</span>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {isAuthenticated && (
            <a href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Dashboard
            </a>
          )}
          <a href="#features" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            How it Works
          </a>
          <a href="#pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Pricing
          </a>
        </nav>

        <div className="flex items-center gap-4">
          {!isAuthenticated ? (
            <>
              <div className="hidden md:flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                <span className="text-xs font-medium text-slate-700">10 Free Credits</span>
              </div>
              <button
                onClick={handleAuthClick}
                className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-indigo-600 text-white hover:bg-indigo-700 h-9 px-4 py-2"
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              <div className="hidden md:flex items-center">
                <CreditsDisplay />
              </div>
              <div className="dropdown dropdown-end">
                <label
                  tabIndex={0}
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
                </label>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu p-2 shadow bg-white rounded-box w-52 border border-slate-200"
                >
                  <li className="md:hidden">
                    <div className="pointer-events-none">
                      <CreditsDisplay />
                    </div>
                  </li>
                  <li>
                    <a href="/dashboard" className="text-sm text-slate-600 hover:bg-slate-50">
                      Dashboard
                    </a>
                  </li>
                  <li>
                    <a href="/pricing" className="text-sm text-slate-600 hover:bg-slate-50">
                      Buy Credits
                    </a>
                  </li>
                  {isPasswordUser && (
                    <li>
                      <button
                        onClick={handleChangePassword}
                        className="text-sm text-slate-600 hover:bg-slate-50"
                      >
                        Change Password
                      </button>
                    </li>
                  )}
                  <li>
                    <button onClick={signOut} className="text-sm text-red-600 hover:bg-red-50">
                      Sign Out
                    </button>
                  </li>
                </ul>
              </div>
            </>
          )}
          <button className="md:hidden p-2 text-slate-600">
            <Menu size={24} />
          </button>
        </div>
      </div>
    </header>
  );
};
