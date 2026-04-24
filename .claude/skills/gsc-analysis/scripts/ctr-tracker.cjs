#!/usr/bin/env node
/**
 * CTR Tracker — Before/After CTR Change Measurement
 *
 * Tracks CTR changes for specific pages over time, measuring the impact of
 * title/meta description changes. Stores snapshots for trend tracking.
 *
 * Usage:
 *   node ctr-tracker.cjs --site=myimageupscaler.com --pages=slug1,slug2 --output=/tmp/ctr-snap.json
 *   node ctr-tracker.cjs --site=myimageupscaler.com --pages=slug1,slug2 --change-date=2026-04-25
 *   node ctr-tracker.cjs --site=myimageupscaler.com --all-ctr-deficit --min-impressions=1000
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const GSC_BASE = "https://www.googleapis.com/webmasters/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const KEY_FILE_PATHS = [
  process.env.GCP_KEY_FILE,
  path.join(
    process.env.HOME || "",
    "projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json"
  ),
  "./cloud/keys/coldstart-labs-service-account-key.json",
].filter(Boolean);

const DEFAULT_DAYS = 28;
const DEFAULT_LAG_DAYS = 3;

function printHelp() {
  console.error(`
Usage:
  node ctr-tracker.cjs [options]

Options:
  --site=myimageupscaler.com         Site domain (required)
  --pages=slug1,slug2,...            Blog slugs to track (comma-separated)
  --all-ctr-deficit                  Auto-track all pages with CTR below benchmark
  --min-impressions=1000             Minimum impressions to include (default: 1000)
  --change-date=2026-04-25           Date the change was made (for before/after split)
  --days=28                          Total days to analyze (default: 28)
  --snapshots=/path/to/snapshots.json  Load previous snapshots for comparison
  --output=/tmp/ctr-snap.json        Output file path
  --key=/path/to/key.json            Override service account key path
  --help                             Show this help
`);
}

function findKeyFile(explicitKeyPath) {
  const candidates = [explicitKeyPath, ...KEY_FILE_PATHS].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  console.error("ERROR: No service account key found.");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    site: null,
    pages: [],
    allCtrDeficit: false,
    minImpressions: 1000,
    changeDate: null,
    days: DEFAULT_DAYS,
    snapshots: null,
    output: null,
    key: null,
    lagDays: DEFAULT_LAG_DAYS,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--site=")) {
      result.site = arg.split("=")[1];
    } else if (arg.startsWith("--pages=")) {
      result.pages = arg.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--all-ctr-deficit") {
      result.allCtrDeficit = true;
    } else if (arg.startsWith("--min-impressions=")) {
      result.minImpressions = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--change-date=")) {
      result.changeDate = arg.split("=")[1];
    } else if (arg.startsWith("--days=")) {
      result.days = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--snapshots=")) {
      result.snapshots = arg.split("=")[1];
    } else if (arg.startsWith("--output=")) {
      result.output = arg.split("=")[1];
    } else if (arg.startsWith("--key=")) {
      result.key = arg.split("=")[1];
    } else if (arg.startsWith("--lag-days=")) {
      result.lagDays = parseInt(arg.split("=")[1], 10);
    }
  }

  if (!result.site) {
    console.error("ERROR: --site is required");
    printHelp();
    process.exit(1);
  }

  return result;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createAccessToken(keyFile) {
  const key = JSON.parse(fs.readFileSync(keyFile, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .end()
    .sign(key.private_key);
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
  if (!response.ok)
    throw new Error(`Token request failed (${response.status}): ${bodyText}`);

  const payload = JSON.parse(bodyText);
  return { accessToken: payload.access_token, clientEmail: key.client_email };
}

function getPacificTodayString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateString, days) {
  const [y, m, d] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Expected CTR by position (Averagesourced from Advanced Web Ranking / SISTRIX studies)
function expectedCtrForPosition(position) {
  const benchmarks = [
    31.7, 15.8, 10.6, 7.4, 5.4, 4.1, 3.2, 2.5, 2.0, 1.6, // 1-10
    1.3, 1.1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.4, 0.4, // 11-20
  ];
  const idx = Math.max(0, Math.min(Math.floor(position) - 1, benchmarks.length - 1));
  return benchmarks[idx] / 100;
}

async function fetchPageData(accessToken, siteUrl, startDate, endDate) {
  const response = await fetch(
    `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["page"],
        type: "web",
        rowLimit: 1000,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GSC page query failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  return (data.rows || []).map((row) => ({
    page: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

async function main() {
  const args = parseArgs();
  const keyFile = findKeyFile(args.key);
  const pacificToday = getPacificTodayString();
  const endDate = shiftDate(pacificToday, -args.lagDays);
  const startDate = shiftDate(endDate, -(args.days - 1));

  const siteUrl = args.site.includes(":")
    ? args.site
    : `sc-domain:${args.site}`;

  console.error(`[CTR] Site: ${args.site}`);
  console.error(`[CTR] Period: ${startDate} → ${endDate} (${args.days} days)`);
  console.error(`[CTR] Change date: ${args.changeDate || "not specified"}`);

  const { accessToken } = await createAccessToken(keyFile);
  console.error(`[CTR] Authenticated`);

  // Fetch current period
  console.error(`[CTR] Fetching current period...`);
  const currentPages = await fetchPageData(
    accessToken,
    siteUrl,
    startDate,
    endDate
  );

  // Build a map by slug for easy lookup
  const pageBySlug = new Map();
  for (const p of currentPages) {
    const match = p.page.match(/\/blog\/([^/?#]+)/);
    if (match) {
      const slug = match[1];
      const existing = pageBySlug.get(slug);
      if (!existing || p.impressions > existing.impressions) {
        pageBySlug.set(slug, p);
      }
    }
    // Also index homepage and other paths
    const pathKey = p.page.replace(/https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/";
    if (!pageBySlug.has(pathKey)) {
      pageBySlug.set(pathKey, p);
    }
  }

  // Determine which pages to track
  let trackedSlugs = [];

  if (args.pages.length > 0) {
    trackedSlugs = args.pages;
  } else if (args.allCtrDeficit) {
    // Find all pages with CTR below benchmark
    for (const [slug, p] of pageBySlug) {
      if (p.impressions >= args.minImpressions) {
        const expected = expectedCtrForPosition(p.position);
        if (p.ctr < expected * 0.5) {
          trackedSlugs.push(slug);
        }
      }
    }
    trackedSlugs.sort((a, b) => {
      const pa = pageBySlug.get(a);
      const pb = pageBySlug.get(b);
      return (pb?.impressions || 0) - (pa?.impressions || 0);
    });
    console.error(
      `[CTR] Found ${trackedSlugs.length} CTR-deficit pages (impressions >= ${args.minImpressions})`
    );
  } else {
    // Default: top 10 by impressions
    trackedSlugs = [...pageBySlug.entries()]
      .filter(([, p]) => p.impressions >= args.minImpressions)
      .sort(([, a], [, b]) => b.impressions - a.impressions)
      .slice(0, 10)
      .map(([slug]) => slug);
  }

  // Build snapshot
  const snapshotDate = pacificToday;
  const snapshot = {
    meta: {
      site: args.site,
      snapshotDate,
      period: { startDate, endDate, days: args.days },
      changeDate: args.changeDate || null,
      trackedPagesCount: trackedSlugs.length,
    },
    pages: trackedSlugs.map((slug) => {
      const p = pageBySlug.get(slug) || { page: slug, clicks: 0, impressions: 0, ctr: 0, position: 0 };
      const expected = expectedCtrForPosition(p.position);
      const missedClicks = Math.round(p.impressions * expected - p.clicks);
      return {
        slug,
        url: p.page,
        clicks: p.clicks,
        impressions: p.impressions,
        ctr: Number(p.ctr.toFixed(6)),
        position: Number(p.position.toFixed(1)),
        expectedCtr: Number(expected.toFixed(4)),
        ctrDeficit: Number((expected - p.ctr).toFixed(4)),
        missedClicks: Math.max(0, missedClicks),
      };
    }),
  };

  // Load previous snapshots for comparison
  let previousSnapshots = [];
  if (args.snapshots && fs.existsSync(args.snapshots)) {
    try {
      const data = JSON.parse(fs.readFileSync(args.snapshots, "utf8"));
      if (Array.isArray(data)) previousSnapshots = data;
      else if (data.snapshots) previousSnapshots = data.snapshots;
    } catch {}
  }

  // Build comparison if we have previous data
  let comparison = null;
  const prevSnapshot = previousSnapshots.length > 0
    ? previousSnapshots[previousSnapshots.length - 1]
    : null;

  if (prevSnapshot) {
    comparison = {
      previousDate: prevSnapshot.meta.snapshotDate,
      pages: snapshot.pages.map((current) => {
        const prev = prevSnapshot.pages.find(
          (p) => p.slug === current.slug
        );
        if (!prev) return null;
        return {
          slug: current.slug,
          before: {
            clicks: prev.clicks,
            impressions: prev.impressions,
            ctr: prev.ctr,
            position: prev.position,
          },
          after: {
            clicks: current.clicks,
            impressions: current.impressions,
            ctr: current.ctr,
            position: current.position,
          },
          delta: {
            clicks: current.clicks - prev.clicks,
            impressions: current.impressions - prev.impressions,
            ctrPct:
              prev.ctr > 0
                ? Number(((current.ctr - prev.ctr) / prev.ctr) * 100).toFixed(1)
                : null,
            positionChange: Number(
              (prev.position - current.position).toFixed(1)
            ),
          },
        };
      }).filter(Boolean),
    };
  }

  // Output
  const output = {
    ...snapshot,
    comparison,
    previousSnapshotCount: previousSnapshots.length,
  };

  const json = JSON.stringify(output, null, 2);
  if (args.output) {
    // If appending to existing snapshots file, store as array
    const allSnapshots = [...previousSnapshots, { meta: snapshot.meta, pages: snapshot.pages }];
    const snapshotJson = JSON.stringify(
      args.snapshots
        ? { snapshots: allSnapshots, latest: output }
        : output,
      null,
      2
    );
    fs.writeFileSync(args.output, snapshotJson);
    console.error(
      `[CTR] Written to ${args.output} (${trackedSlugs.length} pages, snapshot #${allSnapshots.length})`
    );
  } else {
    process.stdout.write(json);
  }

  // Print summary
  console.error(`\n[CTR] === SUMMARY ===`);
  const totalClicks = snapshot.pages.reduce((s, p) => s + p.clicks, 0);
  const totalImpr = snapshot.pages.reduce((s, p) => s + p.impressions, 0);
  const totalMissed = snapshot.pages.reduce((s, p) => s + p.missedClicks, 0);
  console.error(
    `[CTR] ${trackedSlugs.length} pages: ${totalClicks} clicks, ${totalImpr} impressions, ${totalMissed} missed clicks`
  );

  if (comparison) {
    console.error(`\n[CTR] === CHANGE vs ${comparison.previousDate} ===`);
    for (const c of comparison.pages) {
      const arrow = c.delta.ctrPct > 0 ? "↑" : c.delta.ctrPct < 0 ? "↓" : "→";
      console.error(
        `[CTR] ${c.slug}: CTR ${arrow} ${c.delta.ctrPct}% (${c.before.ctr.toFixed(4)} → ${c.after.ctr.toFixed(4)}), clicks ${c.delta.clicks >= 0 ? "+" : ""}${c.delta.clicks}`
      );
    }
  }

  console.error(`[CTR] Done!`);
}

main().catch((error) => {
  console.error("FATAL:", error.message || error);
  process.exit(1);
});
