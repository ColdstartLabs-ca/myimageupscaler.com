#!/usr/bin/env node
/**
 * Standalone GSC Growth Data Fetcher
 *
 * Pulls enough Search Console data to support traffic-growth decisions:
 * - search type segmentation (web/image/video/news/discover/googleNews)
 * - current vs previous period comparisons
 * - query/page/query+page exports
 * - device/country/search appearance breakdowns
 * - URL inspection for priority pages, or for every sitemap URL
 * - sitemap metadata and sitemap-versus-traffic reconciliation
 * - section, locale, host and position splits, click-change decomposition
 * - 16-month trend, fresh hourly data, and an explicit completeness report
 *
 * Auth uses a service account JSON key and native Node.js fetch/crypto only.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WEBMASTERS_BASE_URL = 'https://www.googleapis.com/webmasters/v3';
const SEARCH_CONSOLE_BASE_URL = 'https://searchconsole.googleapis.com/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const DEFAULT_LAG_DAYS = 3;
const DEFAULT_DAYS = 28;
const DEFAULT_ROW_LIMIT = 25000;
const DEFAULT_SEARCH_TYPES = ['web', 'image', 'video', 'news', 'discover', 'googleNews'];
const FULL_DETAIL_TYPES = new Set(['web', 'image', 'video', 'news']);
const SEARCH_APPEARANCE_TYPES = new Set(['web', 'image', 'video', 'news']);
const PACIFIC_TIMEZONE = 'America/Los_Angeles';
const PHANTOM_IMPRESSION_THRESHOLD = 5000;
const PHANTOM_CTR_THRESHOLD = 0.0005;
const HISTORY_DAYS = 486; // Search Console keeps 16 months.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 1000;
const REQUEST_TIMEOUT_MS = 60000;
const SITEMAP_CONCURRENCY = 4;
const INSPECTION_CONCURRENCY = 10;
const STALE_CRAWL_DAYS = 30;
const MIN_SECOND_PAGE_SHARE = 0.1;
const SEGMENT_ROW_LIMIT = 40;
const LOCALE_PATTERN = /^(de|es|fr|it|ja|pt)$/;
const POTENTIAL_CTR_TARGETS = [
  { maxPosition: 3, targetCtr: 0.11 },
  { maxPosition: 5, targetCtr: 0.08 },
  { maxPosition: 10, targetCtr: 0.04 },
  { maxPosition: 20, targetCtr: 0.025 },
  { maxPosition: Infinity, targetCtr: 0.015 },
];
const POSITION_BUCKETS = [
  { label: '1-3', maxPosition: 3 },
  { label: '4-10', maxPosition: 10 },
  { label: '11-20', maxPosition: 20 },
  { label: '21-50', maxPosition: 50 },
  { label: '51+', maxPosition: Infinity },
];
// The public API returns nothing for these. Capture them with gsc-ui-extract.cjs.
const UI_ONLY_REPORTS = [
  'Page indexing: reasons, trends and URL lists',
  'Video indexing',
  'Crawl stats',
  'Core Web Vitals',
  'Generative AI: impressions by page, country and day',
  'Multimodal search type',
  'Insights: query groups and Google branded share',
  'Links',
  'Shopping and enhancement reports',
  'Manual actions, Security issues and Removals',
];
const fetchFailures = [];

const KEY_FILE_PATHS = [
  process.env.GCP_KEY_FILE,
  path.join(
    process.env.HOME || '',
    'projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json'
  ),
  './cloud/keys/coldstart-labs-service-account-key.json',
].filter(Boolean);

function printHelp() {
  console.error(`
Usage:
  node gsc-fetch.cjs --site=example.com [options]

Options:
  --days=28                    Number of complete days to fetch (default: 28)
  --output=/tmp/gsc.json       Write JSON to a file instead of stdout
  --row-limit=25000            Batch size for Search Analytics pagination (max 25000)
  --search-types=web,image     Comma-separated Search Console types
  --primary-type=web           Type used for top-level compatibility fields
  --inspect-top-pages=25       URL Inspection calls for priority pages (0 disables)
  --inspect-sitemap            Also inspect every sitemap URL (uses the 2,000/day quota)
  --appearance-limit=10        Number of search appearance buckets to inspect
  --lag-days=3                 Days to hold back from "today" for stable data
  --key=/path/to/key.json      Override service account key path
  --help                       Show this help
`);
}

function findKeyFile(explicitKeyPath) {
  const candidates = [explicitKeyPath, ...KEY_FILE_PATHS].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  console.error('ERROR: No service account key found. Searched:', candidates);
  console.error('Set GCP_KEY_FILE or pass --key=/path/to/service-account.json');
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    site: null,
    days: DEFAULT_DAYS,
    output: null,
    rowLimit: DEFAULT_ROW_LIMIT,
    key: null,
    searchTypes: DEFAULT_SEARCH_TYPES.slice(),
    primaryType: 'web',
    inspectTopPages: 25,
    inspectSitemap: false,
    appearanceLimit: 10,
    lagDays: DEFAULT_LAG_DAYS,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('--site=')) {
      result.site = arg.split('=')[1];
    } else if (arg.startsWith('--days=')) {
      result.days = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--output=')) {
      result.output = arg.split('=')[1];
    } else if (arg.startsWith('--row-limit=')) {
      result.rowLimit = Math.min(DEFAULT_ROW_LIMIT, parseInt(arg.split('=')[1], 10));
    } else if (arg.startsWith('--key=')) {
      result.key = arg.split('=')[1];
    } else if (arg.startsWith('--search-types=')) {
      result.searchTypes = arg
        .split('=')[1]
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    } else if (arg.startsWith('--primary-type=')) {
      result.primaryType = arg.split('=')[1];
    } else if (arg.startsWith('--inspect-top-pages=')) {
      result.inspectTopPages = Math.max(0, parseInt(arg.split('=')[1], 10));
    } else if (arg === '--inspect-sitemap') {
      result.inspectSitemap = true;
    } else if (arg.startsWith('--appearance-limit=')) {
      result.appearanceLimit = Math.max(0, parseInt(arg.split('=')[1], 10));
    } else if (arg.startsWith('--lag-days=')) {
      result.lagDays = Math.max(0, parseInt(arg.split('=')[1], 10));
    }
  }

  if (!result.site) {
    console.error('ERROR: --site=domain.com is required');
    printHelp();
    process.exit(1);
  }

  if (!Number.isInteger(result.days) || result.days <= 0) {
    console.error('ERROR: --days must be a positive integer');
    process.exit(1);
  }

  if (!Number.isInteger(result.rowLimit) || result.rowLimit <= 0) {
    console.error('ERROR: --row-limit must be a positive integer');
    process.exit(1);
  }

  if (!result.searchTypes.length) {
    console.error('ERROR: --search-types must include at least one type');
    process.exit(1);
  }

  if (!result.searchTypes.includes(result.primaryType)) {
    result.primaryType = result.searchTypes[0];
  }

  return result;
}

function getPacificTodayString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateString(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildDateRanges(days, lagDays) {
  const pacificToday = getPacificTodayString();
  const endDate = shiftDateString(pacificToday, -lagDays);
  const startDate = shiftDateString(endDate, -(days - 1));
  const previousEndDate = shiftDateString(startDate, -1);
  const previousStartDate = shiftDateString(previousEndDate, -(days - 1));

  return {
    current: { startDate, endDate, days },
    previous: { startDate: previousStartDate, endDate: previousEndDate, days },
    lagDays,
    pacificToday,
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function createAccessToken(keyFile) {
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  if (!key.client_email || !key.private_key) {
    throw new Error(`Invalid service account key file: ${keyFile}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: key.client_email,
    scope: GSC_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .end()
    .sign(key.private_key);
  const assertion = `${signingInput}.${base64UrlEncode(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${bodyText}`);
  }

  const payload = JSON.parse(bodyText);
  return payload.access_token;
}

function parseErrorPayload(bodyText) {
  try {
    const payload = JSON.parse(bodyText);
    return payload.error?.message || payload.error_description || bodyText;
  } catch {
    return bodyText;
  }
}

async function googleRequest({
  method = 'GET',
  url,
  accessToken,
  body = null,
  optional = false,
  label = 'request',
  retryBaseMs = RETRY_BASE_MS,
}) {
  let status = null;
  let message = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const bodyText = await response.text();
      if (response.ok) {
        return bodyText ? JSON.parse(bodyText) : {};
      }
      status = response.status;
      message = parseErrorPayload(bodyText);
      if (!RETRYABLE_STATUS.has(status)) break;
    } catch (error) {
      status = null;
      message = error.message;
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, retryBaseMs * 2 ** (attempt - 1)));
    }
  }

  const failure = `${label} failed (${status ?? 'network'}): ${message}`;
  if (!optional) throw new Error(failure);
  console.error(`[GSC] ${failure}`);
  fetchFailures.push({ label, status, message });
  return null;
}

async function listSites(accessToken) {
  const response = await googleRequest({
    url: `${WEBMASTERS_BASE_URL}/sites`,
    accessToken,
    label: 'sites.list',
  });
  return response.siteEntry || [];
}

async function querySearchAnalytics({
  accessToken,
  siteUrl,
  requestBody,
  optional = false,
  label,
}) {
  const response = await googleRequest({
    method: 'POST',
    url: `${WEBMASTERS_BASE_URL}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    accessToken,
    body: requestBody,
    optional,
    label,
  });

  return response || {};
}

async function queryAllSearchAnalyticsRows({
  accessToken,
  siteUrl,
  requestBody,
  rowLimit,
  optional = false,
  label,
}) {
  const rows = [];
  let startRow = 0;

  while (true) {
    const response = await querySearchAnalytics({
      accessToken,
      siteUrl,
      requestBody: { ...requestBody, rowLimit, startRow },
      optional,
      label,
    });

    if (!response) {
      return [];
    }

    const pageRows = response.rows || [];
    rows.push(...pageRows);

    if (pageRows.length < rowLimit) {
      break;
    }

    startRow += rowLimit;
  }

  return rows;
}

async function fetchSummary({ accessToken, siteUrl, range, type, optional = false }) {
  const response = await querySearchAnalytics({
    accessToken,
    siteUrl,
    requestBody: {
      startDate: range.startDate,
      endDate: range.endDate,
      type,
      dataState: 'final',
    },
    optional,
    label: `${type} summary`,
  });

  const row = response?.rows?.[0];
  return {
    clicks: row?.clicks || 0,
    impressions: row?.impressions || 0,
    ctr: row?.ctr || 0,
    position: row?.position || 0,
  };
}

function percentageDelta(current, previous) {
  if (!previous) {
    return current ? null : 0;
  }
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function metricDelta(current, previous) {
  return Number((current - previous).toFixed(4));
}

function buildSummaryComparison(current, previous) {
  return {
    current,
    previous,
    delta: {
      clicks: metricDelta(current.clicks, previous.clicks),
      impressions: metricDelta(current.impressions, previous.impressions),
      ctr: metricDelta(current.ctr, previous.ctr),
      position: metricDelta(current.position, previous.position),
    },
    deltaPct: {
      clicks: percentageDelta(current.clicks, previous.clicks),
      impressions: percentageDelta(current.impressions, previous.impressions),
      ctr: percentageDelta(current.ctr, previous.ctr),
      position: percentageDelta(current.position, previous.position),
    },
  };
}

function normalizeMetricRow(row, keyNames) {
  const base = {
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  };

  keyNames.forEach((name, index) => {
    base[name] = row.keys?.[index] ?? null;
  });

  return base;
}

function aggregateMetrics(rows) {
  const clicks = rows.reduce((sum, row) => sum + (row.clicks || 0), 0);
  const impressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
  const weightedPosition = rows.reduce(
    (sum, row) => sum + (row.position || 0) * (row.impressions || 0),
    0
  );
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weightedPosition / impressions : 0,
  };
}

function reconcileSegmentTotal(segments, total) {
  const reported = aggregateMetrics([...segments.branded, ...segments.nonBranded]);
  const anonymousClicks = Math.max(0, (total?.clicks || 0) - reported.clicks);
  const anonymousImpressions = Math.max(0, (total?.impressions || 0) - reported.impressions);
  return {
    branded: aggregateMetrics(segments.branded),
    nonBranded: aggregateMetrics(segments.nonBranded),
    unclassified: {
      clicks: anonymousClicks,
      impressions: anonymousImpressions,
      ctr: anonymousImpressions ? anonymousClicks / anonymousImpressions : 0,
      position: null,
    },
  };
}

function compareSegment(current, previous) {
  const comparison = buildSummaryComparison(
    { ...current, position: current.position ?? 0 },
    { ...previous, position: previous.position ?? 0 }
  );
  if (current.position === null || previous.position === null) {
    comparison.delta.position = null;
    comparison.deltaPct.position = null;
  }
  return comparison;
}

function buildBrandSplit(currentRows, previousRows, site, currentTotal, previousTotal) {
  const brandPatterns = buildBrandPatterns(site);
  const split = rows => ({
    branded: rows.filter(
      row => isBrandedQuery(row.query, brandPatterns) || isDomainLikeQuery(row.query)
    ),
    nonBranded: rows.filter(
      row => !isBrandedQuery(row.query, brandPatterns) && !isDomainLikeQuery(row.query)
    ),
  });
  const current = reconcileSegmentTotal(split(currentRows), currentTotal);
  const previous = reconcileSegmentTotal(split(previousRows), previousTotal);
  const comparisons = Object.fromEntries(
    Object.keys(current).map(segment => [
      segment,
      compareSegment(current[segment], previous[segment]),
    ])
  );
  return {
    current,
    previous,
    delta: Object.fromEntries(
      Object.entries(comparisons).map(([segment, comparison]) => [segment, comparison.delta])
    ),
    deltaPct: Object.fromEntries(
      Object.entries(comparisons).map(([segment, comparison]) => [segment, comparison.deltaPct])
    ),
  };
}

// 7-day buckets counted back from endDate, so the latest week is always complete.
function buildWeeklyBreakdown({ dailyTrend, dateQueryRows, datePageRows, endDate, site }) {
  const brandPatterns = buildBrandPatterns(site);
  const weekStart = date => {
    let start = shiftDateString(endDate, -6);
    while (date < start) start = shiftDateString(start, -7);
    return start;
  };
  const weeks = new Map();
  const bucket = date => {
    const startDate = weekStart(date);
    if (!weeks.has(startDate)) {
      weeks.set(startDate, {
        startDate,
        endDate: shiftDateString(startDate, 6),
        clicks: 0,
        impressions: 0,
        branded: { clicks: 0, impressions: 0 },
        nonBranded: { clicks: 0, impressions: 0 },
        unclassified: { clicks: 0, impressions: 0 },
        days: 0,
      });
    }
    return weeks.get(startDate);
  };

  for (const row of dailyTrend) {
    const week = bucket(row.date);
    week.clicks += row.clicks;
    week.impressions += row.impressions;
    week.days += 1;
  }
  for (const row of dateQueryRows) {
    const branded = isBrandedQuery(row.query, brandPatterns) || isDomainLikeQuery(row.query);
    const segment = bucket(row.date)[branded ? 'branded' : 'nonBranded'];
    segment.clicks += row.clicks;
    segment.impressions += row.impressions;
  }
  for (const week of weeks.values()) {
    week.unclassified.clicks = Math.max(
      0,
      week.clicks - week.branded.clicks - week.nonBranded.clicks
    );
    week.unclassified.impressions = Math.max(
      0,
      week.impressions - week.branded.impressions - week.nonBranded.impressions
    );
  }

  const latestStart = shiftDateString(endDate, -6);
  const priorStart = shiftDateString(latestStart, -7);
  const latestWeekMovers = (rows, keyField) => {
    const byKey = new Map();
    for (const row of rows) {
      const week = weekStart(row.date);
      if (week !== latestStart && week !== priorStart) continue;
      const entry = byKey.get(row[keyField]) || {
        [keyField]: row[keyField],
        clicks: 0,
        previousClicks: 0,
        impressions: 0,
        previousImpressions: 0,
      };
      const isLatest = week === latestStart;
      entry[isLatest ? 'clicks' : 'previousClicks'] += row.clicks;
      entry[isLatest ? 'impressions' : 'previousImpressions'] += row.impressions;
      byKey.set(row[keyField], entry);
    }
    const movers = [...byKey.values()].map(entry => ({
      ...entry,
      clickDelta: entry.clicks - entry.previousClicks,
      impressionDelta: entry.impressions - entry.previousImpressions,
    }));
    return {
      winners: movers
        .filter(m => m.clickDelta > 0)
        .sort((a, b) => b.clickDelta - a.clickDelta)
        .slice(0, 25),
      losers: movers
        .filter(m => m.clickDelta < 0)
        .sort((a, b) => a.clickDelta - b.clickDelta)
        .slice(0, 25),
    };
  };

  return {
    weeks: [...weeks.values()].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    latestWeekPageMovers: latestWeekMovers(datePageRows, 'page'),
    latestWeekQueryMovers: latestWeekMovers(dateQueryRows, 'query'),
  };
}

function quarantinePhantomQueries(queries, rawSummary, dimensionEvidence = {}) {
  const quarantinedQueries = queries
    .filter(
      query => query.impressions > PHANTOM_IMPRESSION_THRESHOLD && query.ctr < PHANTOM_CTR_THRESHOLD
    )
    .map(query => ({
      query: query.query,
      impressions: query.impressions,
      clicks: query.clicks,
      ctr: query.ctr,
      position: query.position,
      reason: `impressions > ${PHANTOM_IMPRESSION_THRESHOLD} and CTR < 0.05%`,
      topCountry: dimensionEvidence[query.query]?.topCountry ?? null,
      topDevice: dimensionEvidence[query.query]?.topDevice ?? null,
    }));
  const quarantinedNames = new Set(quarantinedQueries.map(query => query.query));
  const flaggedQueries = queries.map(query => ({
    ...query,
    isQuarantined: quarantinedNames.has(query.query),
  }));
  const quarantinedMetrics = aggregateMetrics(
    queries.filter(query => quarantinedNames.has(query.query))
  );
  const impressions = Math.max(0, rawSummary.impressions - quarantinedMetrics.impressions);
  const clicks = Math.max(0, rawSummary.clicks - quarantinedMetrics.clicks);
  const weightedPosition = Math.max(
    0,
    rawSummary.position * rawSummary.impressions -
      quarantinedMetrics.position * quarantinedMetrics.impressions
  );
  return {
    queries: flaggedQueries,
    quarantinedQueries,
    impressionsExQuarantine: impressions,
    ctrExQuarantine: impressions ? clicks / impressions : 0,
    positionExQuarantine: impressions ? weightedPosition / impressions : 0,
  };
}

// A spike in the previous window inflates every impression and position delta.
function buildPreviousQuarantine(previousQueries, previousSummary) {
  const { queries: _flagged, ...result } = quarantinePhantomQueries(
    previousQueries,
    previousSummary
  );
  return result;
}

async function fetchPhantomDimensionEvidence({
  accessToken,
  siteUrl,
  type,
  range,
  rowLimit,
  queries,
}) {
  const phantomQueries = queries.filter(
    query => query.impressions > PHANTOM_IMPRESSION_THRESHOLD && query.ctr < PHANTOM_CTR_THRESHOLD
  );
  const evidence = await Promise.all(
    phantomQueries.map(async query => {
      const fetchTopDimension = async dimension => {
        const rows = await queryAllSearchAnalyticsRows({
          accessToken,
          siteUrl,
          requestBody: {
            startDate: range.startDate,
            endDate: range.endDate,
            dimensions: [dimension],
            dimensionFilterGroups: [
              {
                filters: [{ dimension: 'query', operator: 'equals', expression: query.query }],
              },
            ],
            type,
            dataState: 'final',
          },
          rowLimit,
          optional: true,
          label: `${type} quarantined query ${dimension}`,
        });
        return rows
          .map(row => normalizeMetricRow(row, [dimension]))
          .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)[0]?.[dimension];
      };
      const [topCountry, topDevice] = await Promise.all([
        fetchTopDimension('country'),
        fetchTopDimension('device'),
      ]);
      return [query.query, { topCountry: topCountry ?? null, topDevice: topDevice ?? null }];
    })
  );
  return Object.fromEntries(evidence);
}

function buildStableCohortPosition(currentPages, previousPages) {
  const previousByPage = new Map(previousPages.map(page => [page.page, page]));
  const currentByPage = new Map(currentPages.map(page => [page.page, page]));
  const sharedPages = currentPages
    .map(page => page.page)
    .filter(
      page =>
        page &&
        previousByPage.get(page)?.impressions > 0 &&
        currentByPage.get(page)?.impressions > 0
    );
  return {
    pageCount: sharedPages.length,
    current: aggregateMetrics(sharedPages.map(page => currentByPage.get(page))).position,
    previous: aggregateMetrics(sharedPages.map(page => previousByPage.get(page))).position,
  };
}

function addShares(rows, metricName) {
  const total = rows.reduce((sum, row) => sum + (row[metricName] || 0), 0);
  return rows.map(row => ({
    ...row,
    [`${metricName}Share`]: total ? Number((((row[metricName] || 0) / total) * 100).toFixed(2)) : 0,
  }));
}

function estimatePotentialClicks(impressions, position, actualCtr) {
  const { targetCtr } = POTENTIAL_CTR_TARGETS.find(tier => position <= tier.maxPosition);
  return Math.max(0, Math.round(impressions * (targetCtr - actualCtr)));
}

function scoreOpportunity({ impressions, position, query }) {
  const impressionScore =
    impressions >= 1000
      ? 10
      : impressions >= 500
        ? 8
        : impressions >= 200
          ? 6
          : impressions >= 50
            ? 4
            : 2;
  const positionScore = position <= 12 ? 10 : position <= 18 ? 7 : position <= 30 ? 5 : 2;
  const intentScore = /\b(vs|compare|best|tool|free|online|ai|upscale|enhance|convert)\b/i.test(
    query
  )
    ? 8
    : 5;
  return Math.round(impressionScore * 0.4 + positionScore * 0.35 + intentScore * 0.25);
}

const stripFragment = url => String(url || '').split('#')[0];
const isFragmentRow = row => String(row.page || '').includes('#');

function classifyUrl(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const hasLocale = LOCALE_PATTERN.test(segments[0] || '');
    return {
      host: parsed.hostname,
      locale: hasLocale ? segments[0] : 'en',
      section: (hasLocale ? segments[1] : segments[0]) || '(home)',
    };
  } catch {
    return { host: 'unknown', locale: 'unknown', section: 'unknown' };
  }
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildBrandPatterns(site) {
  const hostname = String(site || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^sc-domain:/, '')
    .replace(/^www\./, '')
    .trim();

  const root = hostname.split('.')[0] || hostname;
  const commonSeoWords = [
    'upscaler',
    'upscale',
    'enhancer',
    'enhance',
    'background',
    'remove',
    'remover',
    'converter',
    'maker',
    'image',
    'photo',
    'tool',
    'tools',
    'free',
    'online',
    'ai',
  ];

  const spacedRoot = root.replace(
    new RegExp(
      commonSeoWords
        .slice()
        .sort((a, b) => b.length - a.length)
        .join('|'),
      'g'
    ),
    match => ` ${match} `
  );

  const brandStemMatch = root.match(
    /^(.*?)(upscaler|upscale|enhancer|enhance|converter|maker|tool|tools)$/
  );
  const brandStemCandidate = brandStemMatch?.[1] ? brandStemMatch[1].replace(/-/g, ' ').trim() : '';
  const brandStem =
    brandStemCandidate &&
    brandStemCandidate.length >= 4 &&
    !commonSeoWords.includes(brandStemCandidate)
      ? brandStemCandidate
      : '';

  const candidates = new Set([
    hostname,
    root,
    hostname.replace(/\./g, ' '),
    root.replace(/-/g, ' '),
    spacedRoot.replace(/\s+/g, ' ').trim(),
    brandStem,
  ]);

  return Array.from(candidates)
    .map(candidate => normalizeText(candidate))
    .filter(Boolean);
}

function isDomainLikeQuery(query) {
  const normalizedQuery = String(query || '').replace(/\s*\.\s*/g, '.');
  return /\b[a-z0-9-]+\.(com|ai|io|net|org|app|co|dev|xyz)\b/i.test(normalizedQuery);
}

function isBrandedQuery(query, brandPatterns) {
  const normalizedQuery = normalizeText(query);
  return brandPatterns.some(pattern => normalizedQuery.includes(pattern));
}

function isLikelyHomepage(urlString) {
  try {
    const url = new URL(urlString);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return true;
    return parts.length === 1 && /^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0]);
  } catch {
    return false;
  }
}

function inferContentFormat(query) {
  if (/\b(vs|versus|compare|alternative|alternatives)\b/i.test(query)) return 'comparison';
  if (/\b(how|why|tips|guide|tutorial|best)\b/i.test(query)) return 'guide';
  return 'landing-page-or-tool';
}

function joinQueryPageData(queryRows, pageRows, queryPageRows, brandPatterns) {
  const pagesByQuery = new Map();
  const queriesByPage = new Map();

  for (const row of queryPageRows) {
    const [query, page] = row.keys || [];
    if (!query || !page) continue;

    const pageEntry = {
      page,
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    };
    const queryEntry = {
      query,
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    };

    if (!pagesByQuery.has(query)) pagesByQuery.set(query, []);
    if (!queriesByPage.has(page)) queriesByPage.set(page, []);

    pagesByQuery.get(query).push(pageEntry);
    queriesByPage.get(page).push(queryEntry);
  }

  const queries = queryRows
    .map(row => {
      const item = normalizeMetricRow(row, ['query']);
      const pages = (pagesByQuery.get(item.query) || []).sort(
        (a, b) => b.clicks - a.clicks || b.impressions - a.impressions
      );
      // Fragment rows are jump links to one document, so they do not compete with it.
      const impressionsByDocument = new Map();
      for (const entry of pages) {
        const document = stripFragment(entry.page);
        impressionsByDocument.set(
          document,
          (impressionsByDocument.get(document) || 0) + entry.impressions
        );
      }
      const ranked = [...impressionsByDocument.values()].sort((a, b) => b - a);
      const rankedTotal = ranked.reduce((sum, value) => sum + value, 0);
      return {
        ...item,
        isBranded: isBrandedQuery(item.query, brandPatterns),
        isDomainLike: isDomainLikeQuery(item.query),
        pageCount: ranked.length,
        secondPageShare: ranked.length > 1 && rankedTotal ? ranked[1] / rankedTotal : 0,
        topPage: pages[0] ? stripFragment(pages[0].page) : null,
        pages: pages.slice(0, 10),
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  const pages = pageRows
    .map(row => {
      const item = normalizeMetricRow(row, ['page']);
      const queriesForPage = (queriesByPage.get(item.page) || []).sort(
        (a, b) => b.impressions - a.impressions || b.clicks - a.clicks
      );
      const visibleQueryClicks = queriesForPage.reduce((sum, entry) => sum + entry.clicks, 0);
      return {
        ...item,
        visibleQueryClicks,
        hiddenQueryClicks: Math.max(0, item.clicks - visibleQueryClicks),
        queryCount: queriesForPage.length,
        topQueries: queriesForPage.slice(0, 10),
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  return { queries, pages };
}

function buildLowHangingFruit(queries) {
  return queries
    .filter(query => !query.isBranded && !query.isDomainLike)
    .filter(query => query.position > 5.5 && query.position <= 25 && query.impressions >= 30)
    .map(query => ({
      ...query,
      potentialClicks: estimatePotentialClicks(query.impressions, query.position, query.ctr),
      difficulty: query.position <= 12 ? 'easy' : query.position <= 18 ? 'medium' : 'hard',
      opportunityScore: scoreOpportunity(query),
    }))
    .sort((a, b) => b.potentialClicks - a.potentialClicks || b.impressions - a.impressions)
    .slice(0, 50);
}

function buildCtrOpportunities(queries) {
  return queries
    .filter(query => !query.isBranded && !query.isDomainLike)
    .filter(query => query.impressions >= 50)
    .filter(query => {
      if (query.position <= 1.5) return query.ctr < 0.2;
      if (query.position <= 2.5) return query.ctr < 0.1;
      if (query.position <= 3.5) return query.ctr < 0.07;
      if (query.position <= 5.5) return query.ctr < 0.04;
      return false;
    })
    .map(query => ({
      ...query,
      opportunityScore: scoreOpportunity({
        impressions: query.impressions,
        position: query.position,
        query: query.query,
      }),
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);
}

function buildPageCtrOpportunities(pages) {
  return pages
    .filter(page => page.impressions >= 100)
    .filter(page => {
      if (page.position <= 1.5) return page.ctr < 0.2;
      if (page.position <= 2.5) return page.ctr < 0.1;
      if (page.position <= 3.5) return page.ctr < 0.07;
      if (page.position <= 5.5) return page.ctr < 0.04;
      if (page.position <= 10.5) return page.ctr < 0.025;
      return false;
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);
}

function buildCannibalization(queries) {
  return queries
    .filter(query => !query.isBranded && !query.isDomainLike)
    .filter(query => query.pageCount >= 2 && query.impressions >= 20)
    .filter(query => query.secondPageShare >= MIN_SECOND_PAGE_SHARE)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);
}

function buildContentOpportunities(queries) {
  return queries
    .filter(query => !query.isBranded && !query.isDomainLike)
    .filter(query => query.impressions >= 20)
    .filter(query => query.position >= 15 && query.position <= 60)
    .filter(query => query.clicks <= Math.max(1, Math.round(query.impressions * 0.02)))
    .map(query => ({
      ...query,
      recommendedFormat: inferContentFormat(query.query),
      recommendedAction: isLikelyHomepage(query.topPage)
        ? 'Create a dedicated page or blog post instead of relying on a generic homepage/locale page'
        : 'Refresh or expand the existing destination page to match the query intent',
      opportunityScore: scoreOpportunity(query),
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.impressions - a.impressions)
    .slice(0, 40);
}

function computeDeltas(currentRows, previousRows, keyField) {
  const previousByKey = new Map(previousRows.map(row => [row[keyField], row]));
  const currentByKey = new Map(currentRows.map(row => [row[keyField], row]));
  const allKeys = new Set([...previousByKey.keys(), ...currentByKey.keys()]);

  const deltas = [];
  for (const key of allKeys) {
    const current = currentByKey.get(key);
    const previous = previousByKey.get(key);
    const currentClicks = current?.clicks || 0;
    const previousClicks = previous?.clicks || 0;
    const currentImpressions = current?.impressions || 0;
    const previousImpressions = previous?.impressions || 0;
    const currentPosition = current?.position || 0;
    const previousPosition = previous?.position || 0;

    deltas.push({
      [keyField]: key,
      currentClicks,
      previousClicks,
      clickDelta: currentClicks - previousClicks,
      currentImpressions,
      previousImpressions,
      impressionDelta: currentImpressions - previousImpressions,
      currentPosition,
      previousPosition,
      positionDelta:
        previous && current ? Number((previousPosition - currentPosition).toFixed(2)) : null,
      currentCtr: current?.ctr || 0,
      previousCtr: previous?.ctr || 0,
    });
  }
  return deltas;
}

function buildMovers(currentRows, previousRows, keyField) {
  const deltas = computeDeltas(currentRows, previousRows, keyField);
  return {
    winners: deltas
      .filter(item => item.impressionDelta > 0 || item.clickDelta > 0)
      .sort((a, b) => b.impressionDelta - a.impressionDelta || b.clickDelta - a.clickDelta)
      .slice(0, 25),
    losers: deltas
      .filter(item => item.impressionDelta < 0 || item.clickDelta < 0)
      .sort((a, b) => a.impressionDelta - b.impressionDelta || a.clickDelta - b.clickDelta)
      .slice(0, 25),
  };
}

function compareDimension(currentRows, previousRows, keyField, limit) {
  return computeDeltas(currentRows, previousRows, keyField)
    .sort((a, b) => Math.abs(b.clickDelta) - Math.abs(a.clickDelta))
    .slice(0, limit);
}

/** Splits page rows by host, locale or section. Fragment rows inflate byPage sums. */
function buildGroupComparison(currentPages, previousPages, groupKey) {
  const groupRows = rows => {
    const groups = new Map();
    for (const row of rows.filter(entry => !isFragmentRow(entry))) {
      const group = classifyUrl(row.page)[groupKey];
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(row);
    }
    return groups;
  };
  const current = groupRows(currentPages);
  const previous = groupRows(previousPages);
  const fragments = currentPages.filter(isFragmentRow);

  const rows = [...new Set([...current.keys(), ...previous.keys()])].map(group => {
    const now = aggregateMetrics(current.get(group) || []);
    const before = aggregateMetrics(previous.get(group) || []);
    return {
      group,
      pages: (current.get(group) || []).length,
      previousPages: (previous.get(group) || []).length,
      clicks: now.clicks,
      previousClicks: before.clicks,
      clickDelta: now.clicks - before.clicks,
      clickDeltaPct: percentageDelta(now.clicks, before.clicks),
      impressions: now.impressions,
      previousImpressions: before.impressions,
      impressionDeltaPct: percentageDelta(now.impressions, before.impressions),
      ctr: now.ctr,
      previousCtr: before.ctr,
      position: now.position,
      previousPosition: before.position,
    };
  });

  return {
    rows: rows
      .sort((a, b) => b.clicks + b.previousClicks - (a.clicks + a.previousClicks))
      .slice(0, SEGMENT_ROW_LIMIT),
    excludedFragmentRows: {
      rows: fragments.length,
      clicks: fragments.reduce((sum, row) => sum + row.clicks, 0),
      impressions: fragments.reduce((sum, row) => sum + row.impressions, 0),
    },
  };
}

function classifyClickChange({ positionChange, impressionChangePct, ctrChangePct }) {
  if (positionChange >= 1) return 'ranking';
  if (impressionChangePct <= -0.2) return 'demand';
  if (ctrChangePct <= -0.2) return 'ctr';
  return 'mixed';
}

/**
 * Per-page identity: clicks1 - clicks0 = (imp1 - imp0) * ctr0 + (ctr1 - ctr0) * imp1.
 * The cause labels are heuristics for triage, so confirm a page before an edit.
 */
function buildClickChangeDecomposition(currentPages, previousPages) {
  const byPage = rows => new Map(rows.filter(row => !isFragmentRow(row)).map(r => [r.page, r]));
  const current = byPage(currentPages);
  const previous = byPage(previousPages);
  const rows = [];
  const clickDeltaByCause = { ranking: 0, demand: 0, ctr: 0, mixed: 0 };
  let volumeEffect = 0;
  let ctrEffect = 0;
  let newPageClicks = 0;
  let lostPageClicks = 0;

  for (const [page, now] of current) {
    const before = previous.get(page);
    if (!before) {
      newPageClicks += now.clicks;
      rows.push({ page, clickDelta: now.clicks, cause: 'new_page' });
      continue;
    }
    const ctrNow = now.impressions ? now.clicks / now.impressions : 0;
    const ctrBefore = before.impressions ? before.clicks / before.impressions : 0;
    const clickDelta = now.clicks - before.clicks;
    const cause = classifyClickChange({
      positionChange: now.position - before.position,
      impressionChangePct: before.impressions
        ? (now.impressions - before.impressions) / before.impressions
        : 0,
      ctrChangePct: ctrBefore ? (ctrNow - ctrBefore) / ctrBefore : 0,
    });
    volumeEffect += (now.impressions - before.impressions) * ctrBefore;
    ctrEffect += (ctrNow - ctrBefore) * now.impressions;
    clickDeltaByCause[cause] += clickDelta;
    rows.push({
      page,
      clickDelta,
      cause,
      clicks: now.clicks,
      previousClicks: before.clicks,
      impressions: now.impressions,
      previousImpressions: before.impressions,
      ctr: ctrNow,
      previousCtr: ctrBefore,
      position: now.position,
      previousPosition: before.position,
    });
  }
  for (const [page, before] of previous) {
    if (current.has(page)) continue;
    lostPageClicks += before.clicks;
    rows.push({ page, clickDelta: -before.clicks, cause: 'lost_page' });
  }

  return {
    clickDelta: rows.reduce((sum, row) => sum + row.clickDelta, 0),
    volumeEffect,
    ctrEffect,
    newPageClicks,
    lostPageClicks,
    clickDeltaByCause,
    topLosses: rows
      .filter(row => row.clickDelta < 0)
      .sort((a, b) => a.clickDelta - b.clickDelta)
      .slice(0, 20),
    topGains: rows
      .filter(row => row.clickDelta > 0)
      .sort((a, b) => b.clickDelta - a.clickDelta)
      .slice(0, 10),
  };
}

function buildPositionBuckets(queries) {
  const buckets = Object.fromEntries(
    POSITION_BUCKETS.map(({ label }) => [label, { queries: 0, clicks: 0, impressions: 0 }])
  );
  for (const row of queries) {
    const { label } = POSITION_BUCKETS.find(bucket => row.position <= bucket.maxPosition);
    buckets[label].queries += 1;
    buckets[label].clicks += row.clicks;
    buckets[label].impressions += row.impressions;
  }
  return buckets;
}

function buildAnonymizedTraffic(pages) {
  return pages
    .filter(page => !isFragmentRow(page) && page.hiddenQueryClicks > 0)
    .sort((a, b) => b.hiddenQueryClicks - a.hiddenQueryClicks)
    .slice(0, 15)
    .map(({ page, clicks, visibleQueryClicks, hiddenQueryClicks }) => ({
      page,
      clicks,
      visibleQueryClicks,
      hiddenQueryClicks,
    }));
}

function buildLongTrend(dailyRows, endDate) {
  const summarize = rows => {
    const metrics = aggregateMetrics(rows);
    return {
      clicks: metrics.clicks,
      impressions: metrics.impressions,
      ctr: Number(metrics.ctr.toFixed(4)),
      position: Number(metrics.position.toFixed(2)),
      days: rows.length,
    };
  };
  const rangeRows = (from, to) => dailyRows.filter(row => row.date >= from && row.date <= to);

  const months = new Map();
  for (const row of dailyRows) {
    const month = row.date.slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(row);
  }

  const weeks = [];
  for (let index = 0; index < 26; index += 1) {
    const to = shiftDateString(endDate, -7 * index);
    const from = shiftDateString(to, -6);
    const rows = rangeRows(from, to);
    if (rows.length) weeks.unshift({ startDate: from, endDate: to, ...summarize(rows) });
  }

  const windowStart = shiftDateString(endDate, -27);
  const lastYearRows = rangeRows(
    shiftDateString(windowStart, -364),
    shiftDateString(endDate, -364)
  );
  return {
    months: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, rows]) => ({ month, ...summarize(rows) })),
    weeks,
    yearOverYear:
      lastYearRows.length === 28
        ? {
            current: summarize(rangeRows(windowStart, endDate)),
            previousYear: summarize(lastYearRows),
          }
        : null,
  };
}

async function fetchLongTrend({ accessToken, siteUrl, type, endDate, rowLimit }) {
  const rows = await queryAllSearchAnalyticsRows({
    accessToken,
    siteUrl,
    requestBody: {
      startDate: shiftDateString(endDate, -HISTORY_DAYS),
      endDate,
      dimensions: ['date'],
      type,
      dataState: 'final',
    },
    rowLimit,
    optional: true,
    label: `${type} long trend`,
  });
  return buildLongTrend(
    rows.map(row => normalizeMetricRow(row, ['date'])).sort((a, b) => a.date.localeCompare(b.date)),
    endDate
  );
}

/** The final dataset holds back recent days. These rows are partial and can still change. */
async function fetchFreshness({ accessToken, siteUrl, type, today }) {
  const fetchRows = (startDate, dimension, dataState) =>
    querySearchAnalytics({
      accessToken,
      siteUrl,
      requestBody: { startDate, endDate: today, dimensions: [dimension], type, dataState },
      optional: true,
      label: `${type} freshness ${dimension}`,
    });
  const [daily, hourly] = await Promise.all([
    fetchRows(shiftDateString(today, -6), 'date', 'all'),
    fetchRows(shiftDateString(today, -2), 'hour', 'hourly_all'),
  ]);
  const hours = (hourly.rows || [])
    .map(row => normalizeMetricRow(row, ['hour']))
    .sort((a, b) => a.hour.localeCompare(b.hour));
  return {
    firstIncompleteDate: daily.metadata?.firstIncompleteDate || null,
    firstIncompleteHour: hourly.metadata?.firstIncompleteHour || null,
    days: (daily.rows || []).map(row => normalizeMetricRow(row, ['date'])),
    last24Hours: aggregateMetrics(hours.slice(-24)),
    previous24Hours: aggregateMetrics(hours.slice(-48, -24)),
  };
}

function parseSitemapLocs(xml) {
  return [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(match =>
    match[1].replace(/&amp;/g, '&')
  );
}

async function fetchSitemapXml(sitemapPath, retryBaseMs) {
  let message = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(sitemapPath, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return await response.text();
      message = `HTTP ${response.status}`;
    } catch (error) {
      message = error.message;
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, retryBaseMs * 2 ** (attempt - 1)));
    }
  }
  fetchFailures.push({ label: `sitemap ${sitemapPath}`, status: null, message });
  return null;
}

/** Low concurrency on purpose: a burst of 46 child sitemaps returned 503 from production. */
async function fetchSitemapUrls(sitemapPaths, retryBaseMs = RETRY_BASE_MS) {
  const urls = new Set();
  const seen = new Set();
  const queue = sitemapPaths.slice();

  while (queue.length) {
    const batch = queue.splice(0, SITEMAP_CONCURRENCY).filter(path => !seen.has(path));
    batch.forEach(path => seen.add(path));
    await Promise.all(
      batch.map(async sitemapPath => {
        const xml = await fetchSitemapXml(sitemapPath, retryBaseMs);
        if (xml === null) return;
        const locs = parseSitemapLocs(xml);
        if (/<sitemapindex/.test(xml)) queue.push(...locs);
        else locs.forEach(url => urls.add(url));
      })
    );
  }
  return [...urls];
}

function buildSitemapCoverage(sitemapUrls, pages) {
  const normalize = url => stripFragment(url).replace(/\/$/, '');
  const submitted = new Set(sitemapUrls.map(normalize));
  const withTraffic = new Set(
    pages.filter(page => page.impressions > 0).map(page => normalize(page.page))
  );
  const silent = sitemapUrls.filter(url => !withTraffic.has(normalize(url)));
  const outside = pages
    .filter(page => !isFragmentRow(page) && !submitted.has(normalize(page.page)))
    .sort((a, b) => b.impressions - a.impressions);
  const tally = values => {
    const counts = {};
    for (const value of values) counts[value] = (counts[value] || 0) + 1;
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
  };

  return {
    submitted: sitemapUrls.length,
    withImpressions: sitemapUrls.length - silent.length,
    zeroImpressionCount: silent.length,
    zeroImpressionBySection: tally(silent.map(url => classifyUrl(url).section)),
    zeroImpressionUrls: silent,
    outsideSitemapCount: outside.length,
    outsideSitemap: outside.slice(0, 30).map(({ page, clicks, impressions, position }) => ({
      page,
      clicks,
      impressions,
      position,
    })),
  };
}

function buildDataCompleteness(primary) {
  const total = primary?.summary?.current || { clicks: 0, impressions: 0 };
  const queries = primary?.queries || [];
  const visibleClicks = queries.reduce((sum, row) => sum + row.clicks, 0);
  const visibleImpressions = queries.reduce((sum, row) => sum + row.impressions, 0);
  const share = (part, whole) => (whole ? Number((part / whole).toFixed(4)) : null);
  return {
    complete: fetchFailures.length === 0,
    fetchFailures: fetchFailures.slice(),
    queryClickCoverage: share(visibleClicks, total.clicks),
    queryImpressionCoverage: share(visibleImpressions, total.impressions),
    anonymizedClicks: Math.max(0, total.clicks - visibleClicks),
    anonymizedImpressions: Math.max(0, total.impressions - visibleImpressions),
    queryRows: queries.length,
    pageRows: primary?.pages?.length || 0,
    apiBlindSpots: UI_ONLY_REPORTS,
  };
}

function summarizeSearchAppearance(rows) {
  return rows
    .map(row => normalizeMetricRow(row, ['appearance']))
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
}

async function fetchAppearanceBreakdown({
  accessToken,
  siteUrl,
  type,
  range,
  rowLimit,
  appearanceLimit,
}) {
  if (!SEARCH_APPEARANCE_TYPES.has(type) || appearanceLimit <= 0) {
    return [];
  }

  const appearanceRows = await queryAllSearchAnalyticsRows({
    accessToken,
    siteUrl,
    requestBody: {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ['searchAppearance'],
      type,
      dataState: 'final',
    },
    rowLimit,
    optional: true,
    label: `${type} search appearance`,
  });

  const appearances = summarizeSearchAppearance(appearanceRows).slice(0, appearanceLimit);
  const detailedAppearances = [];

  for (const appearance of appearances) {
    const pageRows = await queryAllSearchAnalyticsRows({
      accessToken,
      siteUrl,
      requestBody: {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ['page'],
        type,
        aggregationType: 'byPage',
        dataState: 'final',
        dimensionFilterGroups: [
          {
            filters: [
              {
                dimension: 'searchAppearance',
                operator: 'equals',
                expression: appearance.appearance,
              },
            ],
          },
        ],
      },
      rowLimit,
      optional: true,
      label: `${type} ${appearance.appearance} pages`,
    });

    detailedAppearances.push({
      ...appearance,
      topPages: pageRows
        .map(row => normalizeMetricRow(row, ['page']))
        .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
        .slice(0, 10),
    });
  }

  return detailedAppearances;
}

async function fetchTypeDataset({ accessToken, siteUrl, type, ranges, rowLimit, appearanceLimit }) {
  const [currentSummary, previousSummary] = await Promise.all([
    fetchSummary({ accessToken, siteUrl, type, range: ranges.current, optional: true }),
    fetchSummary({ accessToken, siteUrl, type, range: ranges.previous, optional: true }),
  ]);

  const hasAnyTraffic = currentSummary.impressions > 0 || previousSummary.impressions > 0;
  const summaryComparison = buildSummaryComparison(currentSummary, previousSummary);

  if (!hasAnyTraffic) {
    return {
      type,
      hasAnyTraffic: false,
      supportsFullDetails: FULL_DETAIL_TYPES.has(type),
      summary: summaryComparison,
      dailyTrend: [],
      queries: [],
      pages: [],
      lowHangingFruit: [],
      ctrOpportunities: [],
      pageCtrOpportunities: [],
      contentOpportunities: [],
      cannibalization: [],
      queryMovers: { winners: [], losers: [] },
      pageMovers: { winners: [], losers: [] },
      devices: [],
      countries: [],
      searchAppearance: [],
    };
  }

  const [
    dailyRows,
    deviceRows,
    countryRows,
    queryRows,
    pageRows,
    queryPageRows,
    previousQueryRows,
    previousPageRows,
    searchAppearance,
    previousDeviceRows,
    previousCountryRows,
    dateQueryRows,
    datePageRows,
  ] = await Promise.all([
    queryAllSearchAnalyticsRows({
      accessToken,
      siteUrl,
      requestBody: {
        startDate: ranges.current.startDate,
        endDate: ranges.current.endDate,
        dimensions: ['date'],
        type,
        dataState: 'final',
      },
      rowLimit,
      optional: true,
      label: `${type} daily trend`,
    }),
    queryAllSearchAnalyticsRows({
      accessToken,
      siteUrl,
      requestBody: {
        startDate: ranges.current.startDate,
        endDate: ranges.current.endDate,
        dimensions: ['device'],
        type,
        dataState: 'final',
      },
      rowLimit,
      optional: true,
      label: `${type} device`,
    }),
    queryAllSearchAnalyticsRows({
      accessToken,
      siteUrl,
      requestBody: {
        startDate: ranges.current.startDate,
        endDate: ranges.current.endDate,
        dimensions: ['country'],
        type,
        dataState: 'final',
      },
      rowLimit,
      optional: true,
      label: `${type} country`,
    }),
    FULL_DETAIL_TYPES.has(type)
      ? queryAllSearchAnalyticsRows({
          accessToken,
          siteUrl,
          requestBody: {
            startDate: ranges.current.startDate,
            endDate: ranges.current.endDate,
            dimensions: ['query'],
            type,
            dataState: 'final',
          },
          rowLimit,
          optional: true,
          label: `${type} queries`,
        })
      : Promise.resolve([]),
    FULL_DETAIL_TYPES.has(type)
      ? queryAllSearchAnalyticsRows({
          accessToken,
          siteUrl,
          requestBody: {
            startDate: ranges.current.startDate,
            endDate: ranges.current.endDate,
            dimensions: ['page'],
            aggregationType: 'byPage',
            type,
            dataState: 'final',
          },
          rowLimit,
          optional: true,
          label: `${type} pages`,
        })
      : Promise.resolve([]),
    FULL_DETAIL_TYPES.has(type)
      ? queryAllSearchAnalyticsRows({
          accessToken,
          siteUrl,
          requestBody: {
            startDate: ranges.current.startDate,
            endDate: ranges.current.endDate,
            dimensions: ['query', 'page'],
            type,
            dataState: 'final',
          },
          rowLimit,
          optional: true,
          label: `${type} query+page`,
        })
      : Promise.resolve([]),
    FULL_DETAIL_TYPES.has(type)
      ? queryAllSearchAnalyticsRows({
          accessToken,
          siteUrl,
          requestBody: {
            startDate: ranges.previous.startDate,
            endDate: ranges.previous.endDate,
            dimensions: ['query'],
            type,
            dataState: 'final',
          },
          rowLimit,
          optional: true,
          label: `${type} previous queries`,
        })
      : Promise.resolve([]),
    FULL_DETAIL_TYPES.has(type)
      ? queryAllSearchAnalyticsRows({
          accessToken,
          siteUrl,
          requestBody: {
            startDate: ranges.previous.startDate,
            endDate: ranges.previous.endDate,
            dimensions: ['page'],
            aggregationType: 'byPage',
            type,
            dataState: 'final',
          },
          rowLimit,
          optional: true,
          label: `${type} previous pages`,
        })
      : Promise.resolve([]),
    fetchAppearanceBreakdown({
      accessToken,
      siteUrl,
      type,
      range: ranges.current,
      rowLimit,
      appearanceLimit,
    }),
    ...['device', 'country'].map(dimension =>
      queryAllSearchAnalyticsRows({
        accessToken,
        siteUrl,
        requestBody: {
          startDate: ranges.previous.startDate,
          endDate: ranges.previous.endDate,
          dimensions: [dimension],
          type,
          dataState: 'final',
        },
        rowLimit,
        optional: true,
        label: `${type} previous ${dimension}`,
      })
    ),
    ...[
      ['date', 'query'],
      ['date', 'page'],
    ].map(dimensions =>
      FULL_DETAIL_TYPES.has(type)
        ? queryAllSearchAnalyticsRows({
            accessToken,
            siteUrl,
            requestBody: {
              startDate: ranges.current.startDate,
              endDate: ranges.current.endDate,
              dimensions,
              type,
              dataState: 'final',
            },
            rowLimit,
            optional: true,
            label: `${type} ${dimensions.join('+')}`,
          })
        : Promise.resolve([])
    ),
  ]);

  const dailyTrend = dailyRows
    .map(row => normalizeMetricRow(row, ['date']))
    .sort((a, b) => a.date.localeCompare(b.date));

  const devices = addShares(
    deviceRows
      .map(row => normalizeMetricRow(row, ['device']))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
    'impressions'
  );

  const countries = addShares(
    countryRows
      .map(row => normalizeMetricRow(row, ['country']))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 50),
    'impressions'
  );

  const brandPatterns = buildBrandPatterns(siteUrl);
  const joined = joinQueryPageData(queryRows, pageRows, queryPageRows, brandPatterns);
  const phantomDimensionEvidence = await fetchPhantomDimensionEvidence({
    accessToken,
    siteUrl,
    type,
    range: ranges.current,
    rowLimit,
    queries: joined.queries,
  });
  const quarantine = quarantinePhantomQueries(
    joined.queries,
    currentSummary,
    phantomDimensionEvidence
  );
  const queries = quarantine.queries;
  const pages = joined.pages;
  const nonBrandedQueries = queries.filter(query => !query.isBranded && !query.isDomainLike);
  const previousQueries = previousQueryRows.map(row => normalizeMetricRow(row, ['query']));
  const previousPages = previousPageRows.map(row => normalizeMetricRow(row, ['page']));
  summaryComparison.brandSplit = buildBrandSplit(
    queries,
    previousQueries,
    siteUrl,
    currentSummary,
    previousSummary
  );
  summaryComparison.ctrExQuarantine = quarantine.ctrExQuarantine;
  summaryComparison.positionExQuarantine = quarantine.positionExQuarantine;
  summaryComparison.previousQuarantine = buildPreviousQuarantine(previousQueries, previousSummary);
  summaryComparison.stableCohortPosition = buildStableCohortPosition(pages, previousPages);

  const lowHangingFruit = buildLowHangingFruit(queries);
  const ctrOpportunities = buildCtrOpportunities(queries);
  const pageCtrOpportunities = buildPageCtrOpportunities(pages);
  const contentOpportunities = buildContentOpportunities(queries);
  const cannibalization = buildCannibalization(queries);
  const queryMovers = buildMovers(queries, previousQueries, 'query');
  const pageMovers = buildMovers(pages, previousPages, 'page');
  const weeklyBreakdown = buildWeeklyBreakdown({
    dailyTrend,
    dateQueryRows: dateQueryRows.map(row => normalizeMetricRow(row, ['date', 'query'])),
    datePageRows: datePageRows.map(row => normalizeMetricRow(row, ['date', 'page'])),
    endDate: ranges.current.endDate,
    site: siteUrl,
  });
  const allCountries = countryRows.map(row => normalizeMetricRow(row, ['country']));

  return {
    type,
    hasAnyTraffic: true,
    supportsFullDetails: FULL_DETAIL_TYPES.has(type),
    summary: summaryComparison,
    dailyTrend,
    devices,
    countries,
    queries,
    quarantinedQueries: quarantine.quarantinedQueries,
    nonBrandedQueries,
    pages,
    lowHangingFruit,
    ctrOpportunities,
    pageCtrOpportunities,
    contentOpportunities,
    cannibalization,
    queryMovers,
    pageMovers,
    weeklyBreakdown,
    searchAppearance,
    deviceComparison: compareDimension(
      devices,
      previousDeviceRows.map(row => normalizeMetricRow(row, ['device'])),
      'device',
      3
    ),
    countryComparison: compareDimension(
      allCountries,
      previousCountryRows.map(row => normalizeMetricRow(row, ['country'])),
      'country',
      25
    ),
    sectionBreakdown: buildGroupComparison(pages, previousPages, 'section'),
    localeBreakdown: buildGroupComparison(pages, previousPages, 'locale'),
    hostBreakdown: buildGroupComparison(pages, previousPages, 'host'),
    positionBuckets: {
      current: buildPositionBuckets(queries),
      previous: buildPositionBuckets(previousQueries),
    },
    clickChangeDecomposition: buildClickChangeDecomposition(pages, previousPages),
    anonymizedTraffic: buildAnonymizedTraffic(pages),
  };
}

async function listSitemaps({ accessToken, siteUrl }) {
  const response = await googleRequest({
    url: `${WEBMASTERS_BASE_URL}/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
    accessToken,
    optional: true,
    label: 'sitemaps.list',
  });

  return (response?.sitemap || []).map(sitemap => ({
    path: sitemap.path,
    lastSubmitted: sitemap.lastSubmitted,
    lastDownloaded: sitemap.lastDownloaded,
    isPending: sitemap.isPending,
    warnings: sitemap.warnings,
    errors: sitemap.errors,
    contents: sitemap.contents || [],
  }));
}

function summarizeSitemaps(sitemaps) {
  return {
    total: sitemaps.length,
    pending: sitemaps.filter(sitemap => sitemap.isPending).length,
    withErrors: sitemaps.filter(sitemap => (sitemap.errors || 0) > 0).length,
    withWarnings: sitemaps.filter(sitemap => (sitemap.warnings || 0) > 0).length,
  };
}

/** Round-robin across lists, so losers and silent URLs are inspected and not only winners. */
function pickInspectionTargets(primaryDataset, maxTargets, silentUrls = []) {
  if (!primaryDataset || maxTargets <= 0) return [];

  const lists = [
    (primaryDataset.pageMovers?.losers || []).map(item => item.page),
    primaryDataset.lowHangingFruit.map(item => item.topPage),
    primaryDataset.pageCtrOpportunities.map(item => item.page),
    silentUrls,
    primaryDataset.pages
      .slice()
      .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
      .map(item => item.page),
  ].map(list => list.filter(Boolean).map(stripFragment));

  const targets = new Set();
  const longest = Math.max(...lists.map(list => list.length));
  for (let index = 0; index < longest && targets.size < maxTargets; index += 1) {
    for (const list of lists) {
      if (targets.size >= maxTargets) break;
      if (index < list.length) targets.add(list[index]);
    }
  }
  return [...targets];
}

function mapInspectionResult(url, inspectionResult) {
  const indexStatus = inspectionResult.indexStatusResult || {};
  const mobile = inspectionResult.mobileUsabilityResult || {};
  const richResults = inspectionResult.richResultsResult || {};

  return {
    url,
    inspectionResultLink: inspectionResult.inspectionResultLink || null,
    verdict: indexStatus.verdict || null,
    coverageState: indexStatus.coverageState || null,
    robotsTxtState: indexStatus.robotsTxtState || null,
    indexingState: indexStatus.indexingState || null,
    lastCrawlTime: indexStatus.lastCrawlTime || null,
    pageFetchState: indexStatus.pageFetchState || null,
    googleCanonical: indexStatus.googleCanonical || null,
    userCanonical: indexStatus.userCanonical || null,
    canonicalMismatch:
      Boolean(indexStatus.googleCanonical) &&
      Boolean(indexStatus.userCanonical) &&
      indexStatus.googleCanonical !== indexStatus.userCanonical,
    crawledAs: indexStatus.crawledAs || null,
    sitemap: indexStatus.sitemap || [],
    referringUrls: indexStatus.referringUrls || [],
    mobileUsabilityVerdict: mobile.verdict || null,
    mobileUsabilityIssues: (mobile.issues || []).map(issue => ({
      issueType: issue.issueType || null,
      message: issue.message || null,
    })),
    richResultsVerdict: richResults.verdict || null,
    richResultTypes: (richResults.detectedItems || [])
      .map(item => item.richResultType)
      .filter(Boolean),
    richResultsIssueCount: (richResults.detectedItems || []).reduce(
      (count, item) =>
        count +
        (item.items || []).reduce((itemCount, child) => itemCount + (child.issues || []).length, 0),
      0
    ),
  };
}

function countBy(items, keySelector) {
  const counts = {};
  for (const item of items) {
    const key = keySelector(item) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function summarizeInspections(inspections) {
  return {
    totalInspected: inspections.length,
    verdictCounts: countBy(inspections, item => item.verdict),
    coverageCounts: countBy(inspections, item => item.coverageState),
    fetchStateCounts: countBy(inspections, item => item.pageFetchState),
    staleCrawlPages: inspections
      .filter(
        item =>
          item.lastCrawlTime &&
          Date.now() - new Date(item.lastCrawlTime).getTime() > STALE_CRAWL_DAYS * 86400000
      )
      .map(item => ({ url: item.url, lastCrawlTime: item.lastCrawlTime })),
    canonicalMismatches: inspections.filter(item => item.canonicalMismatch).map(item => item.url),
    pagesMissingFromKnownSitemaps: inspections
      .filter(item => !item.sitemap.length)
      .map(item => item.url),
    blockedOrBrokenPages: inspections
      .filter(item => item.pageFetchState && item.pageFetchState !== 'SUCCESSFUL')
      .map(item => ({
        url: item.url,
        pageFetchState: item.pageFetchState,
        coverageState: item.coverageState,
      })),
    nonPassingPages: inspections
      .filter(item => item.verdict && item.verdict !== 'PASS')
      .map(item => ({
        url: item.url,
        verdict: item.verdict,
        coverageState: item.coverageState,
      })),
  };
}

async function inspectPriorityPages({ accessToken, siteUrl, urls }) {
  const inspections = [];
  let next = 0;

  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next];
      next += 1;
      const response = await googleRequest({
        method: 'POST',
        url: `${SEARCH_CONSOLE_BASE_URL}/urlInspection/index:inspect`,
        accessToken,
        body: {
          inspectionUrl: url,
          siteUrl,
          languageCode: 'en-US',
        },
        optional: true,
        label: `urlInspection ${url}`,
      });

      if (response?.inspectionResult) {
        inspections.push(mapInspectionResult(url, response.inspectionResult));
      }
    }
  };
  await Promise.all(Array.from({ length: INSPECTION_CONCURRENCY }, worker));

  return {
    inspectedPages: inspections,
    summary: summarizeInspections(inspections),
  };
}

function buildSearchTypeSummary(searchTypes) {
  return Object.fromEntries(
    Object.entries(searchTypes).map(([type, dataset]) => [
      type,
      {
        clicks: dataset.summary.current.clicks,
        impressions: dataset.summary.current.impressions,
        ctr: dataset.summary.current.ctr,
        position: dataset.summary.current.position,
        clickDeltaPct: dataset.summary.deltaPct.clicks,
        impressionDeltaPct: dataset.summary.deltaPct.impressions,
        brandSplit: dataset.summary.brandSplit,
        ctrExQuarantine: dataset.summary.ctrExQuarantine,
        positionExQuarantine: dataset.summary.positionExQuarantine,
        stableCohortPosition: dataset.summary.stableCohortPosition,
      },
    ])
  );
}

function buildGrowthOverview(searchTypes, primaryType) {
  const primary = searchTypes[primaryType];
  const quickWins = [];
  const contentCreation = [];
  const ctr = [];
  const cannibalization = [];

  for (const [type, dataset] of Object.entries(searchTypes)) {
    dataset.lowHangingFruit.slice(0, 15).forEach(item => quickWins.push({ type, ...item }));
    dataset.contentOpportunities
      .slice(0, 15)
      .forEach(item => contentCreation.push({ type, ...item }));
    dataset.ctrOpportunities.slice(0, 10).forEach(item => ctr.push({ type, ...item }));
    dataset.cannibalization.slice(0, 10).forEach(item => cannibalization.push({ type, ...item }));
  }

  return {
    primaryType,
    quickWins: quickWins
      .sort((a, b) => b.potentialClicks - a.potentialClicks || b.impressions - a.impressions)
      .slice(0, 30),
    contentCreation: contentCreation
      .sort((a, b) => b.opportunityScore - a.opportunityScore || b.impressions - a.impressions)
      .slice(0, 30),
    ctr: ctr.sort((a, b) => b.impressions - a.impressions).slice(0, 20),
    cannibalization: cannibalization.sort((a, b) => b.impressions - a.impressions).slice(0, 20),
    primaryDecliningQueries: primary?.queryMovers?.losers?.slice(0, 15) || [],
    primaryDecliningPages: primary?.pageMovers?.losers?.slice(0, 15) || [],
  };
}

async function main() {
  const args = parseArgs();
  const keyFile = findKeyFile(args.key);
  const siteUrl = `sc-domain:${args.site}`;
  const dateRanges = buildDateRanges(args.days, args.lagDays);

  console.error(`[GSC] Site: ${args.site}`);
  console.error(`[GSC] Key: ${keyFile}`);
  console.error(
    `[GSC] Current range: ${dateRanges.current.startDate} -> ${dateRanges.current.endDate} (${args.days} days, Pacific time)`
  );
  console.error(
    `[GSC] Previous range: ${dateRanges.previous.startDate} -> ${dateRanges.previous.endDate}`
  );
  console.error(`[GSC] Search types: ${args.searchTypes.join(', ')}`);

  const accessToken = await createAccessToken(keyFile);

  console.error('[GSC] Checking API access...');
  const sites = await listSites(accessToken);
  const matchingSite = sites.find(site => site.siteUrl === siteUrl);
  if (matchingSite) {
    console.error(`[GSC] Access confirmed: ${matchingSite.permissionLevel}`);
  } else {
    console.error(`WARNING: ${siteUrl} not found in verified sites. Attempting requests anyway.`);
  }

  const searchTypes = {};
  for (const type of args.searchTypes) {
    console.error(`[GSC] Fetching ${type} data...`);
    searchTypes[type] = await fetchTypeDataset({
      accessToken,
      siteUrl,
      type,
      ranges: dateRanges,
      rowLimit: args.rowLimit,
      appearanceLimit: args.appearanceLimit,
    });
  }

  console.error('[GSC] Fetching sitemaps...');
  const sitemaps = await listSitemaps({ accessToken, siteUrl });

  const primaryType = searchTypes[args.primaryType]
    ? args.primaryType
    : Object.keys(searchTypes)[0];
  const primaryDataset = searchTypes[primaryType];

  console.error('[GSC] Reconciling sitemap URLs with traffic...');
  const sitemapUrls = await fetchSitemapUrls(sitemaps.map(sitemap => sitemap.path));
  const sitemapCoverage = buildSitemapCoverage(sitemapUrls, primaryDataset?.pages || []);
  const inspectionTargets = [
    ...new Set([
      ...pickInspectionTargets(
        primaryDataset,
        args.inspectTopPages,
        sitemapCoverage.zeroImpressionUrls
      ),
      ...(args.inspectSitemap ? sitemapUrls : []),
    ]),
  ];

  let indexing = { inspectedPages: [], summary: { totalInspected: 0 } };
  if (inspectionTargets.length) {
    console.error(`[GSC] Inspecting ${inspectionTargets.length} priority URLs...`);
    indexing = await inspectPriorityPages({ accessToken, siteUrl, urls: inspectionTargets });
  }

  console.error('[GSC] Fetching long trend and fresh data...');
  const [longTrend, freshness] = await Promise.all([
    fetchLongTrend({
      accessToken,
      siteUrl,
      type: primaryType,
      endDate: dateRanges.current.endDate,
      rowLimit: args.rowLimit,
    }),
    fetchFreshness({ accessToken, siteUrl, type: primaryType, today: dateRanges.pacificToday }),
  ]);

  const growthOverview = buildGrowthOverview(searchTypes, primaryType);
  const searchTypeSummary = buildSearchTypeSummary(searchTypes);

  const output = {
    meta: {
      site: args.site,
      siteUrl,
      fetchedAt: new Date().toISOString(),
      dateRanges,
      keyFile,
      searchTypesRequested: args.searchTypes,
      primaryType,
      rowLimit: args.rowLimit,
      inspectTopPages: args.inspectTopPages,
      appearanceLimit: args.appearanceLimit,
      apiMode: 'native-rest',
    },
    dataCompleteness: buildDataCompleteness(primaryDataset),
    summary: {
      totalClicks: primaryDataset?.summary?.current?.clicks || 0,
      totalImpressions: primaryDataset?.summary?.current?.impressions || 0,
      averageCtr: primaryDataset?.summary?.current?.ctr || 0,
      averagePosition: primaryDataset?.summary?.current?.position || 0,
      avgCtr: primaryDataset?.summary?.current?.ctr || 0,
      avgPosition: primaryDataset?.summary?.current?.position || 0,
      totalQueries: primaryDataset?.queries?.length || 0,
      totalPages: primaryDataset?.pages?.length || 0,
      previousClicks: primaryDataset?.summary?.previous?.clicks || 0,
      previousImpressions: primaryDataset?.summary?.previous?.impressions || 0,
      clicksDeltaPct: primaryDataset?.summary?.deltaPct?.clicks ?? null,
      impressionsDeltaPct: primaryDataset?.summary?.deltaPct?.impressions ?? null,
      brandSplit: primaryDataset?.summary?.brandSplit || null,
      ctrExQuarantine: primaryDataset?.summary?.ctrExQuarantine ?? null,
      positionExQuarantine: primaryDataset?.summary?.positionExQuarantine ?? null,
      stableCohortPosition: primaryDataset?.summary?.stableCohortPosition || null,
    },
    comparison: primaryDataset?.summary || null,
    searchTypeSummary,
    searchTypes,
    growthOverview,
    dailyTrend: primaryDataset?.dailyTrend || [],
    weeklyBreakdown: primaryDataset?.weeklyBreakdown || null,
    longTrend,
    freshness,
    clickChangeDecomposition: primaryDataset?.clickChangeDecomposition || null,
    sectionBreakdown: primaryDataset?.sectionBreakdown || null,
    localeBreakdown: primaryDataset?.localeBreakdown || null,
    hostBreakdown: primaryDataset?.hostBreakdown || null,
    positionBuckets: primaryDataset?.positionBuckets || null,
    deviceComparison: primaryDataset?.deviceComparison || [],
    countryComparison: primaryDataset?.countryComparison || [],
    anonymizedTraffic: primaryDataset?.anonymizedTraffic || [],
    devices: primaryDataset?.devices || [],
    deviceBreakdown: primaryDataset?.devices || [],
    countries: primaryDataset?.countries || [],
    countryBreakdown: primaryDataset?.countries || [],
    searchAppearance: primaryDataset?.searchAppearance || [],
    topQueries: (primaryDataset?.queries || []).slice(0, 100),
    topNonBrandedQueries: (primaryDataset?.nonBrandedQueries || []).slice(0, 100),
    quarantinedQueries: primaryDataset?.quarantinedQueries || [],
    topPages: (primaryDataset?.pages || []).slice(0, 100),
    lowHangingFruit: primaryDataset?.lowHangingFruit || [],
    ctrOpportunities: primaryDataset?.ctrOpportunities || [],
    ctrOptimization: primaryDataset?.ctrOpportunities || [],
    pageCtrOpportunities: primaryDataset?.pageCtrOpportunities || [],
    contentOpportunities: primaryDataset?.contentOpportunities || [],
    cannibalization: primaryDataset?.cannibalization || [],
    indexing,
    sitemaps,
    sitemapSummary: summarizeSitemaps(sitemaps),
    sitemapCoverage,
  };

  const json = JSON.stringify(output, null, 2);
  if (args.output) {
    fs.writeFileSync(args.output, json);
    console.error(
      `[GSC] Data written to ${args.output} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`
    );
  } else {
    process.stdout.write(json);
  }

  if (fetchFailures.length) {
    console.error(
      `[GSC] INCOMPLETE: ${fetchFailures.length} request(s) failed. See dataCompleteness.`
    );
  }
  console.error('[GSC] Done!');
}

if (require.main === module) {
  main().catch(error => {
    console.error('FATAL:', error.message || error);
    process.exit(1);
  });
}

module.exports = {
  PHANTOM_IMPRESSION_THRESHOLD,
  PHANTOM_CTR_THRESHOLD,
  aggregateMetrics,
  buildBrandPatterns,
  buildBrandSplit,
  buildCannibalization,
  buildClickChangeDecomposition,
  buildDataCompleteness,
  buildGroupComparison,
  buildLongTrend,
  buildLowHangingFruit,
  buildPositionBuckets,
  buildSitemapCoverage,
  buildStableCohortPosition,
  buildWeeklyBreakdown,
  estimatePotentialClicks,
  fetchFailures,
  fetchSitemapUrls,
  googleRequest,
  joinQueryPageData,
  parseSitemapLocs,
  pickInspectionTargets,
  quarantinePhantomQueries,
  buildPreviousQuarantine,
  queryAllSearchAnalyticsRows,
};
