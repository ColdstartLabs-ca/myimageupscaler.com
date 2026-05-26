import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { IExperimentAssignment } from '@shared/types/experiments.types';

const { mockTrack } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockTrack,
  },
}));

vi.mock('@client/store/userStore', () => ({
  useUserStore: (selector: (state: { user: { id: string } | null }) => unknown) =>
    selector({ user: null }),
}));

const assignment: IExperimentAssignment = {
  experimentKey: 'purchase_modal_default_selection',
  contextKey: 'global',
  armId: 10,
  armKey: 'compact',
  armConfig: { layout: 'compact' },
  assignmentKey: 'session:test',
  surface: 'purchase_modal',
};

describe('useExperimentArm', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal('crypto', { randomUUID: () => 'test' });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads cached assignment', async () => {
    sessionStorage.setItem('miu_experiment_session_key', 'test');
    sessionStorage.setItem(
      'miu_experiment_assignment:purchase_modal_default_selection:global:session:test',
      JSON.stringify({ ...assignment, timestamp: Date.now() })
    );

    const { useExperimentArm } = await import('@client/hooks/useExperimentArm');
    const { result } = renderHook(() =>
      useExperimentArm({
        experimentKey: 'purchase_modal_default_selection',
        surface: 'purchase_modal',
        fallbackArm: { armKey: 'control' },
      })
    );

    expect(result.current.armKey).toBe('compact');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requests assignment when missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ assignment }),
    } as Response);

    const { useExperimentArm } = await import('@client/hooks/useExperimentArm');
    const { result } = renderHook(() =>
      useExperimentArm({
        experimentKey: 'purchase_modal_default_selection',
        surface: 'purchase_modal',
        fallbackArm: { armKey: 'control' },
      })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetch).toHaveBeenCalledWith('/api/experiments/assign', expect.any(Object));
    expect(result.current.armKey).toBe('compact');
    expect(mockTrack).toHaveBeenCalledWith('experiment_arm_assigned', expect.any(Object));
  });

  it('falls back to control when API fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));

    const { useExperimentArm } = await import('@client/hooks/useExperimentArm');
    const { result } = renderHook(() =>
      useExperimentArm({
        experimentKey: 'purchase_modal_default_selection',
        surface: 'purchase_modal',
        fallbackArm: { armKey: 'current_modal_control' },
      })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.armKey).toBe('current_modal_control');
    expect(result.current.isFallback).toBe(true);
  });
});
