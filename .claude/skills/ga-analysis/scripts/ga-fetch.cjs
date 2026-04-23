#!/usr/bin/env node
/**
 * Standalone GA4 SEO Data Fetcher
 *
 * Pulls Google Analytics 4 data focused on organic-search / SEO decisions:
 * - organic vs total summary with previous-period comparison
 * - channel mix with session share and deltas
 * - organic landing pages with engagement + conversions
 * - source/medium breakdown
 * - page engagement (organic)
 * - country/device splits (organic)
 * - daily trend (organic)
 * - opportunity clusters (low-conversion, low-engagement, declining, device gaps)
 *
 * Auth uses the same service account JSON key as /gsc-analysis.
 * Native Node.js fetch + crypto only (no googleapis dep).
 *
 * The service account must be granted Viewer in GA4 Admin > Property Access Management.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DEFAULT_LAG_DAYS = 1;
const DEFAULT_DAYS = 28;
const DEFAULT_PROPERTY_ID = "519826120";
const ORGANIC_CHANNEL_DEFAULT = "Organic Search";
const PACIFIC_TIMEZONE = "America/Los_Angeles";

const KEY_FILE_PATHS = [
  process.env.GCP_KEY_FILE,
  path.join(process.env.HOME || "", "projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json"),
  "./cloud/keys/coldstart-labs-service-account-key.json",
].filter(Boolean);

function printHelp() {
  console.error(`
Usage:
  node ga-fetch.cjs [options]

Options:
  --site=example.com              Label for output meta (optional)
  --property-id=519826120         GA4 property ID (default: ${DEFAULT_PROPERTY_ID})
  --days=28                       Days per period (default: 28)
  --output=/tmp/ga.json           Write JSON to a file instead of stdout
  --organic-channel="Organic Search"   Channel label used as organic filter
  --lag-days=1                    Days to hold back from today (default: 1)
  --landing-page-limit=500        Landing page rows to return
  --page-engagement-limit=500     Page engagement rows to return
  --source-medium-limit=100       Source/medium rows to return
  --country-limit=75              Country rows to return
  --key=/path/to/key.json         Override service account key path
  --help                          Show this help
`);
}

function findKeyFile(explicitKeyPath) {
  const candidates = [explicitKeyPath, ...KEY_FILE_PATHS].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  console.error("ERROR: No service account key found. Searched:", candidates);
  console.error("Set GCP_KEY_FILE or pass --key=/path/to/service-account.json");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    site: null,
    propertyId: DEFAULT_PROPERTY_ID,
    days: DEFAULT_DAYS,
    output: null,
    key: null,
    organicChannel: ORGANIC_CHANNEL_DEFAULT,
    lagDays: DEFAULT_LAG_DAYS,
    landingPageLimit: 500,
    pageEngagementLimit: 500,
    sourceMediumLimit: 100,
    countryLimit: 75,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--site=")) {
      result.site = arg.split("=")[1];
    } else if (arg.startsWith("--property-id=")) {
      result.propertyId = arg.split("=")[1];
    } else if (arg.startsWith("--days=")) {
      result.days = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--output=")) {
      result.output = arg.split("=")[1];
    } else if (arg.startsWith("--key=")) {
      result.key = arg.split("=")[1];
    } else if (arg.startsWith("--organic-channel=")) {
      result.organicChannel = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("--lag-days=")) {
      result.lagDays = Math.max(0, parseInt(arg.split("=")[1], 10));
    } else if (arg.startsWith("--landing-page-limit=")) {
      result.landingPageLimit = Math.max(10, parseInt(arg.split("=")[1], 10));
    } else if (arg.startsWith("--page-engagement-limit=")) {
      result.pageEngagementLimit = Math.max(10, parseInt(arg.split("=")[1], 10));
    } else if (arg.startsWith("--source-medium-limit=")) {
      result.sourceMediumLimit = Math.max(10, parseInt(arg.split("=")[1], 10));
    } else if (arg.startsWith("--country-limit=")) {
      result.countryLimit = Math.max(10, parseInt(arg.split("=")[1], 10));
    }
  }

  if (!result.propertyId) {
    console.error("ERROR: --property-id is required");
    printHelp();
    process.exit(1);
  }

  if (!Number.isInteger(result.days) || result.days <= 0) {
    console.error("ERROR: --days must be a positive integer");
    process.exit(1);
  }

  if (!result.site) result.site = `property-${result.propertyId}`;

  return result;
}

function getPacificTodayString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
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
    current:  { startDate, endDate, days },
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
  if (!key.client_email || !key.private_key) throw new Error(`Invalid service account key file: ${keyFile}`);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = { iss: key.client_email, scope: GA_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).end().sign(key.private_key);
  const assertion = `${signingInput}.${base64UrlEncode(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });

  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Token request failed (${response.status}): ${bodyText}`);

  const payload = JSON.parse(bodyText);
  return { accessToken: payload.access_token, clientEmail: key.client_email };
}

function parseErrorPayload(bodyText) {
  try {
    const payload = JSON.parse(bodyText);
    return payload.error?.message || payload.error_description || bodyText;
  } catch {
    return bodyText;
  }
}

async function googleRequest({ method = "POST", url, accessToken, body = null, optional = false, label = "request" }) {
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
    if (optional) { console.error(`[GA] ${message}`); return null; }
    throw new Error(message);
  }

  return bodyText ? JSON.parse(bodyText) : {};
}

async function runReport({ accessToken, propertyId, body, optional = false, label }) {
  return googleRequest({
    method: "POST",
    url: `${DATA_API_BASE}/properties/${encodeURIComponent(propertyId)}:runReport`,
    accessToken,
    body,
    optional,
    label,
  });
}

function parseMetric(value) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

function parseRow(row, dimensionHeaders, metricHeaders) {
  const result = {};
  (row.dimensionValues || []).forEach((value, index) => {
    const name = dimensionHeaders[index]?.name;
    if (name) result[name] = value.value;
  });
  (row.metricValues || []).forEach((value, index) => {
    const header = metricHeaders[index];
    if (header?.name) result[header.name] = parseMetric(value.value);
  });
  return result;
}

function parseReport(response) {
  if (!response || !response.rows) return [];
  const dimensionHeaders = response.dimensionHeaders || [];
  const metricHeaders = response.metricHeaders || [];
  return response.rows.map(row => parseRow(row, dimensionHeaders, metricHeaders));
}

function organicFilter(organicChannel) {
  return {
    dimensionFilter: {
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: organicChannel },
      },
    },
  };
}

function splitByDateRange(rows) {
  const current = [];
  const previous = [];
  for (const row of rows) {
    if (row.dateRange === "date_range_0") current.push(row);
    else if (row.dateRange === "date_range_1") previous.push(row);
  }
  return { current, previous };
}

function metricDelta(current, previous) {
  return Number((current - previous).toFixed(4));
}

function percentageDelta(current, previous) {
  if (!previous) return current ? null : 0;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function buildComparison(current, previous, metricNames) {
  const delta = {};
  const deltaPct = {};
  for (const name of metricNames) {
    const c = current?.[name] || 0;
    const p = previous?.[name] || 0;
    delta[name] = metricDelta(c, p);
    deltaPct[name] = percentageDelta(c, p);
  }
  return { current: current || {}, previous: previous || {}, delta, deltaPct };
}

function totalOfRows(rows, metricNames) {
  return metricNames.reduce((acc, metric) => {
    acc[metric] = rows.reduce((sum, row) => sum + (row[metric] || 0), 0);
    return acc;
  }, {});
}

function adjustRateMetrics(row) {
  const sessions = row.sessions || 0;
  const engaged = row.engagedSessions || 0;
  if (sessions > 0) {
    row.engagementRate = Number((engaged / sessions).toFixed(4));
    row.bounceRate = Number((1 - engaged / sessions).toFixed(4));
  }
  return row;
}

async function fetchChannelSummary({ accessToken, propertyId, ranges, organicChannel }) {
  const metrics = ["sessions", "engagedSessions", "engagementRate", "totalUsers", "newUsers", "averageSessionDuration", "bounceRate", "conversions"];

  const response = await runReport({
    accessToken,
    propertyId,
    body: {
      dateRanges: [
        { startDate: ranges.current.startDate, endDate: ranges.current.endDate },
        { startDate: ranges.previous.startDate, endDate: ranges.previous.endDate },
      ],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: metrics.map(name => ({ name })),
      limit: 50,
      keepEmptyRows: false,
    },
    label: "channel summary",
  });

  const rows = parseReport(response);
  const { current: currentRows, previous: previousRows } = splitByDateRange(rows);

  const findChannel = (rowList, channel) => rowList.find(row => row.sessionDefaultChannelGroup === channel) || {};

  const currentTotal  = adjustRateMetrics(totalOfRows(currentRows, metrics));
  const previousTotal = adjustRateMetrics(totalOfRows(previousRows, metrics));
  const currentOrganic  = findChannel(currentRows, organicChannel);
  const previousOrganic = findChannel(previousRows, organicChannel);

  const channelMix = currentRows.map(row => {
    const previousRow = findChannel(previousRows, row.sessionDefaultChannelGroup);
    return {
      channel: row.sessionDefaultChannelGroup,
      sessions: row.sessions,
      sessionsShare: currentTotal.sessions ? Number(((row.sessions / currentTotal.sessions) * 100).toFixed(2)) : 0,
      engagedSessions: row.engagedSessions,
      engagementRate: row.engagementRate,
      conversions: row.conversions,
      previousSessions: previousRow.sessions || 0,
      sessionDelta: metricDelta(row.sessions || 0, previousRow.sessions || 0),
      sessionDeltaPct: percentageDelta(row.sessions || 0, previousRow.sessions || 0),
    };
  }).sort((a, b) => b.sessions - a.sessions);

  return {
    all:     buildComparison(currentTotal,   previousTotal,   metrics),
    organic: buildComparison(currentOrganic, previousOrganic, metrics),
    channelMix,
    organicShare: {
      sessions:    currentTotal.sessions    ? Number((((currentOrganic.sessions    || 0) / currentTotal.sessions)    * 100).toFixed(2)) : 0,
      conversions: currentTotal.conversions ? Number((((currentOrganic.conversions || 0) / currentTotal.conversions) * 100).toFixed(2)) : 0,
    },
  };
}

async function fetchLandingPages({ accessToken, propertyId, ranges, organicChannel, limit }) {
  const metrics = ["sessions", "engagedSessions", "engagementRate", "averageSessionDuration", "bounceRate", "conversions", "screenPageViewsPerSession"];

  const response = await runReport({
    accessToken,
    propertyId,
    body: {
      dateRanges: [
        { startDate: ranges.current.startDate, endDate: ranges.current.endDate },
        { startDate: ranges.previous.startDate, endDate: ranges.previous.endDate },
      ],
      dimensions: [{ name: "landingPagePlusQueryString" }],
      metrics: metrics.map(name => ({ name })),
      ...organicFilter(organicChannel),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit,
      keepEmptyRows: false,
    },
    optional: true,
    label: "organic landing pages",
  });

  const rows = parseReport(response);
  const { current, previous } = splitByDateRange(rows);
  const previousByPage = new Map(previous.map(row => [row.landingPagePlusQueryString, row]));

  return current.map(row => {
    const previousRow = previousByPage.get(row.landingPagePlusQueryString) || {};
    const sessions = row.sessions || 0;
    const conversions = row.conversions || 0;
    return {
      page: row.landingPagePlusQueryString,
      sessions,
      engagedSessions: row.engagedSessions,
      engagementRate: row.engagementRate,
      averageSessionDuration: row.averageSessionDuration,
      bounceRate: row.bounceRate,
      conversions,
      conversionRate: sessions ? Number((conversions / sessions).toFixed(4)) : 0,
      viewsPerSession: row.screenPageViewsPerSession,
      previousSessions: previousRow.sessions || 0,
      previousConversions: previousRow.conversions || 0,
      sessionDelta: metricDelta(sessions, previousRow.sessions || 0),
      sessionDeltaPct: percentageDelta(sessions, previousRow.sessions || 0),
    };
  }).sort((a, b) => b.sessions - a.sessions);
}

async function fetchSourceMedium({ accessToken, propertyId, ranges, limit }) {
  const metrics = ["sessions", "engagedSessions", "engagementRate", "conversions"];
  const response = await runReport({
    accessToken,
    propertyId,
    body: {
      dateRanges: [{ startDate: ranges.current.startDate, endDate: ranges.current.endDate }],
      dimensions: [{ name: "sessionSourceMedium" }],
      metrics: metrics.map(name => ({ name })),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit,
      keepEmptyRows: false,
    },
    optional: true,
    label: "source/medium",
  });

  return parseReport(response).map(row => ({
    sourceMedium: row.sessionSourceMedium,
    sessions: row.sessions,
    engagedSessions: row.engagedSessions,
    engagementRate: row.engagementRate,
    conversions: row.conversions,
  }));
}

async function fetchPageEngagement({ accessToken, propertyId, ranges, organicChannel, limit }) {
  const metrics = ["screenPageViews", "userEngagementDuration", "averageSessionDuration", "bounceRate", "engagementRate", "screenPageViewsPerSession"];

  const response = await runReport({
    accessToken,
    propertyId,
    body: {
      dateRanges: [{ startDate: ranges.current.startDate, endDate: ranges.current.endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: metrics.map(name => ({ name })),
      ...organicFilter(organicChannel),
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit,
      keepEmptyRows: false,
    },
    optional: true,
    label: "organic page engagement",
  });

  return parseReport(response).map(row => ({
    page: row.pagePath,
    views: row.screenPageViews,
    engagementDuration: row.userEngagementDuration,
    averageSessionDuration: row.averageSessionDuration,
    bounceRate: row.bounceRate,
    engagementRate: row.engagementRate,
    viewsPerSession: row.screenPageViewsPerSession,
  }));
}

async function fetchCountries({ accessToken, propertyId, ranges, organicChannel, limit }) {
  const metrics = ["sessions", "engagedSessions", "engagementRate", "bounceRate", "conversions"];
  const response = await runReport({
    accessToken,
    propertyId,
    body: {
      dateRanges: [{ startDate: ranges.current.startDate, endDate: ranges.current.endDate }],
      dimensions: [{ name: "country" }],
      metrics: metrics.map(name => ({ name })),
      ...organicFilter(organicChannel),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit,
      keepEmptyRows: false,
    },
    optional: true,
    label: "organic countries",
  });

  const rows = parseReport(response);
  const total = rows.reduce((sum, row) => sum + (row.sessions || 0), 0);
  return rows.map(row => ({
    country: row.country,
    sessions: row.sessions,
    sessionsShare: total ? Number(((row.sessions / total) * 100).toFixed(2)) : 0,
    engagedSessions: row.engagedSessions,
    engagementRate: row.engagementRate,
    bounceRate: row.bounceRate,
    conversions: row.conversions,
    conversionRate: row.sessions ? Number(((row.conversions || 0) / row.sessions).toFixed(4)) : 0,
  }));
}

async function fetchDevices({ accessToken, propertyId, ranges, organicChannel }) {
  const metrics = ["sessions", "engagedSessions", "engagementRate", "averageSessionDuration", "bounceRate", "conversions"];
  const response = await runReport({
    accessToken,
    propertyId,
    body: {
      dateRanges: [{ startDate: ranges.current.startDate, endDate: ranges.current.endDate }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: metrics.map(name => ({ name })),
      ...organicFilter(organicChannel),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
      keepEmptyRows: false,
    },
    optional: true,
    label: "organic devices",
  });

  const rows = parseReport(response);
  const total = rows.reduce((sum, row) => sum + (row.sessions || 0), 0);
  return rows.map(row => {
    const sessions = row.sessions || 0;
    const conversions = row.conversions || 0;
    return {
      device: row.deviceCategory,
      sessions,
      sessionsShare: total ? Number(((sessions / total) * 100).toFixed(2)) : 0,
      engagedSessions: row.engagedSessions,
      engagementRate: row.engagementRate,
      averageSessionDuration: row.averageSessionDuration,
      bounceRate: row.bounceRate,
      conversions,
      conversionRate: sessions ? Number((conversions / sessions).toFixed(4)) : 0,
    };
  });
}

async function fetchDailyTrend({ accessToken, propertyId, ranges, organicChannel }) {
  const metrics = ["sessions", "engagedSessions", "conversions"];
  const response = await runReport({
    accessToken,
    propertyId,
    body: {
      dateRanges: [{ startDate: ranges.current.startDate, endDate: ranges.current.endDate }],
      dimensions: [{ name: "date" }],
      metrics: metrics.map(name => ({ name })),
      ...organicFilter(organicChannel),
      orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
      limit: 366,
      keepEmptyRows: false,
    },
    optional: true,
    label: "organic daily trend",
  });

  return parseReport(response).map(row => ({
    date: row.date,
    sessions: row.sessions,
    engagedSessions: row.engagedSessions,
    conversions: row.conversions,
  }));
}

function buildHighTrafficLowConversion(landingPages) {
  if (!landingPages.length) return [];
  const sorted = landingPages.slice().sort((a, b) => b.sessions - a.sessions);
  const cutoff = sorted[Math.min(20, sorted.length - 1)]?.sessions || 0;
  const benchmark = 0.02;

  return landingPages
    .filter(p => p.sessions >= Math.max(cutoff, 50) && p.conversionRate < benchmark)
    .map(p => ({
      ...p,
      missedConversionsEstimate: Math.max(0, Math.round(p.sessions * benchmark) - p.conversions),
      benchmarkConversionRate: benchmark,
    }))
    .sort((a, b) => b.missedConversionsEstimate - a.missedConversionsEstimate)
    .slice(0, 20);
}

function buildHighTrafficLowEngagement(landingPages) {
  return landingPages
    .filter(p => p.sessions >= 100 && (p.bounceRate >= 0.7 || p.averageSessionDuration < 20))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);
}

function buildDecliningLandingPages(landingPages) {
  return landingPages
    .filter(p => p.previousSessions >= 50 && p.sessionDelta < 0 && Math.abs(p.sessionDeltaPct || 0) >= 20)
    .sort((a, b) => a.sessionDelta - b.sessionDelta)
    .slice(0, 20);
}

function buildUnderperformingDevices(devices) {
  if (devices.length < 2) return [];
  const totalSessions    = devices.reduce((sum, d) => sum + (d.sessions    || 0), 0);
  const totalConversions = devices.reduce((sum, d) => sum + (d.conversions || 0), 0);
  const avgRate = totalSessions ? totalConversions / totalSessions : 0;
  if (!avgRate) return [];

  return devices
    .filter(d => d.sessions >= 100 && d.conversionRate < avgRate * 0.7)
    .map(d => ({ ...d, avgConversionRate: Number(avgRate.toFixed(4)), gap: Number((avgRate - d.conversionRate).toFixed(4)) }));
}

async function main() {
  const args     = parseArgs();
  const keyFile  = findKeyFile(args.key);
  const dateRanges = buildDateRanges(args.days, args.lagDays);

  console.error(`[GA] Site: ${args.site}`);
  console.error(`[GA] Property: ${args.propertyId}`);
  console.error(`[GA] Key: ${keyFile}`);
  console.error(`[GA] Current: ${dateRanges.current.startDate} -> ${dateRanges.current.endDate} (${args.days} days, Pacific)`);
  console.error(`[GA] Previous: ${dateRanges.previous.startDate} -> ${dateRanges.previous.endDate}`);
  console.error(`[GA] Organic channel filter: "${args.organicChannel}"`);

  const { accessToken, clientEmail } = await createAccessToken(keyFile);
  console.error(`[GA] Authenticated as ${clientEmail}`);

  console.error("[GA] Fetching channel summary + organic comparison...");
  const channelSummary = await fetchChannelSummary({ accessToken, propertyId: args.propertyId, ranges: dateRanges, organicChannel: args.organicChannel });

  console.error("[GA] Fetching organic landing pages...");
  const landingPages = await fetchLandingPages({ accessToken, propertyId: args.propertyId, ranges: dateRanges, organicChannel: args.organicChannel, limit: args.landingPageLimit });

  console.error("[GA] Fetching source/medium breakdown...");
  const sourceMedium = await fetchSourceMedium({ accessToken, propertyId: args.propertyId, ranges: dateRanges, limit: args.sourceMediumLimit });

  console.error("[GA] Fetching page engagement (organic)...");
  const pageEngagement = await fetchPageEngagement({ accessToken, propertyId: args.propertyId, ranges: dateRanges, organicChannel: args.organicChannel, limit: args.pageEngagementLimit });

  console.error("[GA] Fetching organic countries...");
  const countries = await fetchCountries({ accessToken, propertyId: args.propertyId, ranges: dateRanges, organicChannel: args.organicChannel, limit: args.countryLimit });

  console.error("[GA] Fetching organic devices...");
  const devices = await fetchDevices({ accessToken, propertyId: args.propertyId, ranges: dateRanges, organicChannel: args.organicChannel });

  console.error("[GA] Fetching organic daily trend...");
  const dailyTrend = await fetchDailyTrend({ accessToken, propertyId: args.propertyId, ranges: dateRanges, organicChannel: args.organicChannel });

  const opportunities = {
    highTrafficLowConversion:  buildHighTrafficLowConversion(landingPages),
    highTrafficLowEngagement:  buildHighTrafficLowEngagement(landingPages),
    decliningLandingPages:     buildDecliningLandingPages(landingPages),
    underperformingDevices:    buildUnderperformingDevices(devices),
  };

  const output = {
    meta: {
      site: args.site,
      propertyId: args.propertyId,
      fetchedAt: new Date().toISOString(),
      dateRanges,
      keyFile,
      organicChannel: args.organicChannel,
      serviceAccount: clientEmail,
      apiMode: "native-rest",
    },
    summary: {
      all:          channelSummary.all,
      organic:      channelSummary.organic,
      organicShare: channelSummary.organicShare,
    },
    channelMix: channelSummary.channelMix,
    organic: { landingPages, countries, devices, dailyTrend },
    sourceMedium,
    pageEngagement,
    opportunities,
  };

  const json = JSON.stringify(output, null, 2);
  if (args.output) {
    fs.writeFileSync(args.output, json);
    console.error(`[GA] Data written to ${args.output} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`);
  } else {
    process.stdout.write(json);
  }

  console.error("[GA] Done!");
}

main().catch(error => {
  console.error("FATAL:", error.message || error);
  process.exit(1);
});
