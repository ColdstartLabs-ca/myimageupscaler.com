/**
 * Unit tests for CampaignService
 *
 * Tests campaign queue management, segmentation, and token generation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CampaignService,
  CampaignError,
  getCampaignService,
  resetCampaignService,
} from '@server/services/campaign.service';

// Mock dependencies - using factory functions to avoid hoisting issues
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

vi.mock('@server/services/email.service', () => ({
  getEmailService: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    BASE_URL: 'https://test.myimageupscaler.com',
  },
  clientEnv: {},
}));

// Import mocked modules to get access to mock functions
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

describe('CampaignService', () => {
  let service: CampaignService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCampaignService();
    service = getCampaignService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getCampaignsBySegment', () => {
    it('should fetch enabled campaigns for a segment', async () => {
      const mockCampaigns = [
        {
          id: 'campaign-1',
          name: 'Non-converter Day 1',
          segment: 'non_converter',
          template_name: 'reengagement-non-converter-day-1',
          send_day: 1,
          subject: 'Your images are waiting!',
          enabled: true,
          priority: 0,
          created_at: '2026-03-11T00:00:00Z',
          updated_at: '2026-03-11T00:00:00Z',
        },
        {
          id: 'campaign-2',
          name: 'Non-converter Day 3',
          segment: 'non_converter',
          template_name: 'reengagement-non-converter-day-3',
          send_day: 3,
          subject: 'Still thinking about it?',
          enabled: true,
          priority: 0,
          created_at: '2026-03-11T00:00:00Z',
          updated_at: '2026-03-11T00:00:00Z',
        },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockCampaigns,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await service.getCampaignsBySegment('non_converter');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Non-converter Day 1');
      expect(result[0].templateName).toBe('reengagement-non-converter-day-1');
    });

    it('should throw CampaignError on database error', async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                }),
              }),
            }),
          }),
        }),
      });

      await expect(service.getCampaignsBySegment('non_converter')).rejects.toThrow(CampaignError);
    });
  });

  describe('getCampaignById', () => {
    it('should return campaign when found', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        name: 'Test Campaign',
        segment: 'non_converter',
        template_name: 'test-template',
        send_day: 1,
        subject: 'Test Subject',
        enabled: true,
        priority: 0,
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCampaign,
              error: null,
            }),
          }),
        }),
      });

      const result = await service.getCampaignById('campaign-1');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Campaign');
      expect(result?.templateName).toBe('test-template');
    });

    it('should return null when campaign not found', async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });

      const result = await service.getCampaignById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('queueCampaign', () => {
    it('should throw CampaignError when campaign not found', async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });

      await expect(service.queueCampaign({ campaignId: 'nonexistent' })).rejects.toThrow(
        CampaignError
      );

      try {
        await service.queueCampaign({ campaignId: 'nonexistent' });
      } catch (err) {
        expect(err).toBeInstanceOf(CampaignError);
        expect((err as CampaignError).code).toBe('CAMPAIGN_NOT_FOUND');
      }
    });

    it('should return zero queued when segment is trial_user and trials are disabled', async () => {
      const mockCampaign = {
        id: 'campaign-trial',
        name: 'Trial Progress',
        segment: 'trial_user',
        template_name: 'trial-progress',
        send_day: 1,
        subject: 'How is your trial going?',
        enabled: true,
        priority: 0,
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCampaign,
              error: null,
            }),
          }),
        }),
      });

      // SUBSCRIPTION_CONFIG has all plans with trial.enabled = false (the real config)
      const result = await service.queueCampaign({ campaignId: 'campaign-trial' });

      expect(result).toEqual({ queued: 0, skipped: 0, userIds: [] });
      // Segment RPC should never be called
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    });

    it('should throw CampaignError when campaign is disabled', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        name: 'Disabled Campaign',
        segment: 'non_converter',
        template_name: 'test-template',
        send_day: 1,
        subject: 'Test Subject',
        enabled: false,
        priority: 0,
        created_at: '2026-03-11T00:00:00Z',
        updated_at: '2026-03-11T00:00:00Z',
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCampaign,
              error: null,
            }),
          }),
        }),
      });

      await expect(service.queueCampaign({ campaignId: 'campaign-1' })).rejects.toThrow(
        CampaignError
      );

      try {
        await service.queueCampaign({ campaignId: 'campaign-1' });
      } catch (err) {
        expect(err).toBeInstanceOf(CampaignError);
        expect((err as CampaignError).code).toBe('CAMPAIGN_DISABLED');
      }
    });
  });

  describe('processQueue', () => {
    it('should return early when no pending emails', async () => {
      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await service.processQueue(100);

      expect(result.processed).toBe(0);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should handle RPC errors gracefully', async () => {
      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.processQueue(100)).rejects.toThrow(CampaignError);
    });
  });

  describe('getSegmentStats', () => {
    it('should handle RPC errors', async () => {
      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.getSegmentStats('non_converter')).rejects.toThrow(CampaignError);
    });
  });

  describe('getUserQueueEntries', () => {
    it('should return user queue entries', async () => {
      const mockEntries = [
        {
          id: 'queue-1',
          campaign_id: 'campaign-1',
          user_id: 'user-1',
          email: 'test@example.com',
          scheduled_for: '2026-03-12T00:00:00Z',
          sent_at: null,
          status: 'pending',
          error_message: null,
          created_at: '2026-03-11T00:00:00Z',
          metadata: {},
        },
      ];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockEntries,
              error: null,
            }),
          }),
        }),
      });

      const result = await service.getUserQueueEntries('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].campaignId).toBe('campaign-1');
      expect(result[0].status).toBe('pending');
    });
  });

  describe('cancelUserQueueEntries', () => {
    it('should cancel pending entries and return count', async () => {
      const mockResult = [{ id: 'queue-1' }, { id: 'queue-2' }];

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: mockResult,
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await service.cancelUserQueueEntries('user-1');

      expect(result).toBe(2);
    });

    it('should handle errors when cancelling', async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database error' },
              }),
            }),
          }),
        }),
      });

      await expect(service.cancelUserQueueEntries('user-1')).rejects.toThrow(CampaignError);
    });
  });

  describe('recordEvent', () => {
    it('should call record_campaign_event RPC', async () => {
      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: null,
      });

      await service.recordEvent('queue-1', 'opened', { userAgent: 'Test' });

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith('record_campaign_event', {
        p_queue_id: 'queue-1',
        p_event_type: 'opened',
        p_metadata: { userAgent: 'Test' },
      });
    });
  });
});

describe('CampaignError', () => {
  it('should create error with message and code', () => {
    const error = new CampaignError('Test error', 'TEST_CODE');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('CampaignError');
  });

  it('should default code to CAMPAIGN_ERROR', () => {
    const error = new CampaignError('Test error');

    expect(error.code).toBe('CAMPAIGN_ERROR');
  });
});

describe('getCampaignService singleton', () => {
  beforeEach(() => {
    resetCampaignService();
  });

  it('should return the same instance', () => {
    const instance1 = getCampaignService();
    const instance2 = getCampaignService();

    expect(instance1).toBe(instance2);
  });

  it('should create new instance after reset', () => {
    const instance1 = getCampaignService();
    resetCampaignService();
    const instance2 = getCampaignService();

    expect(instance1).not.toBe(instance2);
  });
});
