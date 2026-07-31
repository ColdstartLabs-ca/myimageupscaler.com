import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUpgradePromptDismissalCount,
  recordUpgradePromptDismissal,
} from '@client/utils/upgrade-prompt-dismissals';

describe('upgrade prompt dismissal tracking', () => {
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

  it('counts dismissals per account', () => {
    recordUpgradePromptDismissal('user-a');
    recordUpgradePromptDismissal('user-a');

    expect(getUpgradePromptDismissalCount('user-a')).toBe(2);
  });

  it('returns the running total from each recorded dismissal', () => {
    expect(recordUpgradePromptDismissal('user-a')).toBe(1);
    expect(recordUpgradePromptDismissal('user-a')).toBe(2);
    expect(recordUpgradePromptDismissal('user-a')).toBe(3);
  });

  it('does not carry one account’s dismissals to another account', () => {
    recordUpgradePromptDismissal('user-a');
    recordUpgradePromptDismissal('user-a');
    recordUpgradePromptDismissal('user-a');

    expect(getUpgradePromptDismissalCount('user-a')).toBe(3);
    expect(getUpgradePromptDismissalCount('user-b')).toBe(0);
  });
});
