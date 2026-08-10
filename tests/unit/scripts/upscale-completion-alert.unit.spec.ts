import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getReport: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@server/services/email.service', () => ({
  getEmailService: () => ({ send: mocks.sendEmail }),
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: { PROVIDER_ALERT_EMAIL: 'ops@example.com' },
}));

import { monitorUpscaleCompletionRate } from '@server/services/upscale-completion-health.service';

function report(started: number, completed: number, threshold = 0.95) {
  return {
    startDate: '20260803',
    endDate: '20260803',
    days: [],
    threshold,
    lastCompleteDay: {
      date: '2026-08-03',
      started,
      completed,
      processingFailed: 16,
      completionRate: started > 0 ? completed / started : null,
      unaccounted: started - completed - 16,
    },
  };
}

describe('upscale completion-rate alert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue({ success: true, messageId: 'alert-1' });
  });

  it('should alert when completion ratio is below 0.95', async () => {
    mocks.getReport.mockResolvedValue(report(508, 247));

    await expect(monitorUpscaleCompletionRate(mocks.getReport)).resolves.toBe(true);

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ops@example.com',
        template: 'provider-incident',
        data: expect.objectContaining({
          completionRatePercent: 49,
          completionRateDate: '2026-08-03',
        }),
      })
    );
  });

  it('should not alert when completion ratio is 0.98', async () => {
    mocks.getReport.mockResolvedValue(report(100, 98));

    await expect(monitorUpscaleCompletionRate(mocks.getReport)).resolves.toBe(false);

    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
