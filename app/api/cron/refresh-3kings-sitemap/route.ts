/**
 * Cron Endpoint: 3-Kings Sitemap Refresh
 *
 * Fetches GSC data, scores blog pages using the 3-Kings technique, and
 * persists the latest batch into the three_kings_sitemap_entries table.
 *
 * Triggered by: Cloudflare Cron Trigger (weekly)
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import {
  createSyncRun,
  completeSyncRun,
} from '@server/services/subscription-sync.service';
import {
  buildGscDateRange,
  createGscAccessToken,
  fetchBlogPagePerformance,
  fetchBlogQueryPagePerformance,
} from '@server/services/gsc.service';
import { scoreBlogPages, type IGscPageRow, type IGscQueryPageRow } from '@server/services/three-kings-scoring.service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let syncRunId: string | null = null;

  try {
    // 2. Create sync run
    syncRunId = await createSyncRun('three_kings_sitemap_refresh');

    // 3. Check for GSC credentials
    if (!serverEnv.GSC_SERVICE_ACCOUNT_EMAIL || !serverEnv.GSC_PRIVATE_KEY) {
      await completeSyncRun(syncRunId, {
        status: 'failed',
        errorMessage: 'missing_gsc_credentials',
        metadata: { skipped: true, reason: 'missing_gsc_credentials' },
      });
      return NextResponse.json({ skipped: true, reason: 'missing_gsc_credentials' });
    }

    // 4. Build date range (28 days, 3-day lag)
    const range = buildGscDateRange(28, 3);

    // 5. Get access token
    const accessToken = await createGscAccessToken(
      serverEnv.GSC_SERVICE_ACCOUNT_EMAIL,
      serverEnv.GSC_PRIVATE_KEY,
    );

    const siteUrl = serverEnv.GSC_SITE_URL;

    // 6. Fetch GSC data
    const [pageRows, queryPageRows] = await Promise.all([
      fetchBlogPagePerformance(accessToken, siteUrl, range),
      fetchBlogQueryPagePerformance(accessToken, siteUrl, range),
    ]);

    // 7. Score entries
    // The GSC service returns IGscSearchAnalyticsRow (keys: string[]) which is compatible
    // at runtime — the scoring service expects the narrower tuple types (keys: [string] and
    // keys: [string, string]). We cast to satisfy the type checker.
    const entries = scoreBlogPages(pageRows as IGscPageRow[], queryPageRows as IGscQueryPageRow[]);

    // 8. Generate a refresh batch ID
    const refreshRunId = crypto.randomUUID();

    // 9. Insert new batch
    if (entries.length > 0) {
      const rows = entries.map(entry => ({
        refresh_run_id: refreshRunId,
        url: entry.url,
        slug: entry.slug,
        title: entry.title,
        position: entry.position,
        impressions: entry.impressions,
        clicks: entry.clicks,
        ctr: entry.ctr,
        opportunity_score: entry.opportunityScore,
        position_score: entry.positionScore,
        impression_score: entry.impressionScore,
        ctr_gap_score: entry.ctrGapScore,
        query_intent_score: entry.queryIntentScore,
        top_query: entry.topQuery,
        source_property: siteUrl,
        source_range_start: range.startDate,
        source_range_end: range.endDate,
        source_lag_days: 3,
        last_refreshed_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabaseAdmin
        .from('three_kings_sitemap_entries')
        .insert(rows);

      if (insertError) {
        throw new Error(`Failed to insert batch: ${insertError.message}`);
      }
    }

    // 10. Complete sync run BEFORE deleting old batches
    await completeSyncRun(syncRunId, {
      status: 'completed',
      recordsProcessed: entries.length,
      metadata: {
        refreshRunId,
        entryCount: entries.length,
        sourceProperty: siteUrl,
        sourceRangeStart: range.startDate,
        sourceRangeEnd: range.endDate,
      },
    });

    // 11. Delete old batches AFTER successful completion (safe to wipe now)
    await supabaseAdmin
      .from('three_kings_sitemap_entries')
      .delete()
      .neq('refresh_run_id', refreshRunId);

    const refreshedAt = new Date().toISOString();
    return NextResponse.json({
      processed: true,
      entryCount: entries.length,
      refreshRunId,
      refreshedAt,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] 3-Kings sitemap refresh failed:', errorMessage);

    if (syncRunId) {
      try {
        await completeSyncRun(syncRunId, {
          status: 'failed',
          errorMessage,
        });
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
