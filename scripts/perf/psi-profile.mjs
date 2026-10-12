// Programmatic PageSpeed Insights profiler.
// Usage: node scripts/perf/psi-profile.mjs [--out=dir] [url ...]
// Env: PAGESPEED_API_KEY (optional; keyless works at low quota).
import { mkdirSync, writeFileSync } from 'node:fs';

const DEFAULT_URLS = [
  'https://myimageupscaler.com/',
  'https://myimageupscaler.com/pricing',
  'https://myimageupscaler.com/tools/ai-image-upscaler',
  'https://myimageupscaler.com/blog/how-to-fix-blurry-digital-photos',
];
const args = process.argv.slice(2);
const outDir = (args.find(a => a.startsWith('--out=')) ?? '--out=.perf').slice(6);
const urls = args.filter(a => !a.startsWith('--'));
const targets = urls.length ? urls : DEFAULT_URLS;
const key = process.env.PAGESPEED_API_KEY;
const AUDITS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
  'server-response-time',
];

async function run(url, strategy) {
  const q = new URLSearchParams({ url, strategy, category: 'performance' });
  if (key) q.set('key', key);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`);
    if (res.ok) return res.json();
    if (attempt === 3) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    await new Promise(r => setTimeout(r, 5000 * attempt));
  }
}

function summarize(j) {
  const lh = j.lighthouseResult;
  const a = lh.audits;
  const metrics = Object.fromEntries(AUDITS.map(k => [k, a[k]?.displayValue]));
  const issues = Object.values(a)
    .filter(
      x =>
        x.score !== null &&
        x.score < 0.9 &&
        x.details &&
        x.scoreDisplayMode !== 'informative' &&
        (x.details.type === 'opportunity' ||
          x.details.type === 'table' ||
          x.details.type === 'list' ||
          x.details.type === 'criticalrequestchain')
    )
    .map(x => ({
      id: x.id,
      score: x.score,
      title: x.title,
      value: x.displayValue,
      savingsMs: x.details.overallSavingsMs ?? 0,
      savingsBytes: x.details.overallSavingsBytes ?? 0,
      items: (x.details.items ?? [])
        .slice(0, 5)
        .map(
          i =>
            i.url ?? i.node?.snippet ?? i.source?.url ?? i.label ?? JSON.stringify(i).slice(0, 150)
        ),
    }))
    .sort((p, q) => q.savingsMs - p.savingsMs || p.score - q.score);
  const field = j.loadingExperience?.metrics
    ? Object.fromEntries(
        Object.entries(j.loadingExperience.metrics).map(([k, v]) => [
          k,
          `${v.percentile} ${v.category}`,
        ])
      )
    : null;
  return { score: Math.round(lh.categories.performance.score * 100), metrics, field, issues };
}

mkdirSync(outDir, { recursive: true });
const report = {};
for (const url of targets) {
  for (const strategy of ['mobile', 'desktop']) {
    try {
      const j = await run(url, strategy);
      const s = summarize(j);
      report[`${strategy} ${url}`] = s;
      console.log(
        `${strategy.padEnd(7)} ${String(s.score).padStart(3)}  ${url}  ` +
          `LCP ${s.metrics['largest-contentful-paint']} TBT ${s.metrics['total-blocking-time']} CLS ${s.metrics['cumulative-layout-shift']}`
      );
    } catch (e) {
      console.log(`${strategy.padEnd(7)} ERR  ${url}  ${e.message}`);
    }
  }
}
writeFileSync(`${outDir}/psi-report.json`, JSON.stringify(report, null, 2));
console.log(`\nFull report: ${outDir}/psi-report.json`);
