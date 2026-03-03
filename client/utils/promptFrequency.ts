/**
 * Cross-session frequency capping for upgrade prompts.
 * Uses localStorage to prevent prompt fatigue across browser sessions.
 */

export interface IPromptFrequencyConfig {
  key: string; // localStorage key
  cooldownMs: number; // Minimum time between shows
  maxPerWeek?: number; // Optional weekly cap
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface IPromptStats {
  lastShown: number | null;
  weeklyCount: number;
  weekStart: number;
}

function getStats(key: string): IPromptStats {
  if (typeof window === 'undefined') {
    return { lastShown: null, weeklyCount: 0, weekStart: Date.now() };
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { lastShown: null, weeklyCount: 0, weekStart: Date.now() };
    return JSON.parse(raw) as IPromptStats;
  } catch {
    return { lastShown: null, weeklyCount: 0, weekStart: Date.now() };
  }
}

export function canShowPrompt(config: IPromptFrequencyConfig): boolean {
  if (typeof window === 'undefined') return false;

  const stats = getStats(config.key);
  const now = Date.now();

  // Check cooldown
  if (stats.lastShown !== null && now - stats.lastShown < config.cooldownMs) {
    return false;
  }

  // Check weekly cap
  if (config.maxPerWeek !== undefined) {
    const weekStart = now - WEEK_MS;
    const currentWeekCount = stats.weekStart > weekStart ? stats.weeklyCount : 0;
    if (currentWeekCount >= config.maxPerWeek) {
      return false;
    }
  }

  return true;
}

export function markPromptShown(config: IPromptFrequencyConfig): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const stats = getStats(config.key);
  const weekStart = now - WEEK_MS;
  const currentWeekCount = stats.weekStart > weekStart ? stats.weeklyCount : 0;

  const updated: IPromptStats = {
    lastShown: now,
    weeklyCount: currentWeekCount + 1,
    weekStart: stats.weekStart > weekStart ? stats.weekStart : now,
  };

  try {
    localStorage.setItem(config.key, JSON.stringify(updated));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded)
  }
}

export function getPromptStats(key: string): { lastShown: number | null; weeklyCount: number } {
  const stats = getStats(key);
  return { lastShown: stats.lastShown, weeklyCount: stats.weeklyCount };
}
