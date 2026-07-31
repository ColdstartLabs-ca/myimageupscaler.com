import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_ADDITIONAL_OPTIONS } from '@shared/types/coreflow.types';
import {
  claimInterruptedJob,
  clearInterruptedJob,
  inspectInterruptedJob,
  markInterruptedJobNeedsAction,
  saveInterruptedJob,
} from '@client/utils/interruptedJob';

const config = {
  qualityTier: 'quick' as const,
  scale: 2 as const,
  additionalOptions: DEFAULT_ADDITIONAL_OPTIONS,
};

describe('interruptedJob', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test('stores only the minimal resumable configuration and anonymous item IDs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    const job = saveInterruptedJob({
      config: {
        ...config,
        runtimeOnlyImageName: 'image.png',
        runtimeOnlyImageData: 'data:image/png;base64,secret',
      } as typeof config,
      itemIds: ['item-1', 'item-2'],
      requiredCredits: 4,
    });
    const stored = sessionStorage.getItem('miu_interrupted_job');

    expect(job).toMatchObject({
      status: 'pending',
      createdAt: 1_000,
      requiredCredits: 4,
      itemIds: ['item-1', 'item-2'],
      config: {
        qualityTier: 'quick',
        scale: 2,
        additionalOptions: {
          smartAnalysis: false,
          enhance: true,
          enhanceFaces: false,
          preserveText: false,
        },
      },
    });
    expect(stored).not.toContain('filename');
    expect(stored).not.toContain('image.png');
    expect(stored).not.toContain('data:');
    expect(stored).not.toContain('runtimeOnly');
  });

  test('reuses the same pending record when the same wall is opened repeatedly', () => {
    const first = saveInterruptedJob({
      config,
      itemIds: ['item-1'],
      requiredCredits: 1,
    });
    const second = saveInterruptedJob({
      config,
      itemIds: ['item-1'],
      requiredCredits: 1,
    });

    expect(second.jobId).toBe(first.jobId);
  });

  test('claims a ready job exactly once before processing starts', () => {
    const job = saveInterruptedJob({
      config,
      itemIds: ['item-1'],
      requiredCredits: 1,
    });

    expect(claimInterruptedJob(job.jobId)).toMatchObject({
      status: 'claimed',
      job: { jobId: job.jobId, status: 'claimed' },
    });
    expect(claimInterruptedJob(job.jobId)).toEqual({ status: 'already_claimed' });
  });

  test('expires a claimed job into a visible action state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const job = saveInterruptedJob({
      config,
      itemIds: ['item-1'],
      requiredCredits: 1,
    });
    claimInterruptedJob(job.jobId, 1_001);

    expect(inspectInterruptedJob(job.expiresAt + 1)).toMatchObject({
      status: 'needs_action',
      reason: 'stale',
    });
  });

  test('does not claim a job after its resume window expires', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const job = saveInterruptedJob({
      config,
      itemIds: ['item-1'],
      requiredCredits: 1,
    });

    expect(claimInterruptedJob(job.jobId, job.expiresAt + 1)).toEqual({
      status: 'stale',
    });
    expect(inspectInterruptedJob()).toMatchObject({
      status: 'needs_action',
      reason: 'stale',
    });
  });

  test('requires user action for missing in-memory inputs and cannot then claim', () => {
    const job = saveInterruptedJob({
      config,
      itemIds: ['item-1'],
      requiredCredits: 1,
    });

    markInterruptedJobNeedsAction(job.jobId, 'missing_inputs');

    expect(inspectInterruptedJob()).toMatchObject({
      status: 'needs_action',
      reason: 'missing_inputs',
    });
    expect(claimInterruptedJob(job.jobId)).toEqual({ status: 'needs_action' });
  });

  test('clears only the matching completed job', () => {
    const job = saveInterruptedJob({
      config,
      itemIds: ['item-1'],
      requiredCredits: 1,
    });

    clearInterruptedJob('different-job');
    expect(inspectInterruptedJob().status).toBe('ready');

    clearInterruptedJob(job.jobId);
    expect(inspectInterruptedJob()).toEqual({ status: 'missing' });
  });

  test('rejects corrupt persisted configuration instead of auto-resuming it', () => {
    sessionStorage.setItem(
      'miu_interrupted_job',
      JSON.stringify({
        version: 1,
        jobId: 'job-corrupt',
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 1_000,
        requiredCredits: 1,
        itemIds: ['item-1'],
        config: { qualityTier: 'not-a-model', scale: 99 },
      })
    );

    expect(inspectInterruptedJob()).toEqual({ status: 'invalid' });
  });
});
