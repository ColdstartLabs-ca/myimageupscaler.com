import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOAST_DUPLICATE_COOLDOWN_MS,
  resetToastDeduplication,
  useToastStore,
} from '@client/store/toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-07T12:00:00Z'));
    resetToastDeduplication();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetToastDeduplication();
    useToastStore.setState({ toasts: [] });
  });

  it('suppresses identical active toasts', () => {
    const { showToast } = useToastStore.getState();

    showToast({ message: 'Same text toast', type: 'info' });
    showToast({ message: 'Same text toast', type: 'info' });

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('suppresses identical toasts during the cooldown window', () => {
    const { showToast } = useToastStore.getState();

    showToast({ message: 'Same text toast', type: 'info', duration: 1000 });
    vi.advanceTimersByTime(1000);
    expect(useToastStore.getState().toasts).toHaveLength(0);

    vi.advanceTimersByTime(TOAST_DUPLICATE_COOLDOWN_MS - 1000 - 1);
    showToast({ message: 'Same text toast', type: 'info' });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('allows identical toasts again after the cooldown expires', () => {
    const { showToast } = useToastStore.getState();

    showToast({ message: 'Same text toast', type: 'info', duration: 1000 });
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(TOAST_DUPLICATE_COOLDOWN_MS);

    showToast({ message: 'Same text toast', type: 'info' });

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
