import { describe, expect, it, vi } from 'vitest';
import {
  formatRecoveryCronDryRunSummary,
  runRecoveryCronDryRunCheck,
  validateRecoveryCronDryRunResponse,
} from '@/scripts/check-recovery-cron-target';

const validResponse = {
  success: true,
  dryRun: true,
  duePending: 3,
  durationMs: 42,
  recoveryEligibility: {
    byAudience: {
      checkout_abandoner: {
        scanned: 10,
        eligible: 2,
        queued: 0,
        skippedPurchased: 1,
        skippedPriority: 0,
        skippedMissingEmail: 1,
      },
      upgrade_click_no_purchase: {
        scanned: 8,
        eligible: 1,
        queued: 0,
        skippedPurchased: 0,
        skippedPriority: 1,
        skippedMissingEmail: 0,
      },
      credit_wall_dismissed: {
        scanned: 5,
        eligible: 1,
        queued: 0,
        skippedPurchased: 0,
        skippedPriority: 0,
        skippedMissingEmail: 0,
      },
      high_usage_free_user: {
        scanned: 12,
        eligible: 3,
        queued: 0,
        skippedPurchased: 2,
        skippedPriority: 1,
        skippedMissingEmail: 0,
      },
    },
  },
};

describe('check-recovery-cron-target script helpers', () => {
  it('should validate aggregate recovery cron dry-run counts', () => {
    const summary = validateRecoveryCronDryRunResponse(validResponse);

    expect(summary.duePending).toBe(3);
    expect(summary.byAudience.checkout_abandoner.scanned).toBe(10);
    expect(formatRecoveryCronDryRunSummary(summary)).toContain(
      'OK checkout_abandoner: scanned=10 eligible=2 queued=0 skippedPurchased=1 skippedPriority=0 skippedMissingEmail=1'
    );
  });

  it('should fail when a required recovery audience is missing', () => {
    const invalid = structuredClone(validResponse);
    delete invalid.recoveryEligibility.byAudience.high_usage_free_user;

    expect(() => validateRecoveryCronDryRunResponse(invalid)).toThrow(
      'Recovery cron dry-run response is missing high_usage_free_user counts'
    );
  });

  it('should fail when the cron response was not a dry-run success', () => {
    expect(() =>
      validateRecoveryCronDryRunResponse({
        ...validResponse,
        dryRun: false,
      })
    ).toThrow('success=true and dryRun=true');
  });

  it('should call the target cron endpoint with dry-run bounds and cron auth', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(validResponse)),
    });

    const summary = await runRecoveryCronDryRunCheck({
      baseUrl: 'https://myimageupscaler.com',
      cronSecret: 'test-cron-secret',
      fetchImpl,
    });

    expect(summary.durationMs).toBe(42);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://myimageupscaler.com/api/cron/email-lifecycle?dryRun=true&batchSize=25&scanLimit=25',
      {
        method: 'POST',
        headers: {
          'x-cron-secret': 'test-cron-secret',
        },
      }
    );
  });
});
