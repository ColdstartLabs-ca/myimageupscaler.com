/**
 * Unit Tests: Cron Refresh 3-Kings Sitemap Route
 *
 * Tests for the 3-Kings sitemap refresh cron job that fetches GSC data,
 * scores blog pages, and persists entries to the database.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    CRON_SECRET: 'test-secret',
    GSC_SERVICE_ACCOUNT_EMAIL: 'sa@test.iam',
    GSC_PRIVATE_KEY: 'key',
    GSC_SITE_URL: 'sc-domain:test.com',
  },
}));

const mockInsert = vi.fn();
const mockNeq = vi.fn();

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'three_kings_sitemap_entries') {
        return {
          insert: mockInsert,
          delete: () => ({ neq: mockNeq }),
        };
      }
      throw new Error(`Unexpected table in cron test: ${table}`);
    }),
  },
}));

const mockCreateSyncRun = vi.fn();
const mockCompleteSyncRun = vi.fn();

vi.mock('@server/services/subscription-sync.service', () => ({
  createSyncRun: (...args: unknown[]) => mockCreateSyncRun(...args),
  completeSyncRun: (...args: unknown[]) => mockCompleteSyncRun(...args),
}));

const mockBuildGscDateRange = vi.fn();
const mockCreateGscAccessToken = vi.fn();
const mockFetchBlogPagePerformance = vi.fn();
const mockFetchBlogQueryPagePerformance = vi.fn();

vi.mock('@server/services/gsc.service', () => ({
  buildGscDateRange: (...args: unknown[]) => mockBuildGscDateRange(...args),
  createGscAccessToken: (...args: unknown[]) => mockCreateGscAccessToken(...args),
  fetchBlogPagePerformance: (...args: unknown[]) => mockFetchBlogPagePerformance(...args),
  fetchBlogQueryPagePerformance: (...args: unknown[]) => mockFetchBlogQueryPagePerformance(...args),
}));

const mockScoreBlogPages = vi.fn();

vi.mock('@server/services/three-kings-scoring.service', () => ({
  scoreBlogPages: (...args: unknown[]) => mockScoreBlogPages(...args),
}));

// --- Imports (after mocks) ---
import { POST } from '@app/api/cron/refresh-3kings-sitemap/route';

const makeRequest = (secret: string | null = 'test-secret') => {
  const headers: Record<string, string> = {};
  if (secret !== null) headers['x-cron-secret'] = secret;
  return new NextRequest('http://localhost/api/cron/refresh-3kings-sitemap', {
    method: 'POST',
    headers,
  });
};

describe('POST /api/cron/refresh-3kings-sitemap', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };

    // Healthy defaults
    mockCreateSyncRun.mockResolvedValue('sync-run-id');
    mockCompleteSyncRun.mockResolvedValue(undefined);
    mockBuildGscDateRange.mockReturnValue({ startDate: '2026-01-01', endDate: '2026-01-28' });
    mockCreateGscAccessToken.mockResolvedValue('access-token');
    mockFetchBlogPagePerformance.mockResolvedValue([]);
    mockFetchBlogQueryPagePerformance.mockResolvedValue([]);
    mockScoreBlogPages.mockReturnValue([]);
    mockInsert.mockResolvedValue({ error: null });
    mockNeq.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('Authentication', () => {
    it('rejects requests without the cron secret', async () => {
      const response = await POST(makeRequest('wrong-secret'));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 when x-cron-secret header is missing', async () => {
      const response = await POST(makeRequest(null));
      expect(response.status).toBe(401);
    });
  });

  describe('Missing GSC credentials', () => {
    it('returns skipped=true when GSC creds are missing and marks sync run as failed', async () => {
      // To test the missing-credentials guard without resetting modules, we temporarily
      // make the GSC email check fail by returning a skipped response. We verify this
      // by inspecting what the route does when GSC_SERVICE_ACCOUNT_EMAIL is empty.
      // Since the mock always has the email set, we test this by importing the module
      // with a factory override using vi.importActual-style isolation.
      //
      // Strategy: use vi.mock with factory to create a second isolated describe block
      // that mocks the env differently. Because Vitest hoists all vi.mock() calls,
      // we test the guard via a separate inline module re-import after doMock.

      // Save originals
      const origEmail = 'sa@test.iam';

      // Simulate the guard by temporarily patching the env object
      // (the route reads serverEnv.GSC_SERVICE_ACCOUNT_EMAIL at runtime)
      const envModule = await import('@shared/config/env');
      const originalEmail = (envModule.serverEnv as Record<string, string>).GSC_SERVICE_ACCOUNT_EMAIL;
      (envModule.serverEnv as Record<string, string>).GSC_SERVICE_ACCOUNT_EMAIL = '';

      try {
        const response = await POST(makeRequest());
        const body = await response.json();

        expect(body.skipped).toBe(true);
        expect(body.reason).toBe('missing_gsc_credentials');
        expect(mockCompleteSyncRun).toHaveBeenCalledWith(
          'sync-run-id',
          expect.objectContaining({ status: 'failed', errorMessage: 'missing_gsc_credentials' })
        );
      } finally {
        // Restore
        (envModule.serverEnv as Record<string, string>).GSC_SERVICE_ACCOUNT_EMAIL =
          originalEmail ?? origEmail;
      }
    });
  });

  describe('Happy path', () => {
    it('completes a successful refresh with metadata.refreshRunId', async () => {
      const mockEntries = [
        {
          url: 'https://myimageupscaler.com/blog/test-post',
          slug: 'test-post',
          title: null,
          position: 8,
          impressions: 500,
          clicks: 20,
          ctr: 0.04,
          opportunityScore: 0.75,
          positionScore: 1.0,
          impressionScore: 0.5,
          ctrGapScore: 0.2,
          queryIntentScore: 1.0,
          topQuery: 'best ai upscaler',
        },
      ];
      mockScoreBlogPages.mockReturnValue(mockEntries);

      const response = await POST(makeRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.processed).toBe(true);
      expect(body.entryCount).toBe(1);
      expect(body.refreshRunId).toBeDefined();
      expect(body.refreshedAt).toBeDefined();

      expect(mockCompleteSyncRun).toHaveBeenCalledWith(
        'sync-run-id',
        expect.objectContaining({
          status: 'completed',
          recordsProcessed: 1,
          metadata: expect.objectContaining({
            refreshRunId: expect.any(String),
            entryCount: 1,
          }),
        })
      );
    });

    it('calls createSyncRun with three_kings_sitemap_refresh job type', async () => {
      await POST(makeRequest());
      expect(mockCreateSyncRun).toHaveBeenCalledWith('three_kings_sitemap_refresh');
    });

    it('skips insert when entries array is empty but still completes the sync run', async () => {
      mockScoreBlogPages.mockReturnValue([]);

      const response = await POST(makeRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.entryCount).toBe(0);
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockCompleteSyncRun).toHaveBeenCalledWith(
        'sync-run-id',
        expect.objectContaining({ status: 'completed', recordsProcessed: 0 })
      );
    });
  });

  describe('Ordering guarantee: completeSyncRun before delete', () => {
    it('does not delete older batches before completeSyncRun is called', async () => {
      const callOrder: string[] = [];

      mockCompleteSyncRun.mockImplementation(async () => {
        callOrder.push('completeSyncRun');
      });
      mockNeq.mockImplementation(async () => {
        callOrder.push('deleteOldBatches');
        return { error: null };
      });

      await POST(makeRequest());

      const completeSyncRunIndex = callOrder.indexOf('completeSyncRun');
      const deleteIndex = callOrder.indexOf('deleteOldBatches');

      expect(completeSyncRunIndex).toBeGreaterThanOrEqual(0);
      expect(deleteIndex).toBeGreaterThanOrEqual(0);
      expect(completeSyncRunIndex).toBeLessThan(deleteIndex);
    });
  });

  describe('Error handling', () => {
    it('returns 500 and calls completeSyncRun with failed status on insert error', async () => {
      mockScoreBlogPages.mockReturnValue([
        {
          url: 'https://myimageupscaler.com/blog/test',
          slug: 'test',
          title: null,
          position: 8,
          impressions: 100,
          clicks: 5,
          ctr: 0.05,
          opportunityScore: 0.6,
          positionScore: 1.0,
          impressionScore: 0.3,
          ctrGapScore: 0.1,
          queryIntentScore: 0.0,
          topQuery: null,
        },
      ]);
      mockInsert.mockResolvedValue({ error: { message: 'DB write failed' } });

      const response = await POST(makeRequest());
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toContain('Failed to insert batch');
      expect(mockCompleteSyncRun).toHaveBeenCalledWith(
        'sync-run-id',
        expect.objectContaining({ status: 'failed' })
      );
    });
  });
});
