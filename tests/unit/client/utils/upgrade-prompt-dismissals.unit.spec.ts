import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUpgradePromptDismissalCount,
  recordUpgradePromptDismissal,
  requiresFreePlanConfirmation,
} from '@client/utils/upgrade-prompt-dismissals';

describe('upgrade prompt dismissal friction', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('does not add friction until three prior dismissals', () => {
    recordUpgradePromptDismissal('user-a');
    recordUpgradePromptDismissal('user-a');

    expect(getUpgradePromptDismissalCount('user-a')).toBe(2);
    expect(requiresFreePlanConfirmation('user-a')).toBe(false);
  });

  it('requires an explicit free-plan confirmation after the third dismissal', () => {
    recordUpgradePromptDismissal('user-a');
    recordUpgradePromptDismissal('user-a');
    recordUpgradePromptDismissal('user-a');

    expect(requiresFreePlanConfirmation('user-a')).toBe(true);
  });

  it('does not carry one account’s dismissals to another account', () => {
    recordUpgradePromptDismissal('user-a');
    recordUpgradePromptDismissal('user-a');
    recordUpgradePromptDismissal('user-a');

    expect(requiresFreePlanConfirmation('user-a')).toBe(true);
    expect(getUpgradePromptDismissalCount('user-b')).toBe(0);
    expect(requiresFreePlanConfirmation('user-b')).toBe(false);
  });
});
