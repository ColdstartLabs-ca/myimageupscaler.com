import 'reflect-metadata';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock dayjs and its plugins
const createMockDayjs = (utcMode = false, inputDate?: Date | string) => {
  let baseDate: Date;

  if (inputDate instanceof Date) {
    baseDate = new Date(inputDate);
  } else if (typeof inputDate === 'string') {
    baseDate = new Date(inputDate);
  } else {
    baseDate = new Date('2024-01-15T00:00:00.000Z');
  }

  const mockDayjs = {
    format: vi.fn((formatStr?: string) => {
      if (formatStr === 'YYYY-MM') {
        return baseDate.toISOString().slice(0, 7); // YYYY-MM
      }
      if (formatStr === 'YYYY-MM-DD') {
        return baseDate.toISOString().slice(0, 10); // YYYY-MM-DD
      }
      return utcMode ? '2024-01-15T00:00:00Z' : '2024-01-15';
    }),
    toISOString: vi.fn(() => baseDate.toISOString()),
    toDate: vi.fn(() => new Date(baseDate)),
    utc: vi.fn(() => createMockDayjs(true, baseDate)),
    add: vi.fn((amount: number, unit: string) => {
      const newDate = new Date(baseDate);
      if (unit === 'day') newDate.setDate(newDate.getDate() + amount);
      if (unit === 'month') newDate.setMonth(newDate.getMonth() + amount);
      return createMockDayjs(utcMode, newDate);
    }),
    subtract: vi.fn((amount: number, unit: string) => {
      const newDate = new Date(baseDate);
      if (unit === 'day') newDate.setDate(newDate.getDate() - amount);
      if (unit === 'month') newDate.setMonth(newDate.getMonth() - amount);
      return createMockDayjs(utcMode, newDate);
    }),
    diff: vi.fn(() => 1),
    isBefore: vi.fn(() => false),
    isAfter: vi.fn(() => true),
    isSame: vi.fn(() => false),
    startOf: vi.fn(() => createMockDayjs(utcMode, baseDate)),
    endOf: vi.fn(() => createMockDayjs(utcMode, baseDate)),
    extend: vi.fn(), // Add extend to instance as well
  };
  return mockDayjs;
};

// Define the mock inline to avoid hoisting issues
vi.mock('dayjs', () => {
  const mockDayjsFn = vi.fn((...args: unknown[]) =>
    createMockDayjs(false, args[0] as Date | string | undefined)
  );
  // Add extend and utc as static methods
  mockDayjsFn.extend = vi.fn();
  mockDayjsFn.utc = vi.fn((...args: unknown[]) =>
    createMockDayjs(true, args[0] as Date | string | undefined)
  );
  return {
    default: mockDayjsFn,
  };
});

vi.mock('dayjs/plugin/utc', () => ({
  default: 'utc-plugin', // Return a string placeholder that can be passed to extend
}));

// Mock React cache function - needed for data-loader tests
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof React>('react');
  return {
    ...actual,
    cache: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

// Mock Next.js router
vi.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: '',
      asPath: '',
      push: vi.fn(),
      pop: vi.fn(),
      reload: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
      beforePopState: vi.fn(),
      events: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
      },
    };
  },
}));

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    };
  },
  usePathname() {
    return '/';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

// Mock Next.js image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    return React.createElement('img', props);
  },
}));

// Mock Supabase environment variables - these are allowed in test setup
// eslint-disable-next-line no-restricted-syntax
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test-supabase-url';
// eslint-disable-next-line no-restricted-syntax
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Mock server environment variables - needed for server-side tests
// eslint-disable-next-line no-restricted-syntax
process.env.ENV = 'test';
// eslint-disable-next-line no-restricted-syntax
process.env.BASE_URL = 'http://localhost:3000';
// eslint-disable-next-line no-restricted-syntax
process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';
// eslint-disable-next-line no-restricted-syntax
process.env.EMAIL_FROM_ADDRESS = 'noreply@test.com';
// eslint-disable-next-line no-restricted-syntax
process.env.SUPPORT_EMAIL = 'support@test.com';
// eslint-disable-next-line no-restricted-syntax
process.env.APP_NAME = 'TestApp';
// Email provider API keys
// eslint-disable-next-line no-restricted-syntax
process.env.RESEND_API_KEY = 'test-resend-key';
// eslint-disable-next-line no-restricted-syntax
process.env.SENDPULSE_API_USER_ID = 'test-user-id';
// eslint-disable-next-line no-restricted-syntax
process.env.SENDPULSE_API_SECRET = 'test-secret';
// eslint-disable-next-line no-restricted-syntax
process.env.BREVO_API_KEY = 'test-brevo-key';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  })),
}));

// Mock loadingStore - this must come before authStore import
vi.mock('@/store/loadingStore', () => ({
  loadingStore: {
    getState: vi.fn(() => ({
      setLoading: vi.fn(),
      isLoading: false,
    })),
    setState: vi.fn(),
    subscribe: vi.fn(),
    destroy: vi.fn(),
  },
}));

// Mock lucide-react with all common icons
vi.mock('lucide-react', async () => {
  const createMockIcon = (name: string) => {
    return function MockIcon(props: Record<string, unknown>) {
      return React.createElement('div', {
        'data-testid': name
          .toLowerCase()
          .replace(/([A-Z])/g, '-$1')
          .replace(/^-/, ''),
        ...props,
      });
    };
  };

  return {
    AlertCircle: createMockIcon('AlertCircle'),
    AlertTriangle: createMockIcon('AlertTriangle'),
    ArrowLeft: createMockIcon('ArrowLeft'),
    ArrowRight: createMockIcon('ArrowRight'),
    Check: createMockIcon('Check'),
    CheckCircle: createMockIcon('CheckCircle'),
    CheckCircle2: createMockIcon('CheckCircle2'),
    ChevronDown: createMockIcon('ChevronDown'),
    ChevronLeft: createMockIcon('ChevronLeft'),
    ChevronRight: createMockIcon('ChevronRight'),
    ChevronUp: createMockIcon('ChevronUp'),
    Circle: createMockIcon('Circle'),
    Clock: createMockIcon('Clock'),
    Copy: createMockIcon('Copy'),
    Download: createMockIcon('Download'),
    Edit: createMockIcon('Edit'),
    Eye: createMockIcon('Eye'),
    EyeOff: createMockIcon('EyeOff'),
    File: createMockIcon('File'),
    FileUp: createMockIcon('FileUp'),
    Filter: createMockIcon('Filter'),
    Folder: createMockIcon('Folder'),
    Heart: createMockIcon('Heart'),
    Home: createMockIcon('Home'),
    Image: createMockIcon('Image'),
    Info: createMockIcon('Info'),
    Layers: createMockIcon('Layers'),
    Loader: createMockIcon('Loader'),
    Loader2: createMockIcon('Loader2'),
    LogIn: createMockIcon('LogIn'),
    LogOut: createMockIcon('LogOut'),
    Mail: createMockIcon('Mail'),
    Menu: createMockIcon('Menu'),
    Minus: createMockIcon('Minus'),
    Moon: createMockIcon('Moon'),
    MoreHorizontal: createMockIcon('MoreHorizontal'),
    MoreVertical: createMockIcon('MoreVertical'),
    Plus: createMockIcon('Plus'),
    RefreshCw: createMockIcon('RefreshCw'),
    RotateCcw: createMockIcon('RotateCcw'),
    Save: createMockIcon('Save'),
    Search: createMockIcon('Search'),
    Settings: createMockIcon('Settings'),
    Share: createMockIcon('Share'),
    Sliders: createMockIcon('Sliders'),
    Sparkles: createMockIcon('Sparkles'),
    Star: createMockIcon('Star'),
    Sun: createMockIcon('Sun'),
    Trash: createMockIcon('Trash'),
    Trash2: createMockIcon('Trash2'),
    Upload: createMockIcon('Upload'),
    UploadCloud: createMockIcon('UploadCloud'),
    User: createMockIcon('User'),
    X: createMockIcon('X'),
    XCircle: createMockIcon('XCircle'),
    Zap: createMockIcon('Zap'),
    ZoomIn: createMockIcon('ZoomIn'),
    ZoomOut: createMockIcon('ZoomOut'),
  };
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock fetch
globalThis.fetch = vi.fn();

// Mock URL methods
globalThis.URL.createObjectURL = vi.fn(() => 'mock-object-url');
globalThis.URL.revokeObjectURL = vi.fn();

// Mock HTMLElement methods
HTMLElement.prototype.scrollIntoView = vi.fn();

// Clear all mocks before each test to prevent cross-test contamination
import { beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
