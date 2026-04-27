#!/usr/bin/env node
/**
 * Content Gap Analyzer
 *
 * Finds high-impression GSC queries that your page content doesn't adequately cover.
 * Fetches per-page query data directly from the GSC API, then scores each query
 * against live page HTML to classify gaps as missing, partial, or underrepresented.
 *
 * Usage:
 *   node content-gap.cjs --site=myimageupscaler.com --page=https://myimageupscaler.com/blog/some-post
 *   node content-gap.cjs --site=myimageupscaler.com --top-pages=5 --gsc=/tmp/gsc-miu.json
 *   node content-gap.cjs --site=myimageupscaler.com --page=URL --days=90 --min-impressions=20
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const WEBMASTERS_BASE_URL = "https://www.googleapis.com/webmasters/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const DEFAULT_DAYS = 90;
const DEFAULT_LAG_DAYS = 3;
const DEFAULT_ROW_LIMIT = 25000;
const DEFAULT_MIN_IMPRESSIONS = 20;
const DEFAULT_TOP_PAGES = 5;

const KEY_FILE_PATHS = [
  process.env.GCP_KEY_FILE,
  path.join(process.env.HOME || "", "projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json"),
  "./cloud/keys/coldstart-labs-service-account-key.json",
].filter(Boolean);

const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by","from",
  "is","it","be","as","are","was","were","will","would","can","could","do","does",
  "did","have","has","had","not","this","that","these","those","how","what","which",
  "who","when","where","why","my","your","their","our","its","i","you","he","she",
  "we","they","me","him","her","us","vs","than","so","if","then","also","just","get",
]);

function printHelp() {
  console.error(`
Usage:
  node content-gap.cjs --site=example.com [options]

Options:
  --page=https://...         Analyze a specific page URL
  --top-pages=5              Analyze top N pages by impressions (requires --gsc)
  --gsc=/tmp/gsc.json        Pre-fetched GSC JSON to extract top-page URLs from
  --days=90                  Date window for GSC query (default: 90)
  --lag-days=3               Days to hold back for stable data (default: 3)
  --min-impressions=20       Minimum impressions to include a query (default: 20)
  --output=/tmp/gap.json     Write JSON to a file instead of stdout
  --search-type=web          GSC search type (default: web)
  --key=/path/to/key.json    Override service account key path
  --help                     Show this help
`);
}

function findKeyFile(explicitKeyPath) {
  const candidates = [explicitKeyPath, ...KEY_FILE_PATHS].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  console.error("ERROR: No service account key found. Set GCP_KEY_FILE or pass --key=");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    site: null,
    page: null,
    topPages: null,
    gsc: null,
    days: DEFAULT_DAYS,
    lagDays: DEFAULT_LAG_DAYS,
    minImpressions: DEFAULT_MIN_IMPRESSIONS,
    output: null,
    searchType: "web",
    key: null,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") { printHelp(); process.exit(0); }
    else if (arg.startsWith("--site=")) result.site = arg.split("=")[1];
    else if (arg.startsWith("--page=")) result.page = arg.split("=")[1];
    else if (arg.startsWith("--top-pages=")) result.topPages = parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--gsc=")) result.gsc = arg.split("=")[1];
    else if (arg.startsWith("--days=")) result.days = parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--lag-days=")) result.lagDays = parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--min-impressions=")) result.minImpressions = parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--output=")) result.output = arg.split("=")[1];
    else if (arg.startsWith("--search-type=")) result.searchType = arg.split("=")[1];
    else if (arg.startsWith("--key=")) result.key = arg.split("=")[1];
  }

  if (!result.site) {
    console.error("ERROR: --site=domain.com is required");
    printHelp();
    process.exit(1);
  }

  if (!result.page && !result.topPages) {
    console.error("ERROR: either --page=URL or --top-pages=N is required");
    printHelp();
    process.exit(1);
  }

  if (result.topPages && !result.gsc) {
    console.error("ERROR: --top-pages requires --gsc=/tmp/gsc-miu.json to get page list from");
    process.exit(1);
  }

  return result;
}

function getPacificTodayString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildDateRange(days, lagDays) {
  const today = getPacificTodayString();
  const endDate = shiftDate(today, -lagDays);
  const startDate = shiftDate(endDate, -(days - 1));
  return { startDate, endDate, days, lagDays };
}

function base64UrlEncode(val) {
  return Buffer.from(val).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createAccessToken(keyFile) {
  const key = JSON.parse(fs.readFileSync(keyFile, "utf8"));
  if (!key.client_email || !key.private_key) throw new Error(`Invalid key file: ${keyFile}`);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = { iss: key.client_email, scope: GSC_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).end().sign(key.private_key);
  const assertion = `${signingInput}.${base64UrlEncode(signature)}`;

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Token request failed (${resp.status}): ${text}`);
  return JSON.parse(text).access_token;
}

async function gscRequest({ method = "POST", url, accessToken, body }) {
  const resp = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`GSC request failed (${resp.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

async function fetchQueriesForPage({ accessToken, siteUrl, pageUrl, range, searchType, rowLimit }) {
  const rows = [];
  let startRow = 0;

  while (true) {
    const response = await gscRequest({
      url: `${WEBMASTERS_BASE_URL}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      accessToken,
      body: {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ["query"],
        type: searchType,
        dataState: "final",
        rowLimit,
        startRow,
        dimensionFilterGroups: [{
          filters: [{
            dimension: "page",
            operator: "equals",
            expression: pageUrl,
          }],
        }],
      },
    });

    const pageRows = response.rows || [];
    rows.push(...pageRows);
    if (pageRows.length < rowLimit) break;
    startRow += rowLimit;
  }

  return rows.map(row => ({
    query: row.keys[0],
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }));
}

async function fetchPageText(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ContentGapAnalyzer/1.0; +https://myimageupscaler.com)",
      "Accept": "text/html",
    },
    redirect: "follow",
  });

  if (!resp.ok) throw new Error(`Failed to fetch page (${resp.status}): ${url}`);
  const html = await resp.text();
  return { html, text: extractText(html), finalUrl: resp.url };
}

function extractText(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreCoverage(query, pageText) {
  const pageTextLower = pageText.toLowerCase();
  const queryTokens = tokenize(query);
  const meaningful = queryTokens.filter(t => !STOPWORDS.has(t) && t.length > 2);

  if (meaningful.length === 0) {
    return { score: 1, gapType: "covered", phraseFound: true, tokenResults: [] };
  }

  const tokenResults = meaningful.map(token => {
    const regex = new RegExp(`\\b${escapeRegex(token)}`, "gi");
    const matches = pageTextLower.match(regex) || [];
    return { token, count: matches.length, found: matches.length > 0 };
  });

  const foundCount = tokenResults.filter(t => t.found).length;
  const score = foundCount / meaningful.length;
  const phraseFound = pageTextLower.includes(query.toLowerCase());

  let gapType;
  if (score === 0) gapType = "missing";
  else if (score < 0.5) gapType = "partial";
  else if (!phraseFound || score < 1) gapType = "underrepresented";
  else gapType = "covered";

  return { score: Number(score.toFixed(3)), gapType, phraseFound, tokenResults };
}

function estimatePotentialClicks(impressions, position, currentCtr) {
  const expectedCtr = position <= 1.5 ? 0.28
    : position <= 2.5 ? 0.15
    : position <= 3.5 ? 0.11
    : position <= 5.5 ? 0.07
    : position <= 10.5 ? 0.04
    : 0.02;
  const targetCtr = Math.max(expectedCtr, currentCtr * 1.5);
  return Math.max(0, Math.round(impressions * (targetCtr - currentCtr)));
}

function priorityLevel(impressions, gapType) {
  if (gapType === "covered") return "none";
  if (impressions >= 500 && gapType === "missing") return "critical";
  if (impressions >= 200 && (gapType === "missing" || gapType === "partial")) return "high";
  if (impressions >= 50) return "medium";
  return "low";
}

function analyzeGaps(queries, pageText, minImpressions) {
  const totalImpressions = queries.reduce((sum, q) => sum + q.impressions, 0);

  const analyzed = queries
    .filter(q => q.impressions >= minImpressions)
    .map(q => {
      const coverage = scoreCoverage(q.query, pageText);
      const impressionWeight = totalImpressions > 0 ? Number((q.impressions / totalImpressions).toFixed(4)) : 0;
      const potentialClicks = estimatePotentialClicks(q.impressions, q.position, q.ctr);
      return {
        ...q,
        ...coverage,
        impressionWeight,
        potentialClicks,
        priority: priorityLevel(q.impressions, coverage.gapType),
      };
    })
    .sort((a, b) => b.impressions * (1 - b.score) - a.impressions * (1 - a.score));

  const gaps = analyzed.filter(q => q.gapType !== "covered");
  const covered = analyzed.filter(q => q.gapType === "covered");

  const gapImpressions = gaps.reduce((sum, q) => sum + q.impressions, 0);
  const gapScore = totalImpressions > 0 ? Number((gapImpressions / totalImpressions).toFixed(3)) : 0;

  return {
    totalQueries: queries.length,
    filteredQueries: analyzed.length,
    totalImpressions,
    gapScore,
    counts: {
      missing: gaps.filter(q => q.gapType === "missing").length,
      partial: gaps.filter(q => q.gapType === "partial").length,
      underrepresented: gaps.filter(q => q.gapType === "underrepresented").length,
      covered: covered.length,
    },
    priorityCounts: {
      critical: gaps.filter(q => q.priority === "critical").length,
      high: gaps.filter(q => q.priority === "high").length,
      medium: gaps.filter(q => q.priority === "medium").length,
      low: gaps.filter(q => q.priority === "low").length,
    },
    totalPotentialClicks: gaps.reduce((sum, q) => sum + q.potentialClicks, 0),
    gaps,
    covered: covered.slice(0, 20),
  };
}

function extractTopPages(gscJson, topN) {
  const data = JSON.parse(fs.readFileSync(gscJson, "utf8"));
  const pages = data?.topPages || data?.searchTypes?.web?.pages || [];
  return pages
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, topN)
    .map(p => p.page);
}

async function analyzePage({ accessToken, siteUrl, pageUrl, range, searchType, minImpressions }) {
  console.error(`[Gap] Fetching queries for: ${pageUrl}`);
  const queries = await fetchQueriesForPage({
    accessToken,
    siteUrl,
    pageUrl,
    range,
    searchType,
    rowLimit: DEFAULT_ROW_LIMIT,
  });

  console.error(`[Gap] ${queries.length} queries found. Fetching page content...`);
  const { text: pageText, finalUrl } = await fetchPageText(pageUrl);
  console.error(`[Gap] Page text length: ${pageText.length} chars. Running gap analysis...`);

  const analysis = analyzeGaps(queries, pageText, minImpressions);

  return {
    page: pageUrl,
    finalUrl,
    analysis,
    pageContentLength: pageText.length,
    pageContentSnippet: pageText.slice(0, 800),
  };
}

async function main() {
  const args = parseArgs();
  const keyFile = findKeyFile(args.key);
  const siteUrl = `sc-domain:${args.site}`;
  const range = buildDateRange(args.days, args.lagDays);

  console.error(`[Gap] Site: ${args.site}`);
  console.error(`[Gap] Range: ${range.startDate} → ${range.endDate} (${args.days} days)`);
  console.error(`[Gap] Min impressions: ${args.minImpressions}`);

  const accessToken = await createAccessToken(keyFile);
  console.error("[Gap] Authenticated.");

  let targetPages;
  if (args.page) {
    targetPages = [args.page];
  } else {
    console.error(`[Gap] Loading top ${args.topPages} pages from ${args.gsc}...`);
    targetPages = extractTopPages(args.gsc, args.topPages);
    console.error(`[Gap] Pages: ${targetPages.join(", ")}`);
  }

  const results = [];
  for (const pageUrl of targetPages) {
    const result = await analyzePage({
      accessToken,
      siteUrl,
      pageUrl,
      range,
      searchType: args.searchType,
      minImpressions: args.minImpressions,
    });
    results.push(result);
  }

  const output = {
    meta: {
      site: args.site,
      siteUrl,
      fetchedAt: new Date().toISOString(),
      dateRange: range,
      searchType: args.searchType,
      minImpressions: args.minImpressions,
      pagesAnalyzed: results.length,
    },
    pages: results,
    // Flattened view for single-page mode
    ...(results.length === 1 ? results[0] : {}),
  };

  const json = JSON.stringify(output, null, 2);
  if (args.output) {
    fs.writeFileSync(args.output, json);
    console.error(`[Gap] Written to ${args.output} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`);
  } else {
    process.stdout.write(json);
  }

  console.error("[Gap] Done.");
}

main().catch(err => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
