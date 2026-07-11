import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sendMock, trackMock, flushMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  trackMock: vi.fn(),
  flushMock: vi.fn(),
}));

vi.mock('@server/services/email.service', () => ({
  getEmailService: () => ({ send: sendMock }),
}));
vi.mock('@server/analytics', () => ({ trackServerEvent: trackMock }));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), flush: flushMock }),
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: { SUPPORT_EMAIL: 'support@example.com', AMPLITUDE_API_KEY: 'amplitude-key' },
}));

import { POST } from '@app/api/support/contact/route';

describe('support contact revenue metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ success: true });
    trackMock.mockResolvedValue(true);
  });

  it('records authenticated support contacts for rollout cohort rate queries', async () => {
    const response = await POST(
      new NextRequest('https://example.com/api/support/contact', {
        method: 'POST',
        headers: { 'X-User-Id': 'user-1', 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          category: 'billing',
          subject: 'Auto top-up question',
          message: 'Please help me understand this refill.',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(trackMock).toHaveBeenCalledWith(
      'revenue_support_contact',
      { category: 'billing' },
      { apiKey: 'amplitude-key', userId: 'user-1' }
    );
  });
});
