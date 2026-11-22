const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = 'https://myimageupscaler.com';
const DEFAULT_RECENT_CUTOFF = '2026-10-07';
const MANIFEST_RELATIVE_PATH = 'docs/SEO/reports/2026-11-21-index-bloat-manifest.json';
const CONSOLIDATION_RELATIVE_PATH = 'shared/constants/blog-consolidation.json';
const INPUT_DIR = 'docs/SEO/reports/inputs/2026-11-21-index-bloat';
const GA4_BLOG_LANDING_RELATIVE_PATH = `${INPUT_DIR}/ga4-blog-landing-90d.json`;

const OWNER_RULES = [
  { pattern: 'background|transparent|cutout|masking', target: '/tools/remove-bg' },
  { pattern: 'nois|grain|denois', target: '/blog/noise-reduction-in-photos' },
  {
    pattern: 'restor|old-photo|old-pictures|damaged|coloriz|black-and-white|preserv|digitiz|photographs',
    target: '/blog/best-free-photo-restoration-services-online',
  },
  { pattern: 'blur|sharpen|focus|clear-up', target: '/blog/best-app-for-unblurring-photos' },
  { pattern: 'print|dpi|poster', target: '/blog/upscale-image-for-print-300-dpi-guide' },
  { pattern: 'enhanc|retouch|quality|photo-edit', target: '/blog/best-free-ai-photo-enhancer-online' },
  { pattern: 'upscal|resolution|enlarg|bigger|pixels|hd|4k|8k', target: '/blog/best-image-upscaler' },
];

const GUARDED_SLUGS = [
  'tiktok-profile-picture-ideas',
  'topaz-labs-free-trial',
  'poster-size-dimensions-pixels',
  'best-free-ai-image-upscaler-2026-tested-compared',
  'image-upscaler-8x',
  ...OWNER_RULES.filter((rule) => rule.target.startsWith('/blog/')).map((rule) =>
    rule.target.slice('/blog/'.length)
  ),
];

const GUARDED_ALTERNATIVE_SLUGS = ['vs-adobe-express', 'vs-bigjpg', 'vs-waifu2x', 'vs-iloveimg'];
const OFF_TOPIC_SLUGS = [
  '4-k-youtube-to-mp-4',
  'animation-maker-for-minecraft',
  'convert-video-to-hd-1080-p-online-free',
  'windows-11-snap-layouts',
];

const BLOG_DISPOSITIONS = ['KEEP', 'DEFER_GUARDED', 'DEFER_RECENT', 'MERGE_301', 'NOINDEX_UNPUBLISH'];
const PSEO_DISPOSITIONS = ['KEEP', 'DEFER_GUARDED', 'NOINDEX_UNPUBLISH'];

function normalizeUrl(url) {
  return String(url).split('#')[0].split('?')[0].replace(/\/+$/, '');
}

function classifyBlogPost({ slug, clicks180, lastmod, offTopic, ga4Conversions90 }, opts = {}) {
  const recentCutoff = opts.recentCutoff || DEFAULT_RECENT_CUTOFF;
  if (GUARDED_SLUGS.includes(slug)) return { disposition: 'DEFER_GUARDED' };
  if (offTopic && (ga4Conversions90 ?? 0) === 0) {
    return { disposition: 'NOINDEX_UNPUBLISH', reason: 'off-topic, 0 GA4 conversions in 90d' };
  }
  if (clicks180 > 0) return { disposition: 'KEEP' };
  if (lastmod && lastmod >= recentCutoff) return { disposition: 'DEFER_RECENT' };
  const rule = OWNER_RULES.find((candidate) => new RegExp(candidate.pattern).test(slug));
  if (rule) return { disposition: 'MERGE_301', target: rule.target };
  return { disposition: 'NOINDEX_UNPUBLISH' };
}

function classifyPseoPage({ category, slug, clicks180 }) {
  if (category === 'alternatives' && GUARDED_ALTERNATIVE_SLUGS.includes(slug)) {
    return { disposition: 'DEFER_GUARDED' };
  }
  return { disposition: clicks180 > 0 ? 'KEEP' : 'NOINDEX_UNPUBLISH' };
}

function sumGscByUrl(rows) {
  const totals = new Map();
  for (const row of rows) {
    const key = normalizeUrl(row.page);
    const current = totals.get(key) || { clicks: 0, impressions: 0 };
    current.clicks += row.clicks || 0;
    current.impressions += row.impressions || 0;
    totals.set(key, current);
  }
  return totals;
}

function sumGa4ByUrl(rows = []) {
  const totals = new Map();
  for (const row of rows) {
    const key = normalizeUrl(row.page);
    const current = totals.get(key) || { sessions: 0, conversions: 0 };
    current.sessions += row.sessions || 0;
    current.conversions += row.conversions || 0;
    totals.set(key, current);
  }
  return totals;
}

function countDispositions(rows, dispositions) {
  return Object.fromEntries(
    dispositions.map((disposition) => [
      disposition,
      rows.filter((row) => row.disposition === disposition).length,
    ])
  );
}

function assertOwnerTargetsKeep(totals) {
  for (const rule of OWNER_RULES) {
    if (!rule.target.startsWith('/blog/')) continue;
    const clicks = (totals.get(normalizeUrl(`${BASE_URL}${rule.target}`)) || { clicks: 0 }).clicks;
    if (clicks <= 0) {
      throw new Error(`Owner target ${rule.target} is not KEEP: requires clicks180 > 0`);
    }
  }
}

function buildManifest(inputs, opts = {}) {
  const recentCutoff = opts.recentCutoff || DEFAULT_RECENT_CUTOFF;
  const totals = sumGscByUrl(inputs.gsc.rows);
  const ga4Totals = sumGa4ByUrl(inputs.ga4 && inputs.ga4.rows);
  assertOwnerTargetsKeep(totals);

  const blog = [];
  const seenSlugs = new Set();
  for (const entry of inputs.sitemap.urls) {
    const normalized = normalizeUrl(entry.loc);
    const marker = '/blog/';
    const index = normalized.indexOf(marker);
    if (index === -1) continue;
    const slug = normalized.slice(index + marker.length);
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    const clicks180 = (totals.get(`${BASE_URL}${marker}${slug}`) || { clicks: 0 }).clicks;
    const impressions180 = (totals.get(`${BASE_URL}${marker}${slug}`) || { impressions: 0 }).impressions;
    const ga4 = ga4Totals.get(`${marker}${slug}`) || { sessions: 0, conversions: 0 };
    const offTopic = OFF_TOPIC_SLUGS.includes(slug);
    const row = {
      slug,
      url: `${BASE_URL}${marker}${slug}`,
      clicks180,
      impressions180,
      ga4Sessions90: ga4.sessions,
      ga4Conversions90: ga4.conversions,
      lastmod: entry.lastmod || null,
      ...classifyBlogPost(
        {
          slug,
          clicks180,
          impressions180,
          lastmod: entry.lastmod,
          offTopic,
          ga4Conversions90: ga4.conversions,
        },
        { recentCutoff }
      ),
    };
    if (offTopic) row.offTopic = true;
    blog.push(row);
  }
  blog.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  const pseo = [];
  for (const group of inputs.pseo) {
    for (const page of group.pages) {
      const url = `${BASE_URL}/${group.category}/${page.slug}`;
      const clicks180 = (totals.get(normalizeUrl(url)) || { clicks: 0 }).clicks;
      pseo.push({
        category: group.category,
        slug: page.slug,
        url,
        clicks180,
        ...classifyPseoPage({ category: group.category, slug: page.slug, clicks180 }),
      });
    }
  }
  pseo.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  return {
    generatedFrom: {
      gscRange: { startDate: inputs.gsc.startDate, endDate: inputs.gsc.endDate },
      sitemapFetchedAt: inputs.sitemap.fetchedAt,
    },
    rules: { recentCutoff, ownerRules: OWNER_RULES },
    summary: {
      blog: countDispositions(blog, BLOG_DISPOSITIONS),
      pseo: countDispositions(pseo, PSEO_DISPOSITIONS),
    },
    blog,
    pseo,
  };
}

function buildConsolidation(manifest) {
  const redirects = {};
  for (const row of manifest.blog) {
    if (row.disposition !== 'MERGE_301') continue;
    redirects[row.slug] = row.target;
  }

  return {
    source: MANIFEST_RELATIVE_PATH,
    redirects: Object.fromEntries(
      Object.keys(redirects)
        .sort()
        .map((slug) => [slug, redirects[slug]])
    ),
    noindex: manifest.blog
      .filter((row) => row.disposition === 'NOINDEX_UNPUBLISH')
      .map((row) => row.slug)
      .sort(),
  };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8'));
}

function formatSummary(summary) {
  return Object.entries(summary)
    .map(([disposition, count]) => `${disposition}=${count}`)
    .join(' ');
}

if (require.main === module) {
  const manifest = buildManifest({
    gsc: readJson(`${INPUT_DIR}/gsc-pages-180d.json`),
    sitemap: readJson(`${INPUT_DIR}/sitemap-blog.json`),
    ga4: readJson(GA4_BLOG_LANDING_RELATIVE_PATH),
    pseo: [readJson('app/seo/data/platform-format.json'), readJson('app/seo/data/alternatives.json')].map(
      (data) => ({ category: data.category, pages: data.pages })
    ),
  });
  const outputPath = path.join(__dirname, '..', '..', MANIFEST_RELATIVE_PATH);
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`blog ${formatSummary(manifest.summary.blog)}`);
  console.log(`pseo ${formatSummary(manifest.summary.pseo)}`);

  if (process.argv.includes('--emit-consolidation')) {
    const consolidationPath = path.join(__dirname, '..', '..', CONSOLIDATION_RELATIVE_PATH);
    fs.writeFileSync(
      consolidationPath,
      `${JSON.stringify(buildConsolidation(manifest), null, 2)}\n`
    );
    console.log(`consolidation ${CONSOLIDATION_RELATIVE_PATH}`);
  }
}

module.exports = {
  normalizeUrl,
  classifyBlogPost,
  classifyPseoPage,
  buildManifest,
  buildConsolidation,
  GUARDED_SLUGS,
  OWNER_RULES,
  OFF_TOPIC_SLUGS,
  DEFAULT_RECENT_CUTOFF,
};
