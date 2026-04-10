/**
 * 3-Kings Strategy Sitemap
 *
 * Serves a dynamic sitemap of blog pages scored by the 3-Kings technique.
 * Entries are pre-computed by the refresh-3kings-sitemap cron job and stored
 * in the three_kings_sitemap_entries table. The sitemap prioritises pages
 * by their opportunity score so search engines crawl the highest-value
 * content first.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const CACHE_HEADERS = {
  'Content-Type': 'application/xml',
  'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
};

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function mapScoreToPriority(score: number): string {
  // Map opportunity_score [0,1] to sitemap priority [0.1, 1.0]
  const priority = Math.max(0.1, Math.min(1.0, score));
  return priority.toFixed(1);
}

function emptyXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
}

export async function GET(): Promise<NextResponse> {
  try {
    // 1. Find the latest completed refresh batch id from sync_runs
    const { data: syncRun } = await supabaseAdmin
      .from('sync_runs')
      .select('id, metadata')
      .eq('job_type', 'three_kings_sitemap_refresh')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    if (!syncRun || !syncRun.metadata?.refreshRunId) {
      // No completed refresh yet — return empty valid sitemap
      return new NextResponse(emptyXml(), { headers: CACHE_HEADERS });
    }

    const refreshRunId = syncRun.metadata.refreshRunId as string;

    // 2. Fetch entries for this batch
    const { data: entries } = await supabaseAdmin
      .from('three_kings_sitemap_entries')
      .select('url, opportunity_score, last_refreshed_at')
      .eq('refresh_run_id', refreshRunId)
      .order('opportunity_score', { ascending: false });

    if (!entries || entries.length === 0) {
      return new NextResponse(emptyXml(), { headers: CACHE_HEADERS });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    entry => `  <url>
    <loc>${escapeXml(entry.url)}</loc>
    <lastmod>${new Date(entry.last_refreshed_at).toISOString()}</lastmod>
    <priority>${mapScoreToPriority(entry.opportunity_score)}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

    return new NextResponse(xml, { headers: CACHE_HEADERS });
  } catch {
    return new NextResponse(emptyXml(), { headers: CACHE_HEADERS });
  }
}
