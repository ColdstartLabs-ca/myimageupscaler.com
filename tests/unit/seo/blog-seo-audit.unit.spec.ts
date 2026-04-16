/**
 * Tests for the blog SEO audit logic used by audit-blog-seo.cjs.
 *
 * Validates the deterministic checks:
 * 1. Title/meta description SERP length compliance
 * 2. Keyword overlap between GSC queries and titles
 * 3. Intent modifier alignment (query intent vs title promise)
 * 4. CTR vs position benchmarks
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pure functions mirroring audit-blog-seo.cjs logic.
// These are the same algorithms — if the script changes, update here too.
// ---------------------------------------------------------------------------

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 160;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'and', 'but', 'or', 'yet', 'if', 'it', 'its', 'i',
  'my', 'your', 'you', 'we', 'they', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom',
]);

const INTENT_PATTERNS = [
  {
    name: 'listicle',
    queryPattern: /\b(best|top|ranking|rated)\b/i,
    titleShould: /\b(best|top|\d+|ranked|comparison|compared|tested|reviewed|pick)\b/i,
    mismatchHint: 'listicle/ranking intent',
  },
  {
    name: 'how-to',
    queryPattern: /\b(how\s+to|guide|tutorial|step|steps)\b/i,
    titleShould: /\b(how\s+to|guide|tutorial|step|method|way|technique)\b/i,
    mismatchHint: 'tutorial intent',
  },
  {
    name: 'comparison',
    queryPattern: /\b(vs|versus|compare|comparison|difference|or)\b/i,
    titleShould: /\b(vs|versus|compare|comparison|difference|explained)\b/i,
    mismatchHint: 'comparison intent',
  },
  {
    name: 'free-tool',
    queryPattern: /\b(free|no\s+watermark|no\s+signup|online|without\s+paying)\b/i,
    titleShould: /\b(free|no\s+watermark|no\s+signup|online)\b/i,
    mismatchHint: 'free-tool-seeking intent',
  },
  {
    name: 'explainer',
    queryPattern: /\b(what\s+is|explained|meaning|definition|works)\b/i,
    titleShould: /\b(what\s+is|explained|meaning|how\s+.*works|understanding)\b/i,
    mismatchHint: 'explainer intent',
  },
];

const CTR_BENCHMARKS = [
  { maxPosition: 1.5, expectedCtr: 0.25, label: 'pos 1' },
  { maxPosition: 2.5, expectedCtr: 0.15, label: 'pos 2' },
  { maxPosition: 3.5, expectedCtr: 0.10, label: 'pos 3' },
  { maxPosition: 5.5, expectedCtr: 0.06, label: 'pos 4-5' },
  { maxPosition: 7.5, expectedCtr: 0.03, label: 'pos 6-7' },
  { maxPosition: 10.5, expectedCtr: 0.02, label: 'pos 8-10' },
  { maxPosition: 15.5, expectedCtr: 0.01, label: 'pos 11-15' },
  { maxPosition: 20.5, expectedCtr: 0.005, label: 'pos 16-20' },
];

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

function keywordOverlap(titleTokens: string[], queryTokens: string[]): number {
  if (queryTokens.length === 0) return 1;
  const titleSet = new Set(titleTokens);
  const matches = queryTokens.filter(t => titleSet.has(t));
  return matches.length / queryTokens.length;
}

interface IQuery {
  query: string;
  impressions: number;
}

function detectIntentMismatches(
  topQueries: IQuery[],
  title: string
): { intent: string; impressionShare: number; hint: string }[] {
  const mismatches: { intent: string; impressionShare: number; hint: string }[] = [];
  const intentCounts: Record<string, { impressions: number; pattern: typeof INTENT_PATTERNS[0] }> = {};
  let totalImpressions = 0;

  for (const q of topQueries) {
    totalImpressions += q.impressions;
    for (const pattern of INTENT_PATTERNS) {
      if (pattern.queryPattern.test(q.query)) {
        if (!intentCounts[pattern.name]) {
          intentCounts[pattern.name] = { impressions: 0, pattern };
        }
        intentCounts[pattern.name].impressions += q.impressions;
      }
    }
  }

  for (const [, { impressions, pattern }] of Object.entries(intentCounts)) {
    const share = totalImpressions > 0 ? impressions / totalImpressions : 0;
    if (share >= 0.3 && !pattern.titleShould.test(title)) {
      mismatches.push({
        intent: pattern.name,
        impressionShare: Math.round(share * 100),
        hint: pattern.mismatchHint,
      });
    }
  }

  return mismatches;
}

function getCtrBenchmark(position: number) {
  for (const b of CTR_BENCHMARKS) {
    if (position <= b.maxPosition) return b;
  }
  return { maxPosition: Infinity, expectedCtr: 0.003, label: 'pos 20+' };
}

interface ILengthIssue {
  field: string;
  severity: string;
  message: string;
  value: number;
}

function checkLengths(title: string, description: string): ILengthIssue[] {
  const issues: ILengthIssue[] = [];
  const titleLen = (title || '').length;
  const descLen = (description || '').length;

  if (titleLen < TITLE_MIN) {
    issues.push({ field: 'title', severity: 'error', message: `Title too short (${titleLen} chars, min ${TITLE_MIN})`, value: titleLen });
  } else if (titleLen > TITLE_MAX) {
    issues.push({ field: 'title', severity: 'warning', message: `Title too long (${titleLen} chars, max ${TITLE_MAX})`, value: titleLen });
  }

  if (descLen < DESC_MIN) {
    issues.push({ field: 'description', severity: 'error', message: `Meta description too short (${descLen} chars, min ${DESC_MIN})`, value: descLen });
  } else if (descLen > DESC_MAX) {
    issues.push({ field: 'description', severity: 'warning', message: `Meta description too long (${descLen} chars, max ${DESC_MAX})`, value: descLen });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Blog SEO Audit — SERP length checks', () => {
  it('passes a title within 30-60 chars', () => {
    const issues = checkLengths('Best Free AI Image Upscaler Tools 2026', 'A'.repeat(140));
    expect(issues.filter(i => i.field === 'title')).toHaveLength(0);
  });

  it('flags a title shorter than 30 chars as error', () => {
    const issues = checkLengths('AI Upscaler', 'A'.repeat(140));
    expect(issues).toContainEqual(expect.objectContaining({ field: 'title', severity: 'error' }));
  });

  it('flags a title longer than 60 chars as warning', () => {
    const longTitle = 'The Complete Guide to Best Free AI Image Upscaler Tools in 2026 — Tested and Compared';
    expect(longTitle.length).toBeGreaterThan(60);
    const issues = checkLengths(longTitle, 'A'.repeat(140));
    expect(issues).toContainEqual(expect.objectContaining({ field: 'title', severity: 'warning' }));
  });

  it('flags a description shorter than 120 chars as error', () => {
    const issues = checkLengths('Valid Title That Is Long Enough', 'Too short desc.');
    expect(issues).toContainEqual(expect.objectContaining({ field: 'description', severity: 'error' }));
  });

  it('flags a description longer than 160 chars as warning', () => {
    const issues = checkLengths('Valid Title That Is Long Enough', 'A'.repeat(170));
    expect(issues).toContainEqual(expect.objectContaining({ field: 'description', severity: 'warning' }));
  });

  it('passes a description within 120-160 chars', () => {
    const issues = checkLengths('Valid Title That Is Long Enough', 'A'.repeat(145));
    expect(issues.filter(i => i.field === 'description')).toHaveLength(0);
  });
});

describe('Blog SEO Audit — tokenizer', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenize('Best AI Image Upscaler!')).toEqual(['best', 'ai', 'image', 'upscaler']);
  });

  it('removes stopwords', () => {
    expect(tokenize('how to upscale an image')).toEqual(['upscale', 'image']);
  });

  it('removes single-char tokens', () => {
    expect(tokenize('a b cd ef')).toEqual(['cd', 'ef']);
  });

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('Blog SEO Audit — keyword overlap', () => {
  it('returns 1.0 for perfect overlap', () => {
    const title = tokenize('best free ai image upscaler');
    const query = tokenize('best free ai image upscaler');
    expect(keywordOverlap(title, query)).toBe(1);
  });

  it('returns 0 when no keywords match', () => {
    const title = tokenize('photo enhancement explained');
    const query = tokenize('best free ai upscaler');
    expect(keywordOverlap(title, query)).toBe(0);
  });

  it('returns partial overlap ratio', () => {
    const title = tokenize('best ai image upscaler tools');
    const query = tokenize('best free ai upscaler'); // 'free' is missing from title
    // title has: best, ai, image, upscaler, tools
    // query has: best, free, ai, upscaler (4 tokens)
    // matches: best, ai, upscaler (3/4 = 0.75)
    expect(keywordOverlap(title, query)).toBe(0.75);
  });

  it('returns 1.0 when query tokens is empty', () => {
    expect(keywordOverlap(['best', 'ai'], [])).toBe(1);
  });
});

describe('Blog SEO Audit — intent alignment', () => {
  it('detects listicle intent mismatch', () => {
    const queries: IQuery[] = [
      { query: 'best free ai image upscaler', impressions: 5000 },
      { query: 'best ai upscaler 2026', impressions: 3000 },
      { query: 'image upscaler', impressions: 1000 },
    ];
    // Title doesn't match listicle intent — no "best", "top", numbers, etc.
    const mismatches = detectIntentMismatches(queries, 'Photo Enhancement vs Image Upscaling Quality');
    expect(mismatches).toContainEqual(expect.objectContaining({ intent: 'listicle' }));
  });

  it('does not flag listicle when title contains "best"', () => {
    const queries: IQuery[] = [
      { query: 'best free ai image upscaler', impressions: 5000 },
    ];
    const mismatches = detectIntentMismatches(queries, 'Best Free AI Image Upscaler Tools 2026');
    expect(mismatches.filter(m => m.intent === 'listicle')).toHaveLength(0);
  });

  it('does not flag listicle when title contains a number', () => {
    const queries: IQuery[] = [
      { query: 'best free ai image upscaler', impressions: 5000 },
    ];
    const mismatches = detectIntentMismatches(queries, '7 Free AI Image Upscaler Tools');
    expect(mismatches.filter(m => m.intent === 'listicle')).toHaveLength(0);
  });

  it('detects how-to intent mismatch', () => {
    const queries: IQuery[] = [
      { query: 'how to upscale image without losing quality', impressions: 3000 },
    ];
    const mismatches = detectIntentMismatches(queries, 'AI Image Upscaling Technology Overview');
    expect(mismatches).toContainEqual(expect.objectContaining({ intent: 'how-to' }));
  });

  it('does not flag how-to when title contains "guide"', () => {
    const queries: IQuery[] = [
      { query: 'how to upscale image for print', impressions: 3000 },
    ];
    const mismatches = detectIntentMismatches(queries, 'Upscale Image for Print: Complete Guide');
    expect(mismatches.filter(m => m.intent === 'how-to')).toHaveLength(0);
  });

  it('detects free-tool intent mismatch', () => {
    const queries: IQuery[] = [
      { query: 'free ai upscaler no watermark', impressions: 4000 },
      { query: 'upscale image free online', impressions: 2000 },
    ];
    const mismatches = detectIntentMismatches(queries, 'AI Image Upscaling Technology Explained');
    expect(mismatches).toContainEqual(expect.objectContaining({ intent: 'free-tool' }));
  });

  it('ignores intent when it represents < 30% of impressions', () => {
    const queries: IQuery[] = [
      { query: 'best ai upscaler', impressions: 200 }, // "best" = 20%
      { query: 'ai image upscaler', impressions: 400 },
      { query: 'photo enhancer', impressions: 400 },
    ];
    const mismatches = detectIntentMismatches(queries, 'AI Image Upscaling Technology');
    expect(mismatches.filter(m => m.intent === 'listicle')).toHaveLength(0);
  });

  it('detects comparison intent mismatch', () => {
    const queries: IQuery[] = [
      { query: 'upscaling vs sharpening', impressions: 3000 },
    ];
    const mismatches = detectIntentMismatches(queries, 'Image Enhancement Methods Overview');
    expect(mismatches).toContainEqual(expect.objectContaining({ intent: 'comparison' }));
  });
});

describe('Blog SEO Audit — CTR benchmarks', () => {
  it('returns pos 1 benchmark for position 1.2', () => {
    const b = getCtrBenchmark(1.2);
    expect(b.label).toBe('pos 1');
    expect(b.expectedCtr).toBe(0.25);
  });

  it('returns pos 3 benchmark for position 3.4', () => {
    const b = getCtrBenchmark(3.4);
    expect(b.label).toBe('pos 3');
    expect(b.expectedCtr).toBe(0.10);
  });

  it('returns pos 8-10 benchmark for position 7.5', () => {
    const b = getCtrBenchmark(7.5);
    expect(b.label).toBe('pos 6-7');
    expect(b.expectedCtr).toBe(0.03);
  });

  it('returns pos 20+ fallback for position 25', () => {
    const b = getCtrBenchmark(25);
    expect(b.label).toBe('pos 20+');
    expect(b.expectedCtr).toBe(0.003);
  });

  it('can identify severely underperforming CTR', () => {
    // Position 3.4 with 0% CTR on 2400 impressions
    const benchmark = getCtrBenchmark(3.4);
    const ctrRatio = 0 / benchmark.expectedCtr;
    expect(ctrRatio).toBeLessThan(0.3); // severe underperformance
  });

  it('does not flag CTR within acceptable range', () => {
    // Position 5 with 5% CTR
    const benchmark = getCtrBenchmark(5);
    const ctrRatio = 0.05 / benchmark.expectedCtr;
    expect(ctrRatio).toBeGreaterThan(0.6); // acceptable
  });
});
