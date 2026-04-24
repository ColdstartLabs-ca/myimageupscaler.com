/**
 * Extension Storage Tests
 *
 * Tests the storage wrapper around chrome.storage.local
 * to verify session and settings persistence logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome.storage.local before importing the module
const storageData: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: storageData[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(storageData, items);
      }),
    },
  },
};

vi.stubGlobal('chrome', chromeMock);

// Import after mocking
const { getStorage, getSession, updateSession, getSettings, updateSettings, clearSession } =
  await import('@extension/shared/storage');

const STORAGE_KEY = 'miu_extension_state';

const defaultState = {
  session: {
    userId: null,
    accessToken: null,
    creditsRemaining: 0,
    expiresAt: null,
  },
  settings: {
    defaultScale: 2,
    defaultTier: 'auto',
    showNotifications: true,
  },
};

describe('Extension Storage', () => {
  beforeEach(() => {
    // Reset storage and mock call counts
    Object.keys(storageData).forEach(key => delete storageData[key]);
    vi.clearAllMocks();
  });

  describe('getStorage', () => {
    it('initializes with default state when storage is empty', async () => {
      const storage = await getStorage();
      expect(storage).toMatchObject(defaultState);
    });

    it('returns existing state when storage has data', async () => {
      const existingState = {
        session: {
          userId: 'user-123',
          accessToken: 'token-abc',
          creditsRemaining: 50,
          expiresAt: Date.now() + 3600000,
        },
        settings: defaultState.settings,
      };
      storageData[STORAGE_KEY] = existingState;

      const storage = await getStorage();
      expect(storage).toMatchObject(existingState);
    });
  });

  describe('getSession', () => {
    it('returns the session from storage', async () => {
      storageData[STORAGE_KEY] = defaultState;
      const session = await getSession();
      expect(session).toMatchObject(defaultState.session);
    });
  });

  describe('updateSession', () => {
    it('updates session fields', async () => {
      storageData[STORAGE_KEY] = defaultState;
      await updateSession({ userId: 'user-456', creditsRemaining: 100 });
      const session = await getSession();
      expect(session.userId).toBe('user-456');
      expect(session.creditsRemaining).toBe(100);
    });

    it('preserves unmodified session fields', async () => {
      storageData[STORAGE_KEY] = {
        ...defaultState,
        session: { ...defaultState.session, accessToken: 'existing-token' },
      };
      await updateSession({ creditsRemaining: 25 });
      const session = await getSession();
      expect(session.accessToken).toBe('existing-token');
      expect(session.creditsRemaining).toBe(25);
    });
  });

  describe('getSettings', () => {
    it('returns settings from storage', async () => {
      storageData[STORAGE_KEY] = defaultState;
      const settings = await getSettings();
      expect(settings.defaultScale).toBe(2);
      expect(settings.defaultTier).toBe('auto');
    });
  });

  describe('updateSettings', () => {
    it('updates settings fields', async () => {
      storageData[STORAGE_KEY] = defaultState;
      await updateSettings({ defaultScale: 4, showNotifications: false });
      const settings = await getSettings();
      expect(settings.defaultScale).toBe(4);
      expect(settings.showNotifications).toBe(false);
      expect(settings.defaultTier).toBe('auto'); // preserved
    });
  });

  describe('clearSession', () => {
    it('resets session to default values', async () => {
      storageData[STORAGE_KEY] = {
        ...defaultState,
        session: {
          userId: 'user-789',
          accessToken: 'token-xyz',
          creditsRemaining: 200,
          expiresAt: Date.now() + 3600000,
        },
      };
      await clearSession();
      const session = await getSession();
      expect(session.userId).toBeNull();
      expect(session.accessToken).toBeNull();
      expect(session.creditsRemaining).toBe(0);
      expect(session.expiresAt).toBeNull();
    });

    it('preserves settings when clearing session', async () => {
      storageData[STORAGE_KEY] = {
        session: { ...defaultState.session, userId: 'user' },
        settings: { defaultScale: 8, defaultTier: 'ultra', showNotifications: false },
      };
      await clearSession();
      const settings = await getSettings();
      expect(settings.defaultScale).toBe(8);
      expect(settings.defaultTier).toBe('ultra');
    });
  });
});
