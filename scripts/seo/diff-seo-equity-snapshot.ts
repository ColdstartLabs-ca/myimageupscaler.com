import { readFileSync } from 'node:fs';
import { hasMaterialSeoEquityChange } from '../../lib/seo/seo-equity-scoring';
import { seoEquitySnapshotSchema } from '../../lib/seo/seo-equity.schema';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

const beforePath = getArg('before');
const afterPath = getArg('after');
const minScoreDelta = Number(getArg('min-score-delta') ?? 3);

if (!beforePath || !afterPath) {
  throw new Error('Usage: tsx scripts/seo/diff-seo-equity-snapshot.ts --before=content/seo-equity.json --after=tmp/seo-equity.json');
}

const before = seoEquitySnapshotSchema.parse(JSON.parse(readFileSync(beforePath, 'utf8')));
const after = seoEquitySnapshotSchema.parse(JSON.parse(readFileSync(afterPath, 'utf8')));
const result = hasMaterialSeoEquityChange(before, after, { minScoreDelta });

if (!result.material) {
  console.log('No material SEO equity change: promoted sets unchanged and score movement is below threshold.');
  process.exit(0);
}

console.log(`Material SEO equity change detected: ${result.reasons.join('; ')}`);
process.exit(1);
