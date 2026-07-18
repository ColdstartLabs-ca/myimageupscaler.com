const UPGRADE_PROMPT_DISMISSAL_KEY = 'miu_upgrade_prompt_dismiss_count';
const FREE_PLAN_CONFIRMATION_THRESHOLD = 3;

function getDismissalKey(userId?: string | null): string {
  return `${UPGRADE_PROMPT_DISMISSAL_KEY}:${userId || 'anonymous'}`;
}

export function getUpgradePromptDismissalCount(userId?: string | null): number {
  if (typeof localStorage === 'undefined') return 0;

  const value = Number.parseInt(localStorage.getItem(getDismissalKey(userId)) ?? '0', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function recordUpgradePromptDismissal(userId?: string | null): number {
  const nextCount = getUpgradePromptDismissalCount(userId) + 1;
  localStorage.setItem(getDismissalKey(userId), String(nextCount));
  return nextCount;
}

export function requiresFreePlanConfirmation(userId?: string | null): boolean {
  return getUpgradePromptDismissalCount(userId) >= FREE_PLAN_CONFIRMATION_THRESHOLD;
}
