#!/usr/bin/env node
/**
 * Standalone GSC Performance Data Fetcher
 * Works with any domain on the shared Google Cloud account.
 *
 * Usage:
 *   node gsc-fetch.js --site=convertbanktoexcel.com
 *   node gsc-fetch.js --site=myimageupscaler.com --days=90
 *   node gsc-fetch.js --site=convertbanktoexcel.com --days=28 --output=/tmp/gsc-data.json
 *
 * Auth: Uses service account key at GCP_KEY_FILE or default path.
 */

const fs = require("fs");
const path = require("path");

// Resolve googleapis from known locations (script is project-agnostic)
const MODULE_SEARCH_PATHS = [
  path.join(process.env.HOME, "projects/convertbanktoexcel.com/node_modules"),
  path.join(process.cwd(), "node_modules"),
];
for (const p of MODULE_SEARCH_PATHS) {
  if (fs.existsSync(path.join(p, "googleapis")) && !module.paths.includes(p)) {
    module.paths.unshift(p);
    break;
  }
}
const { google } = require("googleapis");

const KEY_FILE_PATHS = [
  process.env.GCP_KEY_FILE,
  path.join(process.env.HOME, "projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json"),
  "./cloud/keys/coldstart-labs-service-account-key.json",
].filter(Boolean);

function findKeyFile() {
  for (const p of KEY_FILE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  console.error("ERROR: No service account key found. Searched:", KEY_FILE_PATHS);
  console.error("Set GCP_KEY_FILE env var to the correct path.");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { site: null, days: 28, output: null, rowLimit: 5000, key: null };
  for (const arg of args) {
    if (arg.startsWith("--site=")) result.site = arg.split("=")[1];
    else if (arg.startsWith("--days=")) result.days = parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--output=")) result.output = arg.split("=")[1];
    else if (arg.startsWith("--row-limit=")) result.rowLimit = parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--key=")) result.key = arg.split("=")[1];
  }
  if (!result.site) {
    console.error("ERROR: --site=domain.com is required");
    console.error("Usage: node gsc-fetch.js --site=convertbanktoexcel.com [--days=28] [--output=file.json]");
    process.exit(1);
  }
  return result;
}

function getDateString(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split("T")[0];
}

function estimatePotentialClicks(impressions, currentPosition) {
  const targetCtr = 0.18;
  const ctrByPos = { 1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06, 6: 0.05, 7: 0.04, 8: 0.03, 9: 0.03, 10: 0.025 };
  const currentCtr = ctrByPos[Math.round(currentPosition)] || 0.02;
  return Math.max(0, Math.round(impressions * (targetCtr - currentCtr)));
}

async function main() {
  const args = parseArgs();
  const keyFile = args.key || findKeyFile();
  const siteUrl = `sc-domain:${args.site}`;

  console.error(`[GSC] Site: ${args.site}`);
  console.error(`[GSC] Key: ${keyFile}`);
  console.error(`[GSC] Days: ${args.days}`);

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });

  const searchConsole = google.searchconsole({ version: "v1", auth });

  // 1. Health check - list sites
  console.error("[GSC] Checking API access...");
  const sitesResp = await searchConsole.sites.list();
  const sites = sitesResp.data.siteEntry || [];
  const siteMatch = sites.find(s => s.siteUrl === siteUrl);
  if (!siteMatch) {
    console.error(`WARNING: ${siteUrl} not found in verified sites. Available:`);
    sites.forEach(s => console.error(`  - ${s.siteUrl} (${s.permissionLevel})`));
    console.error("Attempting query anyway...");
  } else {
    console.error(`[GSC] Access confirmed: ${siteMatch.permissionLevel}`);
  }

  // 2. Fetch query+page performance
  console.error("[GSC] Fetching query+page performance...");
  const perfResp = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: getDateString(-args.days),
      endDate: getDateString(-3), // GSC has 2-3 day lag
      dimensions: ["query", "page"],
      rowLimit: args.rowLimit,
      dataState: "all",
    },
  });
  const queryPageRows = perfResp.data.rows || [];
  console.error(`[GSC] Got ${queryPageRows.length} query+page rows`);

  // 3. Fetch date-level performance (for trends)
  console.error("[GSC] Fetching daily performance...");
  const dateResp = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: getDateString(-args.days),
      endDate: getDateString(-3),
      dimensions: ["date"],
      rowLimit: args.days + 5,
      dataState: "all",
    },
  });
  const dateRows = dateResp.data.rows || [];

  // 4. Fetch device breakdown
  console.error("[GSC] Fetching device breakdown...");
  const deviceResp = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: getDateString(-args.days),
      endDate: getDateString(-3),
      dimensions: ["device"],
      dataState: "all",
    },
  });
  const deviceRows = deviceResp.data.rows || [];

  // 5. Fetch country breakdown
  console.error("[GSC] Fetching country breakdown...");
  const countryResp = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: getDateString(-args.days),
      endDate: getDateString(-3),
      dimensions: ["country"],
      rowLimit: 50,
      dataState: "all",
    },
  });
  const countryRows = countryResp.data.rows || [];

  // 6. Fetch sitemaps
  console.error("[GSC] Fetching sitemaps...");
  let sitemaps = [];
  try {
    const sitemapResp = await searchConsole.sitemaps.list({ siteUrl });
    sitemaps = (sitemapResp.data.sitemap || []).map(s => ({
      path: s.path,
      lastSubmitted: s.lastSubmitted,
      lastDownloaded: s.lastDownloaded,
      isPending: s.isPending,
      warnings: s.warnings,
      errors: s.errors,
      contents: s.contents,
    }));
  } catch (e) {
    console.error("[GSC] Sitemaps fetch failed (may need different permissions)");
  }

  // === AGGREGATION ===

  // Aggregate queries (dedup across pages)
  const queryMap = {};
  for (const row of queryPageRows) {
    const q = row.keys[0];
    if (!queryMap[q]) {
      queryMap[q] = { query: q, clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, count: 0, pages: [] };
    }
    queryMap[q].clicks += row.clicks;
    queryMap[q].impressions += row.impressions;
    queryMap[q].ctrSum += row.ctr;
    queryMap[q].posSum += row.position;
    queryMap[q].count += 1;
    queryMap[q].pages.push({ page: row.keys[1], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position });
  }

  const queries = Object.values(queryMap)
    .map(q => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.count > 0 ? q.ctrSum / q.count : 0,
      position: q.count > 0 ? q.posSum / q.count : 0,
      pageCount: q.count,
      pages: q.pages.sort((a, b) => b.clicks - a.clicks),
    }))
    .sort((a, b) => b.clicks - a.clicks);

  // Aggregate pages (dedup across queries)
  const pageMap = {};
  for (const row of queryPageRows) {
    const p = row.keys[1];
    if (!pageMap[p]) {
      pageMap[p] = { page: p, clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, count: 0, queries: [] };
    }
    pageMap[p].clicks += row.clicks;
    pageMap[p].impressions += row.impressions;
    pageMap[p].ctrSum += row.ctr;
    pageMap[p].posSum += row.position;
    pageMap[p].count += 1;
    pageMap[p].queries.push({ query: row.keys[0], clicks: row.clicks, impressions: row.impressions, position: row.position });
  }

  const pages = Object.values(pageMap)
    .map(p => ({
      page: p.page,
      clicks: p.clicks,
      impressions: p.impressions,
      ctr: p.count > 0 ? p.ctrSum / p.count : 0,
      position: p.count > 0 ? p.posSum / p.count : 0,
      queryCount: p.count,
      topQueries: p.queries.sort((a, b) => b.impressions - a.impressions).slice(0, 10),
    }))
    .sort((a, b) => b.clicks - a.clicks);

  // Low hanging fruit
  const lowHangingFruit = queries
    .filter(q => q.position >= 8 && q.position <= 25 && q.impressions >= 30)
    .map(q => ({
      ...q,
      potentialClicks: estimatePotentialClicks(q.impressions, q.position),
      difficulty: q.position <= 12 ? "easy" : q.position <= 18 ? "medium" : "hard",
    }))
    .sort((a, b) => b.potentialClicks - a.potentialClicks)
    .slice(0, 50);

  // CTR optimization opportunities (ranking well but low CTR)
  const ctrOpportunities = queries
    .filter(q => {
      if (q.position <= 1.5) return q.ctr < 0.20;
      if (q.position <= 2.5) return q.ctr < 0.10;
      if (q.position <= 3.5) return q.ctr < 0.07;
      if (q.position <= 5.5) return q.ctr < 0.04;
      return false;
    })
    .filter(q => q.impressions >= 50)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);

  // Cannibalization (same query, multiple pages)
  const cannibalization = queries
    .filter(q => q.pageCount >= 2 && q.impressions >= 30)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  // Daily trends
  const dailyTrend = dateRows.map(r => ({
    date: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Totals
  const totalClicks = dailyTrend.reduce((s, d) => s + d.clicks, 0);
  const totalImpressions = dailyTrend.reduce((s, d) => s + d.impressions, 0);
  const avgCtr = dailyTrend.length > 0 ? dailyTrend.reduce((s, d) => s + d.ctr, 0) / dailyTrend.length : 0;
  const avgPosition = dailyTrend.length > 0 ? dailyTrend.reduce((s, d) => s + d.position, 0) / dailyTrend.length : 0;

  // Devices
  const devices = deviceRows.map(r => ({
    device: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));

  // Countries (top 20)
  const countries = countryRows
    .map(r => ({ country: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 20);

  // Build output
  const output = {
    meta: {
      site: args.site,
      siteUrl,
      fetchedAt: new Date().toISOString(),
      dateRange: { days: args.days, startDate: getDateString(-args.days), endDate: getDateString(-3) },
    },
    summary: {
      totalClicks,
      totalImpressions,
      averageCtr: avgCtr,
      averagePosition: avgPosition,
      totalQueries: queries.length,
      totalPages: pages.length,
    },
    dailyTrend,
    devices,
    countries,
    topQueries: queries.slice(0, 100),
    topPages: pages.slice(0, 100),
    lowHangingFruit,
    ctrOpportunities,
    cannibalization,
    sitemaps,
  };

  // Output
  const jsonStr = JSON.stringify(output, null, 2);
  if (args.output) {
    fs.writeFileSync(args.output, jsonStr);
    console.error(`[GSC] Data written to ${args.output} (${(Buffer.byteLength(jsonStr) / 1024).toFixed(1)} KB)`);
  } else {
    process.stdout.write(jsonStr);
  }

  console.error("[GSC] Done!");
}

main().catch(err => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
