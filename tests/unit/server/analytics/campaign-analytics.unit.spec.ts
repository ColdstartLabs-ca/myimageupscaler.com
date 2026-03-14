/**
 * Unit tests for CampaignAnalyticsService
 *
 * Tests analytics tracking for email re-engagement drip campaigns.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CampaignAnalyticsService,
  getCampaignAnalyticsService,
  resetCampaignAnalyticsService,
  checkAndTrackReengagement,
} from '@server/services/analytics/campaign-analytics.service';

// Mock dependencies
vi.mock('@server/analytics/analyticsService', () => ({
  trackServerEvent: vi.fn().mockResolvedValue(true),
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    AMPLITUDE_API_KEY: 'test_amplitude_api_key',
    ENV: 'test',
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => {
  const mockFrom = vi.fn();
  const mockRpc = vi.fn();
  return {
    supabaseAdmin: {
      from: mockFrom,
      rpc: mockRpc,
    },
  };
});

// Import mocked modules
import { trackServerEvent } from '@server/analytics/analyticsService';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

describe('CampaignAnalyticsService', () => {
  let service: CampaignAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCampaignAnalyticsService();
    service = getCampaignAnalyticsService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('trackEmailQueued', () => {
    it('should track email_queued event with correct properties', async () => {
      await service.trackEmailQueued({
        userId: 'user-123',
        campaignId: 'campaign-456',
        campaign: 'Non-converter Day 1',
        segment: 'non_converter',
      });

      expect(trackServerEvent).toHaveBeenCalledWith(
        'email_queued',
        {
          campaign: 'Non-converter Day 1',
          segment: 'non_converter',
          userId: 'user-123',
          campaignId: 'campaign-456',
        },
        expect.objectContaining({
          apiKey: 'test_amplitude_api_key',
          userId: 'user-123',
        })
      );
    });

    it('should track email_queued for different segments', async () => {
      const segments = ['non_converter', 'non_uploader', 'trial_user'] as const;

      for (const segment of segments) {
        await service.trackEmailQueued({
          userId: 'user-123',
          campaignId: 'campaign-456',
          campaign: 'Test Campaign',
          segment,
        });
      }

      expect(trackServerEvent).toHaveBeenCalledTimes(3);
    });
  });

  describe('trackEmailSent', () => {
    it('should track email_sent event with correct properties', async () => {
      await service.trackEmailSent({
        userId: 'user-123',
        campaignId: 'campaign-456',
        campaign: 'Non-converter Day 1',
        messageId: 'msg-789',
        template: 'reengagement-non-converter-day-1',
      });

      expect(trackServerEvent).toHaveBeenCalledWith(
        'email_sent',
        {
          campaign: 'Non-converter Day 1',
          messageId: 'msg-789',
          template: 'reengagement-non-converter-day-1',
          userId: 'user-123',
          campaignId: 'campaign-456',
        },
        expect.objectContaining({
          apiKey: 'test_amplitude_api_key',
          userId: 'user-123',
        })
      );
    });
  });

  describe('trackEmailOpened', () => {
    it('should track email_opened event with correct properties', async () => {
      await service.trackEmailOpened({
        userId: 'user-123',
        campaignId: 'campaign-456',
        campaign: 'Non-converter Day 1',
        messageId: 'msg-789',
      });

      expect(trackServerEvent).toHaveBeenCalledWith(
        'email_opened',
        {
          campaign: 'Non-converter Day 1',
          messageId: 'msg-789',
          userId: 'user-123',
          campaignId: 'campaign-456',
        },
        expect.objectContaining({
          apiKey: 'test_amplitude_api_key',
          userId: 'user-123',
        })
      );
    });
  });

  describe('trackEmailClicked', () => {
    it('should track email_clicked event with correct properties', async () => {
      await service.trackEmailClicked({
        userId: 'user-123',
        campaignId: 'campaign-456',
        campaign: 'Non-converter Day 1',
        messageId: 'msg-789',
        link: 'https://example.com/pricing',
      });

      expect(trackServerEvent).toHaveBeenCalledWith(
        'email_clicked',
        {
          campaign: 'Non-converter Day 1',
          link: 'https://example.com/pricing',
          messageId: 'msg-789',
          userId: 'user-123',
          campaignId: 'campaign-456',
        },
        expect.objectContaining({
          apiKey: 'test_amplitude_api_key',
          userId: 'user-123',
        })
      );
    });
  });

  describe('trackEmailUnsubscribed', () => {
    it('should track email_unsubscribed event with correct properties', async () => {
      await service.trackEmailUnsubscribed({
        userId: 'user-123',
        campaignId: 'campaign-456',
        campaign: 'Non-converter Day 1',
      });

      expect(trackServerEvent).toHaveBeenCalledWith(
        'email_unsubscribed',
        {
          campaign: 'Non-converter Day 1',
          userId: 'user-123',
          campaignId: 'campaign-456',
        },
        expect.objectContaining({
          apiKey: 'test_amplitude_api_key',
          userId: 'user-123',
        })
      );
    });
  });

  describe('trackReengagementReturned', () => {
    it('should track reengagement_returned event with correct properties', async () => {
      await service.trackReengagementReturned({
        userId: 'user-123',
        campaignId: 'campaign-456',
        campaign: 'Non-converter Day 1',
        daysSinceLastVisit: 5,
      });

      expect(trackServerEvent).toHaveBeenCalledWith(
        'reengagement_returned',
        {
          campaign: 'Non-converter Day 1',
          userId: 'user-123',
          daysSinceLastVisit: 5,
          campaignId: 'campaign-456',
        },
        expect.objectContaining({
          apiKey: 'test_amplitude_api_key',
          userId: 'user-123',
        })
      );
    });

    it('should track reengagement_returned without campaign info', async () => {
      await service.trackReengagementReturned({
        userId: 'user-123',
        daysSinceLastVisit: 3,
      });

      expect(trackServerEvent).toHaveBeenCalledWith(
        'reengagement_returned',
        {
          campaign: undefined,
          userId: 'user-123',
          daysSinceLastVisit: 3,
          campaignId: undefined,
        },
        expect.objectContaining({
          apiKey: 'test_amplitude_api_key',
          userId: 'user-123',
        })
      );
    });
  });
});

describe('getCampaignAnalyticsService singleton', () => {
  beforeEach(() => {
    resetCampaignAnalyticsService();
  });

  it('should return the same instance', () => {
    const instance1 = getCampaignAnalyticsService();
    const instance2 = getCampaignAnalyticsService();

    expect(instance1).toBe(instance2);
  });

  it('should create new instance after reset', () => {
    const instance1 = getCampaignAnalyticsService();
    resetCampaignAnalyticsService();
    const instance2 = getCampaignAnalyticsService();

    expect(instance1).not.toBe(instance2);
  });
});

describe('checkAndTrackReengagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampaignAnalyticsService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return false if daysSinceLastVisit is less than 1', async () => {
    const result = await checkAndTrackReengagement('user-123', 0);

    expect(result).toBe(false);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('should return false if user has no sent campaign emails', async () => {
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const result = await checkAndTrackReengagement('user-123', 5);

    expect(result).toBe(false);
  });

  it('should return false if user already has reengagementTracked in metadata', async () => {
    const mockQueueEntries = [
      {
        id: 'queue-1',
        campaign_id: 'campaign-1',
        sent_at: '2026-03-10T00:00:00Z',
        metadata: { reengagementTracked: true },
      },
    ];

    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: mockQueueEntries,
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const result = await checkAndTrackReengagement('user-123', 5);

    expect(result).toBe(false);
  });

  it('should track reengagement and update metadata for new return', async () => {
    const mockQueueEntries = [
      {
        id: 'queue-1',
        campaign_id: 'campaign-1',
        sent_at: '2026-03-10T00:00:00Z',
        metadata: {},
      },
    ];

    const mockCampaign = {
      id: 'campaign-1',
      name: 'Non-converter Day 1',
    };

    // Setup mock chain for queue entries query
    const mockSelect = vi.fn();
    const mockEq1 = vi.fn();
    const mockEq2 = vi.fn();
    const mockOrder = vi.fn();
    const mockLimit = vi.fn();

    mockLimit.mockResolvedValue({ data: mockQueueEntries, error: null });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockEq2.mockReturnValue({ order: mockOrder });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockSelect.mockReturnValue({ eq: mockEq1 });

    // Setup mock for campaign query
    const mockCampaignSelect = vi.fn();
    const mockCampaignEq = vi.fn();
    const mockCampaignSingle = vi.fn();

    mockCampaignSingle.mockResolvedValue({ data: mockCampaign, error: null });
    mockCampaignEq.mockReturnValue({ single: mockCampaignSingle });
    mockCampaignSelect.mockReturnValue({ eq: mockCampaignEq });

    // Setup mock for update query
    const mockUpdate = vi.fn();
    const mockUpdateEq = vi.fn();

    mockUpdateEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });

    // Return different mocks based on the call
    let callCount = 0;
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        // First call: email_campaign_queue select
        return { select: mockSelect };
      } else if (callCount === 2) {
        // Second call: email_campaigns select
        return { select: mockCampaignSelect };
      } else {
        // Third call: email_campaign_queue update
        return { update: mockUpdate };
      }
    });

    const result = await checkAndTrackReengagement('user-123', 5);

    expect(result).toBe(true);
    expect(trackServerEvent).toHaveBeenCalledWith(
      'reengagement_returned',
      expect.objectContaining({
        campaign: 'Non-converter Day 1',
        userId: 'user-123',
        daysSinceLastVisit: 5,
        campaignId: 'campaign-1',
      }),
      expect.any(Object)
    );
  });

  it('should return false if campaign lookup fails', async () => {
    const mockQueueEntries = [
      {
        id: 'queue-1',
        campaign_id: 'campaign-1',
        sent_at: '2026-03-10T00:00:00Z',
        metadata: {},
      },
    ];

    const mockSelect = vi.fn();
    const mockEq1 = vi.fn();
    const mockEq2 = vi.fn();
    const mockOrder = vi.fn();
    const mockLimit = vi.fn();

    mockLimit.mockResolvedValue({ data: mockQueueEntries, error: null });
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockEq2.mockReturnValue({ order: mockOrder });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockSelect.mockReturnValue({ eq: mockEq1 });

    const mockCampaignSelect = vi.fn();
    const mockCampaignEq = vi.fn();
    const mockCampaignSingle = vi.fn();

    mockCampaignSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });
    mockCampaignEq.mockReturnValue({ single: mockCampaignSingle });
    mockCampaignSelect.mockReturnValue({ eq: mockCampaignEq });

    let callCount = 0;
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { select: mockSelect };
      } else {
        return { select: mockCampaignSelect };
      }
    });

    const result = await checkAndTrackReengagement('user-123', 5);

    expect(result).toBe(false);
  });

  it('should handle database error when fetching queue entries', async () => {
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database error' },
              }),
            }),
          }),
        }),
      }),
    });

    const result = await checkAndTrackReengagement('user-123', 5);

    expect(result).toBe(false);
  });
});
