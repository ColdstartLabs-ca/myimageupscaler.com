import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const captureAnalyticsIntentMock = vi.hoisted(() => vi.fn());
const trackServerEventMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const getUserMock = vi.hoisted(() => vi.fn());

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(() => Promise.resolve()),
}));

vi.mock('@server/services/revenue-recovery.service', () => ({
  getRevenueRecoveryService: vi.fn(() => ({
    captureAnalyticsIntent: captureAnalyticsIntentMock,
  })),
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: trackServerEventMock,
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: getUserMock,
    },
  },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    ENV: 'test',
    AMPLITUDE_API_KEY: 'test_key',
  },
}));

vi.mock('@server/monitoring/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

import { POST } from '@app/api/analytics/event/route';

function createRequest(body: Record<string, unknown>, token?: string): NextRequest {
  return {
    json: () => Promise.resolve(body),
    headers: {
      get: vi.fn((key: string) => {
        if (key === 'content-length') return '100';
        if (key === 'authorization' && token) return `Bearer ${token}`;
        return null;
      }),
    },
  } as unknown as NextRequest;
}

describe('POST /api/analytics/event recovery intents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureAnalyticsIntentMock.mockResolvedValue(true);
    trackServerEventMock.mockResolvedValue(true);
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
  });

  test('should capture checkout recovery intent for authenticated analytics events', async () => {
    const response = await POST(
      createRequest(
        {
          eventName: 'checkout_opened',
          properties: {
            priceId: 'price_medium',
            selectedType: 'pack',
            selectedKey: 'medium',
          },
          sessionId: 'session_123',
        },
        'test_token_user_analytics'
      )
    );

    expect(response.status).toBe(200);
    expect(captureAnalyticsIntentMock).toHaveBeenCalledWith({
      userId: 'user_analytics',
      eventName: 'checkout_opened',
      properties: expect.objectContaining({
        priceId: 'price_medium',
        selectedType: 'pack',
        selectedKey: 'medium',
      }),
      sessionId: 'session_123',
    });
  });

  test('should not provide user id for anonymous recovery analytics events', async () => {
    const response = await POST(
      createRequest({
        eventName: 'checkout_opened',
        properties: { selectedType: 'pack' },
        sessionId: 'session_anonymous',
      })
    );

    expect(response.status).toBe(200);
    expect(captureAnalyticsIntentMock).toHaveBeenCalledWith({
      userId: undefined,
      eventName: 'checkout_opened',
      properties: expect.objectContaining({ selectedType: 'pack' }),
      sessionId: 'session_anonymous',
    });
  });
});
