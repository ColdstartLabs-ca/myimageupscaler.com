/**
 * Chrome Storage API wrapper for extension state management
 */

import type { IStorageState, IExtensionSession, IExtensionSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'miu_extension_state';

/**
 * Initialize storage with default values if not present
 */
export async function initStorage(): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  if (!data[STORAGE_KEY]) {
    const initialState: IStorageState = {
      session: {
        userId: null,
        accessToken: null,
        creditsRemaining: 0,
        expiresAt: null,
      },
      settings: DEFAULT_SETTINGS,
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: initialState });
  }
}

/**
 * Get the full storage state
 */
export async function getStorage(): Promise<IStorageState> {
  await initStorage();
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] as IStorageState;
}

/**
 * Get the current session
 */
export async function getSession(): Promise<IExtensionSession> {
  const storage = await getStorage();
  return storage.session;
}

/**
 * Update the session
 */
export async function updateSession(updates: Partial<IExtensionSession>): Promise<void> {
  const storage = await getStorage();
  storage.session = { ...storage.session, ...updates };
  await chrome.storage.local.set({ [STORAGE_KEY]: storage });
}

/**
 * Get extension settings
 */
export async function getSettings(): Promise<IExtensionSettings> {
  const storage = await getStorage();
  return storage.settings;
}

/**
 * Update extension settings
 */
export async function updateSettings(updates: Partial<IExtensionSettings>): Promise<void> {
  const storage = await getStorage();
  storage.settings = { ...storage.settings, ...updates };
  await chrome.storage.local.set({ [STORAGE_KEY]: storage });
}

/**
 * Clear session (logout)
 */
export async function clearSession(): Promise<void> {
  const storage = await getStorage();
  storage.session = {
    userId: null,
    accessToken: null,
    creditsRemaining: 0,
    expiresAt: null,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: storage });
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  const now = Date.now();
  return !!(session.accessToken && session.expiresAt && session.expiresAt > now);
}
