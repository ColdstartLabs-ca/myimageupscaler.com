import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  claimAlert: vi.fn(),
  releaseAlertClaim: vi.fn(),
  send: vi.fn(),
  loggerError: vi.fn(),
  flush: vi.fn(),
}));

vi.mock('@server/services/provider-health.service', () => ({
  providerHealthService: {
    claimAlert: mocks.claimAlert,
    releaseAlertClaim: mocks.releaseAlertClaim,
  },
}));
vi.mock('@server/services/email.service', () => ({
  getEmailService: () => ({ send: mocks.send }),
}));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: mocks.loggerError,
    flush: mocks.flush,
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    CRON_SECRET: 'cron-secret',
    PROVIDER_ALERT_EMAIL: 'alerts@example.com',
  },
}));

import { POST } from '@/app/api/cron/provider-health/route';

function request(secret = 'cron-secret'): NextRequest {
  return new NextRequest('https://example.com/api/cron/provider-health', {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });
}

describe('POST /api/cron/provider-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ success: true });
  });

  it('should page the admin when the PRD threshold is claimed', async () => {
    mocks.claimAlert.mockResolvedValue({
      shouldAlert: true,
      severity: 'critical',
      attempts: 10,
      failures: 6,
      failureRatio: 0.6,
      baselineRatio: 0.02,
      billingFailures: 2,
      circuitStatus: 'open',
      retryAt: new Date('2026-07-26T20:00:00Z'),
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith({
      to: 'alerts@example.com',
      type: 'transactional',
      template: 'provider-incident',
      data: {
        severity: 'critical',
        attempts: 10,
        failures: 6,
        failureRatioPercent: 60,
        baselineRatioPercent: 2,
        billingFailures: 2,
        circuitStatus: 'open',
      },
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Provider failure-rate alert',
      expect.objectContaining({ failureRatio: 0.6, billingFailures: 2 })
    );
    expect(mocks.flush).toHaveBeenCalled();
  });

  it('should not send when volume or failure ratio is below threshold', async () => {
    mocks.claimAlert.mockResolvedValue({
      shouldAlert: false,
      severity: null,
      attempts: 4,
      failures: 3,
      failureRatio: 0.75,
      baselineRatio: null,
      billingFailures: 0,
      circuitStatus: 'closed',
      retryAt: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('should reject an invalid cron secret', async () => {
    const response = await POST(request('wrong'));

    expect(response.status).toBe(401);
    expect(mocks.claimAlert).not.toHaveBeenCalled();
  });

  it('should release the alert claim when email delivery fails', async () => {
    mocks.claimAlert.mockResolvedValue({
      shouldAlert: true,
      severity: 'critical',
      attempts: 5,
      failures: 5,
      failureRatio: 1,
      baselineRatio: 0.02,
      billingFailures: 5,
      circuitStatus: 'open',
      retryAt: null,
    });
    mocks.send.mockRejectedValue(new Error('email provider unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.releaseAlertClaim).toHaveBeenCalledOnce();
  });
});
