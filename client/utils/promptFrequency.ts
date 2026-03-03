interface IPromptFrequencyConfig {
  key: string;
  cooldownMs: number;
  maxPerWeek?: number;
}

interface IPromptStats {
  lastShown: number | null;
  weeklyCount: number;
}

/**
 * Returns true if the prompt is allowed to be shown based on cooldown and optional weekly cap.
 * Reads from localStorage using keys derived from config.key.
 */
export function canShowPrompt(config: IPromptFrequencyConfig): boolean {
  if (typeof window === 'undefined') return false;

  const lastShownRaw = localStorage.getItem(`${config.key}_last_shown`);
  if (lastShownRaw !== null) {
    const lastShown = parseInt(lastShownRaw, 10);
    if (Date.now() - lastShown < config.cooldownMs) {
      return false;
    }
  }

  if (config.maxPerWeek !== undefined) {
    const weekStartRaw = localStorage.getItem(`${config.key}_week_start`);
    const weekCountRaw = localStorage.getItem(`${config.key}_week_count`);
    const now = Date.now();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;

    if (weekStartRaw !== null) {
      const weekStart = parseInt(weekStartRaw, 10);
      if (now - weekStart < msPerWeek) {
        const weekCount = weekCountRaw !== null ? parseInt(weekCountRaw, 10) : 0;
        if (weekCount >= config.maxPerWeek) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Records that the prompt was shown by updating localStorage timestamps and counts.
 */
export function markPromptShown(config: IPromptFrequencyConfig): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  localStorage.setItem(`${config.key}_last_shown`, String(now));

  if (config.maxPerWeek !== undefined) {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weekStartRaw = localStorage.getItem(`${config.key}_week_start`);
    const weekCountRaw = localStorage.getItem(`${config.key}_week_count`);

    let weekStart = weekStartRaw !== null ? parseInt(weekStartRaw, 10) : null;
    let weekCount = weekCountRaw !== null ? parseInt(weekCountRaw, 10) : 0;

    const isNewWeek = weekStart === null || now - weekStart >= msPerWeek;
    if (isNewWeek) {
      weekStart = now;
      weekCount = 0;
    }

    weekCount += 1;
    localStorage.setItem(`${config.key}_week_start`, String(weekStart));
    localStorage.setItem(`${config.key}_week_count`, String(weekCount));
  }
}

/**
 * Returns stats about a prompt's display history from localStorage.
 */
export function getPromptStats(key: string): IPromptStats {
  if (typeof window === 'undefined') {
    return { lastShown: null, weeklyCount: 0 };
  }

  const lastShownRaw = localStorage.getItem(`${key}_last_shown`);
  const weekCountRaw = localStorage.getItem(`${key}_week_count`);

  return {
    lastShown: lastShownRaw !== null ? parseInt(lastShownRaw, 10) : null,
    weeklyCount: weekCountRaw !== null ? parseInt(weekCountRaw, 10) : 0,
  };
}
