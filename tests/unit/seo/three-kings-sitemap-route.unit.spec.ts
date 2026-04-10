/**
 * Unit Tests: 3-Kings Strategy Sitemap Route
 *
 * Verifies that the sitemap:
 * - Returns valid XML for the latest completed refresh batch
 * - Returns an empty sitemap when no refresh has completed
 * - Ignores failed refreshes (status filter is handled by DB query)
 * - Sets the expected cache headers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (declared before imports) ---

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    PRIMARY_DOMAIN: 'myimageupscaler.com',
  },
  serverEnv: {
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  },
}));

type ChainableMock = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

const mockSyncRunsChain: ChainableMock = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  single: vi.fn(),
};

const mockEntriesChain: ChainableMock = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  single: vi.fn(),
};

// Wire each chain to return itself so calls can be chained arbitrarily
for (const chain of [mockSyncRunsChain, mockEntriesChain]) {
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
}

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'sync_runs') return mockSyncRunsChain;
      if (table === 'three_kings_sitemap_entries') return mockEntriesChain;
      throw new Error(`Unexpected table in sitemap test: ${table}`);
    }),
  },
}));

// --- Imports (after mocks) ---
import { GET } from '@/app/3-kings-strategy-sitemap.xml/route';

const COMPLETED_SYNC_RUN = {
  id: 'sr-001',
  metadata: { refreshRunId: 'batch-abc-123' },
};

const MOCK_ENTRIES = [
  {
    url: 'https://myimageupscaler.com/blog/how-to-upscale-images',
    opportunity_score: 0.85,
    last_refreshed_at: '2026-04-01T00:00:00.000Z',
  },
  {
    url: 'https://myimageupscaler.com/blog/best-ai-upscaler',
    opportunity_score: 0.6,
    last_refreshed_at: '2026-04-01T00:00:00.000Z',
  },
];

describe('GET /3-kings-strategy-sitemap.xml', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-wire chains after clearAllMocks
    for (const chain of [mockSyncRunsChain, mockEntriesChain]) {
      chain.select.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      chain.order.mockReturnValue(chain);
      chain.limit.mockReturnValue(chain);
    }
  });

  describe('Happy path', () => {
    it('returns valid XML for the latest completed refresh batch', async () => {
      mockSyncRunsChain.single.mockResolvedValue({ data: COMPLETED_SYNC_RUN, error: null });
      mockEntriesChain.order.mockResolvedValue({ data: MOCK_ENTRIES, error: null });

      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset');
      expect(xml).toContain('<url>');
      expect(xml).toContain('<loc>https://myimageupscaler.com/blog/how-to-upscale-images</loc>');
      expect(xml).toContain('<loc>https://myimageupscaler.com/blog/best-ai-upscaler</loc>');
      expect(xml).toContain('<priority>');
      expect(xml).toContain('<lastmod>');
    });

    it('maps opportunity_score to sitemap priority correctly', async () => {
      mockSyncRunsChain.single.mockResolvedValue({ data: COMPLETED_SYNC_RUN, error: null });
      mockEntriesChain.order.mockResolvedValue({
        data: [
          {
            url: 'https://myimageupscaler.com/blog/high-score',
            opportunity_score: 0.9,
            last_refreshed_at: '2026-04-01T00:00:00.000Z',
          },
          {
            url: 'https://myimageupscaler.com/blog/low-score',
            opportunity_score: 0.05, // below 0.1 minimum, should be clamped to 0.1
            last_refreshed_at: '2026-04-01T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain('<priority>0.9</priority>');
      expect(xml).toContain('<priority>0.1</priority>'); // clamped
    });
  });

  describe('Empty sitemap cases', () => {
    it('returns an empty sitemap when no refresh has completed (single() returns null)', async () => {
      mockSyncRunsChain.single.mockResolvedValue({ data: null, error: null });

      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset');
      expect(xml).not.toContain('<url>');
    });

    it('returns an empty sitemap when sync run has no refreshRunId in metadata', async () => {
      mockSyncRunsChain.single.mockResolvedValue({
        data: { id: 'sr-002', metadata: {} },
        error: null,
      });

      const response = await GET();
      const xml = await response.text();

      expect(xml).not.toContain('<url>');
    });

    it('returns an empty sitemap when entry list is empty', async () => {
      mockSyncRunsChain.single.mockResolvedValue({ data: COMPLETED_SYNC_RUN, error: null });
      mockEntriesChain.order.mockResolvedValue({ data: [], error: null });

      const response = await GET();
      const xml = await response.text();

      expect(xml).not.toContain('<url>');
    });

    it('returns an empty sitemap when entries data is null', async () => {
      mockSyncRunsChain.single.mockResolvedValue({ data: COMPLETED_SYNC_RUN, error: null });
      mockEntriesChain.order.mockResolvedValue({ data: null, error: null });

      const response = await GET();
      const xml = await response.text();

      expect(xml).not.toContain('<url>');
    });
  });

  describe('Failed refresh filtering', () => {
    it('ignores failed refreshes because the query filters by status=completed', async () => {
      // The route queries .eq('status', 'completed') on sync_runs, so failed runs are
      // excluded at the DB level. We verify this by checking that the eq mock is
      // called with 'status' and 'completed' and that, when no completed run exists,
      // the response is an empty sitemap.
      mockSyncRunsChain.single.mockResolvedValue({ data: null, error: null });

      await GET();

      // Verify the chain was called with the completed status filter
      expect(mockSyncRunsChain.eq).toHaveBeenCalledWith('status', 'completed');
    });

    it('serves the correct batch even when a previous failed run exists', async () => {
      // Simulates: latest completed run points to batch-abc-123,
      // a failed run would have a different refresh_run_id but is excluded by the query
      mockSyncRunsChain.single.mockResolvedValue({ data: COMPLETED_SYNC_RUN, error: null });
      mockEntriesChain.order.mockResolvedValue({ data: MOCK_ENTRIES, error: null });

      const response = await GET();
      const xml = await response.text();

      // Entries from the completed batch are present
      expect(xml).toContain('<url>');
      // The entries chain was called with the correct refresh_run_id
      expect(mockEntriesChain.eq).toHaveBeenCalledWith('refresh_run_id', 'batch-abc-123');
    });
  });

  describe('Cache headers', () => {
    it('sets the expected cache headers', async () => {
      mockSyncRunsChain.single.mockResolvedValue({ data: COMPLETED_SYNC_RUN, error: null });
      mockEntriesChain.order.mockResolvedValue({ data: MOCK_ENTRIES, error: null });

      const response = await GET();

      expect(response.headers.get('Content-Type')).toBe('application/xml');
      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
      );
    });

    it('sets cache headers even for the empty sitemap response', async () => {
      mockSyncRunsChain.single.mockResolvedValue({ data: null, error: null });

      const response = await GET();

      expect(response.headers.get('Content-Type')).toBe('application/xml');
      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
      );
    });
  });

  describe('Error resilience', () => {
    it('returns an empty sitemap when supabase throws an error', async () => {
      mockSyncRunsChain.single.mockRejectedValue(new Error('DB connection failed'));

      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset');
      expect(xml).not.toContain('<url>');
    });
  });

  describe('XML correctness', () => {
    it('escapes special XML characters in URLs', async () => {
      mockSyncRunsChain.single.mockResolvedValue({ data: COMPLETED_SYNC_RUN, error: null });
      mockEntriesChain.order.mockResolvedValue({
        data: [
          {
            url: 'https://myimageupscaler.com/blog/test?a=1&b=2',
            opportunity_score: 0.7,
            last_refreshed_at: '2026-04-01T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain('&amp;');
      expect(xml).not.toContain('?a=1&b=2');
    });
  });
});
