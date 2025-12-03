import type { IAuthUser } from './types';

const AUTH_CACHE_KEY = 'pixelperfect_auth_cache';
const CACHE_VERSION = 1;

interface IAuthCache {
  version: number;
  user: IAuthUser | null;
  timestamp: number;
}

/**
 * Maximum age of cached auth state (5 minutes)
 */
const MAX_CACHE_AGE = 5 * 60 * 1000;

/**
 * Safely reads from localStorage (handles SSR and errors)
 */
function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Safely writes to localStorage (handles SSR and errors)
 */
function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Silently fail if localStorage is not available
  }
}

/**
 * Safely removes from localStorage (handles SSR and errors)
 */
function safeLocalStorageRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Silently fail if localStorage is not available
  }
}

/**
 * Saves auth state to localStorage cache
 */
export function saveAuthCache(user: IAuthUser | null): void {
  const cache: IAuthCache = {
    version: CACHE_VERSION,
    user,
    timestamp: Date.now(),
  };
  safeLocalStorageSet(AUTH_CACHE_KEY, JSON.stringify(cache));
}

/**
 * Loads auth state from localStorage cache
 * Returns null if cache is invalid, expired, or doesn't exist
 */
export function loadAuthCache(): IAuthUser | null {
  const cached = safeLocalStorageGet(AUTH_CACHE_KEY);
  if (!cached) return null;

  try {
    const cache: IAuthCache = JSON.parse(cached);

    // Validate cache version
    if (cache.version !== CACHE_VERSION) {
      clearAuthCache();
      return null;
    }

    // Check if cache is expired
    const age = Date.now() - cache.timestamp;
    if (age > MAX_CACHE_AGE) {
      clearAuthCache();
      return null;
    }

    return cache.user;
  } catch {
    clearAuthCache();
    return null;
  }
}

/**
 * Clears auth cache from localStorage
 */
export function clearAuthCache(): void {
  safeLocalStorageRemove(AUTH_CACHE_KEY);
}
