#!/usr/bin/env node
/**
 * Standalone GSC Growth Data Fetcher
 *
 * Pulls enough Search Console data to support traffic-growth decisions:
 * - search type segmentation (web/image/video/news/discover/googleNews)
 * - current vs previous period comparisons
 * - query/page/query+page exports
 * - device/country/search appearance breakdowns
 * - optional URL inspection for priority pages
 * - sitemap metadata
 *
 * Auth uses a service account JSON key and native Node.js fetch/crypto only.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const WEBMASTERS_BASE_URL = "https://www.googleapis.com/webmasters/v3";
const SEARCH_CONSOLE_BASE_URL = "https://searchconsole.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const DEFAULT_LAG_DAYS = 3;
const DEFAULT_DAYS = 28;
const DEFAULT_ROW_LIMIT = 25000;
const DEFAULT_SEARCH_TYPES = ["web", "image", "video", "news", "discover", "googleNews"];
const FULL_DETAIL_TYPES = new Set(["web", "image", "video", "news"]);
const SEARCH_APPEARANCE_TYPES = new Set(["web", "image", "video", "news"]);
const PACIFIC_TIMEZONE = "America/Los_Angeles";

const KEY_FILE_PATHS = [
  process.env.GCP_KEY_FILE,
  path.join(process.env.HOME || "", "projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json"),
  "./cloud/keys/coldstart-labs-service-account-key.json",
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
  --inspect-top-pages=10       URL Inspection calls for top pages (0 disables)
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
  console.error("ERROR: No service account key found. Searched:", candidates);
  console.error("Set GCP_KEY_FILE or pass --key=/path/to/service-account.json");
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
    primaryType: "web",
    inspectTopPages: 10,
    appearanceLimit: 10,
    lagDays: DEFAULT_LAG_DAYS,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--site=")) {
      result.site = arg.split("=")[1];
    } else if (arg.startsWith("--days=")) {
      result.days = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--output=")) {
      result.output = arg.split("=")[1];
    } else if (arg.startsWith("--row-limit=")) {
      result.rowLimit = Math.min(DEFAULT_ROW_LIMIT, parseInt(arg.split("=")[1], 10));
    } else if (arg.startsWith("--key=")) {
      result.key = arg.split("=")[1];
    } else if (arg.startsWith("--search-types=")) {
      result.searchTypes = arg
        .split("=")[1]
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--primary-type=")) {
      result.primaryType = arg.split("=")[1];
    } else if (arg.startsWith("--inspect-top-pages=")) {
      result.inspectTopPages = Math.max(0, parseInt(arg.split("=")[1], 10));
    } else if (arg.startsWith("--appearance-limit=")) {
      result.appearanceLimit = Math.max(0, parseInt(arg.split("=")[1], 10));
    } else if (arg.startsWith("--lag-days=")) {
      result.lagDays = Math.max(0, parseInt(arg.split("=")[1], 10));
    }
  }

  if (!result.site) {
    console.error("ERROR: --site=domain.com is required");
    printHelp();
    process.exit(1);
  }

  if (!Number.isInteger(result.days) || result.days <= 0) {
    console.error("ERROR: --days must be a positive integer");
    process.exit(1);
  }

  if (!Number.isInteger(result.rowLimit) || result.rowLimit <= 0) {
    console.error("ERROR: --row-limit must be a positive integer");
    process.exit(1);
  }

  if (!result.searchTypes.length) {
    console.error("ERROR: --search-types must include at least one type");
    process.exit(1);
  }

  if (!result.searchTypes.includes(result.primaryType)) {
    result.primaryType = result.searchTypes[0];
  }

  return result;
}

function getPacificTodayString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateString(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
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
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createAccessToken(keyFile) {
  const key = JSON.parse(fs.readFileSync(keyFile, "utf8"));
  if (!key.client_email || !key.private_key) {
    throw new Error(`Invalid service account key file: ${keyFile}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
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

  const signature = crypto.createSign("RSA-SHA256").update(signingInput).end().sign(key.private_key);
  const assertion = `${signingInput}.${base64UrlEncode(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
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

async function googleRequest({ method = "GET", url, accessToken, body = null, optional = false, label = "request" }) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const bodyText = await response.text();
  if (!response.ok) {
    const message = `${label} failed (${response.status}): ${parseErrorPayload(bodyText)}`;
    if (optional) {
      console.error(`[GSC] ${message}`);
      return null;
    }
    throw new Error(message);
  }

  return bodyText ? JSON.parse(bodyText) : {};
}

async function listSites(accessToken) {
  const response = await googleRequest({
    url: `${WEBMASTERS_BASE_URL}/sites`,
    accessToken,
    label: "sites.list",
  });
  return response.siteEntry || [];
}

async function querySearchAnalytics({ accessToken, siteUrl, requestBody, optional = false, label }) {
  const response = await googleRequest({
    method: "POST",
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
      dataState: "final",
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

function addShares(rows, metricName) {
  const total = rows.reduce((sum, row) => sum + (row[metricName] || 0), 0);
  return rows.map(row => ({
    ...row,
    [`${metricName}Share`]: total ? Number((((row[metricName] || 0) / total) * 100).toFixed(2)) : 0,
  }));
}

function estimatePotentialClicks(impressions, currentPosition) {
  const targetCtrByPosition = [
    { maxPosition: 3, targetCtr: 0.11 },
    { maxPosition: 5, targetCtr: 0.08 },
    { maxPosition: 10, targetCtr: 0.04 },
    { maxPosition: 20, targetCtr: 0.025 },
  ];

  const currentCtrEstimate = [
    { maxPosition: 3, ctr: 0.09 },
    { maxPosition: 5, ctr: 0.05 },
    { maxPosition: 10, ctr: 0.025 },
    { maxPosition: 20, ctr: 0.015 },
    { maxPosition: Infinity, ctr: 0.008 },
  ].find(bucket => currentPosition <= bucket.maxPosition)?.ctr || 0.008;

  const targetCtr = targetCtrByPosition.find(bucket => currentPosition <= bucket.maxPosition)?.targetCtr || 0.04;
  return Math.max(0, Math.round(impressions * (targetCtr - currentCtrEstimate)));
}

function scoreOpportunity({ impressions, position, query }) {
  const impressionScore = impressions >= 1000 ? 10 : impressions >= 500 ? 8 : impressions >= 200 ? 6 : impressions >= 50 ? 4 : 2;
  const positionScore = position <= 12 ? 10 : position <= 18 ? 7 : position <= 30 ? 5 : 2;
  const intentScore = /\b(vs|compare|best|tool|free|online|ai|upscale|enhance|convert)\b/i.test(query) ? 8 : 5;
  return Math.round(impressionScore * 0.4 + positionScore * 0.35 + intentScore * 0.25);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildBrandPatterns(site) {
  const hostname = String(site || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^sc-domain:/, "")
    .replace(/^www\./, "")
    .trim();

  const root = hostname.split(".")[0] || hostname;
  const commonSeoWords = [
    "upscaler",
    "upscale",
    "enhancer",
    "enhance",
    "background",
    "remove",
    "remover",
    "converter",
    "maker",
    "image",
    "photo",
    "tool",
    "tools",
    "free",
    "online",
    "ai",
  ];

  const spacedRoot = root.replace(
    new RegExp(commonSeoWords.slice().sort((a, b) => b.length - a.length).join("|"), "g"),
    match => ` ${match} `
  );

  const brandStemMatch = root.match(/^(.*?)(upscaler|upscale|enhancer|enhance|converter|maker|tool|tools)$/);
  const brandStemCandidate = brandStemMatch?.[1] ? brandStemMatch[1].replace(/-/g, " ").trim() : "";
  const brandStem =
    brandStemCandidate && brandStemCandidate.length >= 4 && !commonSeoWords.includes(brandStemCandidate)
      ? brandStemCandidate
      : "";

  const candidates = new Set([
    hostname,
    root,
    hostname.replace(/\./g, " "),
    root.replace(/-/g, " "),
    spacedRoot.replace(/\s+/g, " ").trim(),
    brandStem,
  ]);

  return Array.from(candidates)
    .map(candidate => normalizeText(candidate))
    .filter(Boolean);
}

function isDomainLikeQuery(query) {
  const normalizedQuery = String(query || "").replace(/\s*\.\s*/g, ".");
  return /\b[a-z0-9-]+\.(com|ai|io|net|org|app|co|dev|xyz)\b/i.test(normalizedQuery);
}

function isBrandedQuery(query, brandPatterns) {
  const normalizedQuery = normalizeText(query);
  return brandPatterns.some(pattern => normalizedQuery.includes(pattern));
}

function isLikelyHomepage(urlString) {
  try {
    const url = new URL(urlString);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return true;
    return parts.length === 1 && /^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0]);
  } catch {
    return false;
  }
}

function inferContentFormat(query) {
  if (/\b(vs|versus|compare|alternative|alternatives)\b/i.test(query)) return "comparison";
  if (/\b(how|why|tips|guide|tutorial|best)\b/i.test(query)) return "guide";
  return "landing-page-or-tool";
}

function joinQueryPageData(queryRows, pageRows, queryPageRows, brandPatterns) {
  const pagesByQuery = new Map();
  const queriesByPage = new Map();

  for (const row of queryPageRows) {
    const [query, page] = row.keys || [];
    if (!query || !page) continue;

    const pageEntry = { page, clicks: row.clicks || 0, impressions: row.impressions || 0, ctr: row.ctr || 0, position: row.position || 0 };
    const queryEntry = { query, clicks: row.clicks || 0, impressions: row.impressions || 0, ctr: row.ctr || 0, position: row.position || 0 };

    if (!pagesByQuery.has(query)) pagesByQuery.set(query, []);
    if (!queriesByPage.has(page)) queriesByPage.set(page, []);

    pagesByQuery.get(query).push(pageEntry);
    queriesByPage.get(page).push(queryEntry);
  }

  const queries = queryRows
    .map(row => {
      const item = normalizeMetricRow(row, ["query"]);
      const pages = (pagesByQuery.get(item.query) || []).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
      return {
        ...item,
        isBranded: isBrandedQuery(item.query, brandPatterns),
        isDomainLike: isDomainLikeQuery(item.query),
        pageCount: pages.length,
        topPage: pages[0]?.page || null,
        pages: pages.slice(0, 10),
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  const pages = pageRows
    .map(row => {
      const item = normalizeMetricRow(row, ["page"]);
      const queriesForPage = (queriesByPage.get(item.page) || []).sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
      return {
        ...item,
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
    .filter(query => query.position >= 8 && query.position <= 25 && query.impressions >= 30)
    .map(query => ({
      ...query,
      potentialClicks: estimatePotentialClicks(query.impressions, query.position),
      difficulty: query.position <= 12 ? "easy" : query.position <= 18 ? "medium" : "hard",
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
      opportunityScore: scoreOpportunity({ impressions: query.impressions, position: query.position, query: query.query }),
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
        ? "Create a dedicated page or blog post instead of relying on a generic homepage/locale page"
        : "Refresh or expand the existing destination page to match the query intent",
      opportunityScore: scoreOpportunity(query),
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.impressions - a.impressions)
    .slice(0, 40);
}

function buildMovers(currentRows, previousRows, keyField) {
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
      positionDelta: previous && current ? Number((previousPosition - currentPosition).toFixed(2)) : null,
      currentCtr: current?.ctr || 0,
      previousCtr: previous?.ctr || 0,
    });
  }

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

function summarizeSearchAppearance(rows) {
  return rows
    .map(row => normalizeMetricRow(row, ["appearance"]))
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
}

async function fetchAppearanceBreakdown({ accessToken, siteUrl, type, range, rowLimit, appearanceLimit }) {
  if (!SEARCH_APPEARANCE_TYPES.has(type) || appearanceLimit <= 0) {
    return [];
  }

  const appearanceRows = await queryAllSearchAnalyticsRows({
    accessToken,
    siteUrl,
    requestBody: {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ["searchAppearance"],
      type,
      dataState: "final",
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
        dimensions: ["page"],
        type,
        aggregationType: "byPage",
        dataState: "final",
        dimensionFilterGroups: [
          {
            filters: [
              {
                dimension: "searchAppearance",
                operator: "equals",
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
        .map(row => normalizeMetricRow(row, ["page"]))
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

  const [dailyRows, deviceRows, countryRows, queryRows, pageRows, queryPageRows, previousQueryRows, previousPageRows, searchAppearance] =
    await Promise.all([
      queryAllSearchAnalyticsRows({
        accessToken,
        siteUrl,
        requestBody: {
          startDate: ranges.current.startDate,
          endDate: ranges.current.endDate,
          dimensions: ["date"],
          type,
          dataState: "final",
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
          dimensions: ["device"],
          type,
          dataState: "final",
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
          dimensions: ["country"],
          type,
          dataState: "final",
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
              dimensions: ["query"],
              type,
              dataState: "final",
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
              dimensions: ["page"],
              aggregationType: "byPage",
              type,
              dataState: "final",
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
              dimensions: ["query", "page"],
              type,
              dataState: "final",
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
              dimensions: ["query"],
              type,
              dataState: "final",
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
              dimensions: ["page"],
              aggregationType: "byPage",
              type,
              dataState: "final",
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
    ]);

  const dailyTrend = dailyRows
    .map(row => normalizeMetricRow(row, ["date"]))
    .sort((a, b) => a.date.localeCompare(b.date));

  const devices = addShares(
    deviceRows
      .map(row => normalizeMetricRow(row, ["device"]))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
    "impressions"
  );

  const countries = addShares(
    countryRows
      .map(row => normalizeMetricRow(row, ["country"]))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 50),
    "impressions"
  );

  const brandPatterns = buildBrandPatterns(siteUrl);
  const { queries, pages } = joinQueryPageData(queryRows, pageRows, queryPageRows, brandPatterns);
  const nonBrandedQueries = queries.filter(query => !query.isBranded && !query.isDomainLike);
  const previousQueries = previousQueryRows.map(row => normalizeMetricRow(row, ["query"]));
  const previousPages = previousPageRows.map(row => normalizeMetricRow(row, ["page"]));

  const lowHangingFruit = buildLowHangingFruit(queries);
  const ctrOpportunities = buildCtrOpportunities(queries);
  const pageCtrOpportunities = buildPageCtrOpportunities(pages);
  const contentOpportunities = buildContentOpportunities(queries);
  const cannibalization = buildCannibalization(queries);
  const queryMovers = buildMovers(queries, previousQueries, "query");
  const pageMovers = buildMovers(pages, previousPages, "page");

  return {
    type,
    hasAnyTraffic: true,
    supportsFullDetails: FULL_DETAIL_TYPES.has(type),
    summary: summaryComparison,
    dailyTrend,
    devices,
    countries,
    queries,
    nonBrandedQueries,
    pages,
    lowHangingFruit,
    ctrOpportunities,
    pageCtrOpportunities,
    contentOpportunities,
    cannibalization,
    queryMovers,
    pageMovers,
    searchAppearance,
  };
}

async function listSitemaps({ accessToken, siteUrl }) {
  const response = await googleRequest({
    url: `${WEBMASTERS_BASE_URL}/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
    accessToken,
    optional: true,
    label: "sitemaps.list",
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

function pickInspectionTargets(primaryDataset, maxTargets) {
  if (!primaryDataset || maxTargets <= 0) return [];

  const ordered = [];
  const seen = new Set();

  const addTarget = url => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    ordered.push(url);
  };

  primaryDataset.lowHangingFruit.forEach(item => addTarget(item.topPage));
  primaryDataset.pageCtrOpportunities.forEach(item => addTarget(item.page));
  primaryDataset.pages
    .slice()
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .forEach(item => addTarget(item.page));

  return ordered.slice(0, maxTargets);
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
    richResultTypes: (richResults.detectedItems || []).map(item => item.richResultType).filter(Boolean),
    richResultsIssueCount: (richResults.detectedItems || []).reduce(
      (count, item) => count + (item.items || []).reduce((itemCount, child) => itemCount + (child.issues || []).length, 0),
      0
    ),
  };
}

function countBy(items, keySelector) {
  const counts = {};
  for (const item of items) {
    const key = keySelector(item) || "unknown";
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
    canonicalMismatches: inspections.filter(item => item.canonicalMismatch).map(item => item.url),
    pagesMissingFromKnownSitemaps: inspections.filter(item => !item.sitemap.length).map(item => item.url),
    blockedOrBrokenPages: inspections
      .filter(item => item.pageFetchState && item.pageFetchState !== "SUCCESSFUL")
      .map(item => ({
        url: item.url,
        pageFetchState: item.pageFetchState,
        coverageState: item.coverageState,
      })),
    nonPassingPages: inspections
      .filter(item => item.verdict && item.verdict !== "PASS")
      .map(item => ({
        url: item.url,
        verdict: item.verdict,
        coverageState: item.coverageState,
      })),
  };
}

async function inspectPriorityPages({ accessToken, siteUrl, urls }) {
  const inspections = [];

  for (const url of urls) {
    const response = await googleRequest({
      method: "POST",
      url: `${SEARCH_CONSOLE_BASE_URL}/urlInspection/index:inspect`,
      accessToken,
      body: {
        inspectionUrl: url,
        siteUrl,
        languageCode: "en-US",
      },
      optional: true,
      label: `urlInspection ${url}`,
    });

    if (response?.inspectionResult) {
      inspections.push(mapInspectionResult(url, response.inspectionResult));
    }
  }

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
    dataset.contentOpportunities.slice(0, 15).forEach(item => contentCreation.push({ type, ...item }));
    dataset.ctrOpportunities.slice(0, 10).forEach(item => ctr.push({ type, ...item }));
    dataset.cannibalization.slice(0, 10).forEach(item => cannibalization.push({ type, ...item }));
  }

  return {
    primaryType,
    quickWins: quickWins.sort((a, b) => b.potentialClicks - a.potentialClicks || b.impressions - a.impressions).slice(0, 30),
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
  console.error(`[GSC] Current range: ${dateRanges.current.startDate} -> ${dateRanges.current.endDate} (${args.days} days, Pacific time)`);
  console.error(`[GSC] Previous range: ${dateRanges.previous.startDate} -> ${dateRanges.previous.endDate}`);
  console.error(`[GSC] Search types: ${args.searchTypes.join(", ")}`);

  const accessToken = await createAccessToken(keyFile);

  console.error("[GSC] Checking API access...");
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

  console.error("[GSC] Fetching sitemaps...");
  const sitemaps = await listSitemaps({ accessToken, siteUrl });

  const primaryType = searchTypes[args.primaryType] ? args.primaryType : Object.keys(searchTypes)[0];
  const primaryDataset = searchTypes[primaryType];
  const inspectionTargets = pickInspectionTargets(primaryDataset, args.inspectTopPages);

  let indexing = { inspectedPages: [], summary: { totalInspected: 0 } };
  if (inspectionTargets.length) {
    console.error(`[GSC] Inspecting ${inspectionTargets.length} priority URLs...`);
    indexing = await inspectPriorityPages({ accessToken, siteUrl, urls: inspectionTargets });
  }

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
      apiMode: "native-rest",
    },
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
    },
    comparison: primaryDataset?.summary || null,
    searchTypeSummary,
    searchTypes,
    growthOverview,
    dailyTrend: primaryDataset?.dailyTrend || [],
    devices: primaryDataset?.devices || [],
    deviceBreakdown: primaryDataset?.devices || [],
    countries: primaryDataset?.countries || [],
    countryBreakdown: primaryDataset?.countries || [],
    searchAppearance: primaryDataset?.searchAppearance || [],
    topQueries: (primaryDataset?.queries || []).slice(0, 100),
    topNonBrandedQueries: (primaryDataset?.nonBrandedQueries || []).slice(0, 100),
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
  };

  const json = JSON.stringify(output, null, 2);
  if (args.output) {
    fs.writeFileSync(args.output, json);
    console.error(`[GSC] Data written to ${args.output} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`);
  } else {
    process.stdout.write(json);
  }

  console.error("[GSC] Done!");
}

main().catch(error => {
  console.error("FATAL:", error.message || error);
  process.exit(1);
});
