#!/usr/bin/env node
// GSC causation correlator: day-by-day time series per tracked page/query,
// event-aligned pre/post windows, and weekly buckets.
//
// Fetch:  node scripts/gsc-daily-correlate.cjs --start=2026-05-01 --end=2026-08-31 --output=/tmp/gsc-daily.json
// Analyze saved data without refetching:
//         node scripts/gsc-daily-correlate.cjs --no-fetch --input=/tmp/gsc-daily.json --events=default-events.json
//
// Events JSON: array of { date: "YYYY-MM-DD", name: "...", pages: ["<page label>", ...], queries: ["<query label>", ...] }
// Page/query labels must match the tracked sets below (or pass --pages/--queries to override).
const fs = require('fs');
const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const BASE = 'https://www.googleapis.com/webmasters/v3/sites/';
const SITE = 'sc-domain:myimageupscaler.com';
const KEY_CANDIDATES = [
  process.env.GCP_KEY_FILE,
  '/home/joao/projects/convertbanktoexcel.com/cloud/keys/coldstart-labs-service-account-key.json',
].filter(Boolean);

function parseArgs(argv) {
  const out = { site: SITE, pages: null, queries: null, events: null, output: '/tmp/gsc-daily.json', input: null, noFetch: false, lagDays: 3, days: 120 };
  for (const arg of argv) {
    const [k, ...rest] = arg.replace(/^--/, '').split('=');
    const v = rest.join('=');
    if (k === 'site') out.site = v.startsWith('sc-domain:') ? v : `sc-domain:${v}`;
    else if (k === 'pages') out.pages = v.split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === 'queries') out.queries = v.split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === 'events') out.events = v;
    else if (k === 'output') out.output = v;
    else if (k === 'input') out.input = v;
    else if (k === 'no-fetch') out.noFetch = true;
    else if (k === 'lag-days') out.lagDays = parseInt(v, 10);
    else if (k === 'days') out.days = parseInt(v, 10);
  }
  return out;
}

// Curated MIU tracked surfaces. Labels are stable keys used by event files.
const PAGE_FILTERS = [
  ['blog/fixing-pixelated-photos', '/blog/fixing-pixelated-photos'],
  ['blog/best-free-ai-image-upscaler-2026', '/blog/best-free-ai-image-upscaler-2026-tested-compared'],
  ['tools/ai-image-upscaler', '/tools/ai-image-upscaler'],
  ['blog/topaz-video-upscaler', '/blog/topaz-video-upscaler'],
  ['blog/topaz-labs-free-trial', '/blog/topaz-labs-free-trial'],
  ['blog/poster-size-dimensions-pixels', '/blog/poster-size-dimensions-pixels'],
  ['blog/text-image-enhancer', '/blog/text-image-enhancer'],
  ['blog/photo-restoration-program', '/blog/photo-restoration-program'],
  ['blog/best-image-upscaler', '/blog/best-image-upscaler'],
  ['blog/how-to-upscale-youtube-thumbnails', '/blog/how-to-upscale-youtube-thumbnails'],
  ['blog/video-upscaling-software', '/blog/video-upscaling-software'],
  ['blog/best-free-ai-photo-enhancer-online', '/blog/best-free-ai-photo-enhancer-online'],
  ['blog/how-to-upscale-images-for-instagram', '/blog/how-to-upscale-images-for-instagram'],
  ['blog/free-photo-restoration-app', '/blog/free-photo-restoration-app'],
  ['blog/best-ai-upscaler', '/blog/best-ai-upscaler'],
  ['formats/upscale-gif-images', '/formats/upscale-gif-images (owner)'],
  ['format-scale/gif-upscale', '/format-scale/gif-upscale-* (retired members)'],
  ['blog/fix-pixelated-image', '/blog/fix-pixelated-image (competitor)'],
  ['blog/how-to-upscale-anime-images', '/blog/how-to-upscale-anime-images-with-ai'],
  ['blog/free-ai-upscaler-no-watermark', '/blog/free-ai-upscaler-no-watermark'],
  ['blog/ai-image-upscaling-vs-sharpening', '/blog/ai-image-upscaling-vs-sharpening-explained'],
  ['blog/sharpen-a-video', '/blog/sharpen-a-video'],
  ['blog/topaz-denoise-ai', '/blog/topaz-denoise-ai'],
  ['blog/best-ai-image-enhancer', '/blog/best-ai-image-enhancer'],
  ['blog/photoshop-upscale-image', '/blog/photoshop-upscale-image'],
];
const QUERY_FILTERS = [
  ['image upscaler', 'image upscaler (head term)'],
  ['how to fix pixelated photos', 'how to fix pixelated photos'],
  ['best free ai image upscaler 2026', 'best free ai image upscaler 2026'],
  ['gif upscaler', 'gif upscaler'],
  ['upscale gif', 'upscale gif'],
  ['myimageupscaler', 'brand: myimageupscaler'],
  ['my image upscaler', 'brand: my image upscaler'],
  ['topaz free', 'topaz free'],
  ['poster size dimensions pixels', 'poster size dimensions pixels'],
  ['best free ai photo enhancer online', 'best free ai photo enhancer online'],
];
const BRAND_QUERY_LABELS = ['brand: myimageupscaler', 'brand: my image upscaler'];

function b64u(v) {
  return Buffer.from(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function accessToken(keyFile) {
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64u(JSON.stringify({ iss: key.client_email, scope: GSC_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const input = `${header}.${claims}`;
  const sig = crypto.createSign('RSA-SHA256').update(input).end().sign(key.private_key);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${b64u(sig)}` }),
  });
  if (!res.ok) throw new Error(`token failed ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}
async function query(token, site, body, label) {
  const res = await fetch(`${BASE}${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} failed (${res.status}): ${text}`);
  return JSON.parse(text).rows || [];
}

const shift = (date, days) => { const dt = new Date(date + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + days); return dt.toISOString().slice(0, 10); };
const mondayOf = (d) => shift(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));

function dailySeries(rows) {
  const byDay = new Map();
  for (const r of rows) {
    const d = r.keys[0];
    const cur = byDay.get(d) || { clicks: 0, impressions: 0 };
    cur.clicks += r.clicks; cur.impressions += r.impressions;
    byDay.set(d, cur);
  }
  return byDay;
}
function win(series, from, to) {
  let clicks = 0, imps = 0, days = 0;
  let d = from;
  while (d <= to) {
    const v = series.get(d);
    if (v) { clicks += v.clicks; imps += v.impressions; days++; }
    d = shift(d, 1);
  }
  return days ? { clicks, imps, cpd: clicks / days, ipd: imps / days, days } : null;
}
function fmt(v) {
  if (!v) return 'no-data';
  return `${v.clicks.toFixed(0)} clicks / ${v.imps.toFixed(0)} imps (${v.cpd.toFixed(1)}/d vs ${v.ipd.toFixed(0)}/d)`;
}
function delta(pre, post) {
  if (!pre || !post) return '';
  if (pre.cpd === 0 && post.cpd === 0) return '';
  const c = pre.cpd ? (post.cpd / pre.cpd - 1) * 100 : null;
  const i = pre.ipd ? (post.ipd / pre.ipd - 1) * 100 : null;
  const pct = (x) => (x === null ? 'n/a' : (x > 0 ? '+' : '') + x.toFixed(0) + '%');
  return `[clicks/d ${pct(c)} | imps/d ${pct(i)}]`;
}
function weeklyBuckets(rows, label, showPos = true) {
  const weeks = new Map();
  for (const r of rows) {
    const mon = mondayOf(r.keys[0]);
    if (!weeks.has(mon)) weeks.set(mon, { rows: [], clicks: 0 });
    const w = weeks.get(mon);
    w.rows.push(r); w.clicks += r.clicks;
  }
  console.log(`\n## ${label}`);
  for (const k of Array.from(weeks.keys()).sort()) {
    const wkRows = weeks.get(k).rows;
    const imps = wkRows.reduce((a, r) => a + r.impressions, 0);
    const pos = imps ? wkRows.reduce((a, r) => a + r.position * r.impressions, 0) / imps : NaN;
    const ctr = imps ? (weeks.get(k).clicks / imps) * 100 : 0;
    const posPart = Number.isFinite(pos) ? ` / pos ${pos.toFixed(1)}` : '';
    console.log(`  ${k}: ${weeks.get(k).clicks.toFixed(0)} clicks / ${imps.toFixed(0)} imps${posPart} / CTR ${ctr.toFixed(2)}%`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let data;
  if (args.noFetch) {
    data = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  } else {
    const keyFile = KEY_CANDIDATES.find((p) => p && fs.existsSync(p));
    if (!keyFile) throw new Error('No service account key file found');
    const token = await accessToken(keyFile);
    const endDefault = shift(new Date().toISOString().slice(0, 10), -(args.lagDays + 1));
    const end = args.end || endDefault;
    const start = args.start || shift(end, -(args.days - 1));
    data = { site: args.site, start, end, dataState: 'final', daily: {}, pages: {}, queries: {} };
    const pageFilters = args.pages
      ? PAGE_FILTERS.filter(([, label]) => args.pages.includes(label))
      : PAGE_FILTERS;
    const queryFilters = args.queries
      ? QUERY_FILTERS.filter(([, label]) => args.queries.includes(label))
      : QUERY_FILTERS;
    data.daily = await query(token, args.site, { startDate: start, endDate: end, dimensions: ['date'], rowLimit: 25000, dataState: 'final' }, 'site daily');
    console.error(`site daily: ${data.daily.length} rows`);
    for (const [expr, label] of pageFilters) {
      data.pages[label] = await query(token, args.site, {
        startDate: start, endDate: end, dimensions: ['date', 'page'], rowLimit: 25000, dataState: 'final',
        dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: expr }] }],
      }, `page ${label}`);
      console.error(`page ${label}: ${data.pages[label].length} rows`);
    }
    for (const [expr, label] of queryFilters) {
      data.queries[label] = await query(token, args.site, {
        startDate: start, endDate: end, dimensions: ['date', 'query'], rowLimit: 25000, dataState: 'final',
        dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'equals', expression: expr }] }],
      }, `query ${label}`);
      console.error(`query ${label}: ${data.queries[label].length} rows`);
    }
    fs.writeFileSync(args.output, JSON.stringify(data));
    console.error(`WROTE ${args.output}`);
  }

  const events = args.events ? JSON.parse(fs.readFileSync(args.events, 'utf8')) : [];

  console.log('=== EVENT-ALIGNED WINDOWS: 14d before vs 14d after ===');
  const pageLabels = args.pages ? args.pages : Object.keys(data.pages);
  const queryLabels = args.queries ? args.queries : Object.keys(data.queries);
  for (const ev of events) {
    const targets = [...(ev.pages || []), ...(ev.queries || [])];
    console.log(`\n## ${ev.date} ${ev.name}`);
    for (const t of targets) {
      const rows = data.pages[t] || data.queries[t];
      if (!rows || !rows.length) { console.log(`  ${t}: no data`); continue; }
      const s = dailySeries(rows);
      const pre = win(s, shift(ev.date, -14), shift(ev.date, -1));
      const post = win(s, ev.date, shift(ev.date, 13));
      const late = win(s, shift(ev.date, 7), shift(ev.date, 20));
      console.log(`  ${t}`);
      console.log(`     pre14 : ${fmt(pre)}  ${delta(pre, post)}`);
      console.log(`     post14: ${fmt(post)}`);
      if (late) console.log(`     post7-20: ${fmt(late)}`);
    }
  }

  console.log('\n\n=== WEEKLY BUCKETS (clicks / impressions / pos / CTR). Last week is partial. ===');
  weeklyBuckets(data.daily, 'site-wide (web, final data)');
  const brandRows = [];
  for (const label of BRAND_QUERY_LABELS) if (data.queries[label]) brandRows.push(...data.queries[label]);
  const brandByDay = dailySeries(brandRows);
  const nonBrand = data.daily.map((r) => {
    const b = brandByDay.get(r.keys[0]) || { clicks: 0, impressions: 0 };
    return { keys: [r.keys[0]], clicks: Math.max(0, r.clicks - b.clicks), impressions: Math.max(0, r.impressions - b.impressions) };
  });
  weeklyBuckets(nonBrand, 'non-brand estimate (site minus 2 brand queries)');
  for (const label of Object.keys(data.pages)) if (data.pages[label].length) weeklyBuckets(data.pages[label], label);
  for (const label of Object.keys(data.queries)) if (data.queries[label].length) weeklyBuckets(data.queries[label], `query: ${label}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });