#!/usr/bin/env node
/**
 * Blog SEO Audit Script
 *
 * Static checks for blog post metadata quality — no AI, just deterministic rules.
 *
 * Checks:
 * 1. Title/meta description SERP length compliance
 * 2. Missing seo_title / seo_description overrides
 * 3. Keyword overlap between GSC queries and title/description
 * 4. Intent modifier alignment (query intent vs title promise)
 * 5. CTR vs position benchmark (flags underperformers)
 *
 * Usage:
 *   node audit-blog-seo.cjs --gsc=/tmp/gsc-myimageupscaler.com.json
 *   node audit-blog-seo.cjs --gsc=/tmp/gsc-myimageupscaler.com.json --output=/tmp/blog-audit.json
 *   node audit-blog-seo.cjs --gsc=/tmp/gsc-myimageupscaler.com.json --min-impressions=500
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 160;

// Expected CTR by average position range — based on industry benchmarks.
// Pages significantly below these thresholds have a snippet/intent problem.
const CTR_BENCHMARKS = [
  { maxPosition: 1.5, expectedCtr: 0.25, label: "pos 1" },
  { maxPosition: 2.5, expectedCtr: 0.15, label: "pos 2" },
  { maxPosition: 3.5, expectedCtr: 0.10, label: "pos 3" },
  { maxPosition: 5.5, expectedCtr: 0.06, label: "pos 4-5" },
  { maxPosition: 7.5, expectedCtr: 0.03, label: "pos 6-7" },
  { maxPosition: 10.5, expectedCtr: 0.02, label: "pos 8-10" },
  { maxPosition: 15.5, expectedCtr: 0.01, label: "pos 11-15" },
  { maxPosition: 20.5, expectedCtr: 0.005, label: "pos 16-20" },
];

// Intent modifiers — patterns in queries that signal what the searcher expects
const INTENT_PATTERNS = [
  {
    name: "listicle",
    queryPattern: /\b(best|top|ranking|rated)\b/i,
    titleShould: /\b(best|top|\d+|ranked|comparison|compared|tested|reviewed|pick)\b/i,
    mismatchHint: "Query signals listicle/ranking intent — title should contain 'Best', 'Top N', or signal a ranked list",
  },
  {
    name: "how-to",
    queryPattern: /\b(how\s+to|guide|tutorial|step|steps)\b/i,
    titleShould: /\b(how\s+to|guide|tutorial|step|method|way|technique)\b/i,
    mismatchHint: "Query signals tutorial intent — title should contain 'How to', 'Guide', or 'Steps'",
  },
  {
    name: "comparison",
    queryPattern: /\b(vs|versus|compare|comparison|difference|or)\b/i,
    titleShould: /\b(vs|versus|compare|comparison|difference|explained)\b/i,
    mismatchHint: "Query signals comparison intent — title should contain 'vs' or 'Comparison'",
  },
  {
    name: "free-tool",
    queryPattern: /\b(free|no\s+watermark|no\s+signup|online|without\s+paying)\b/i,
    titleShould: /\b(free|no\s+watermark|no\s+signup|online)\b/i,
    mismatchHint: "Query signals free-tool-seeking intent — title should contain 'Free' or 'No Watermark'",
  },
  {
    name: "explainer",
    queryPattern: /\b(what\s+is|explained|meaning|definition|works)\b/i,
    titleShould: /\b(what\s+is|explained|meaning|how\s+.*works|understanding)\b/i,
    mismatchHint: "Query signals explainer intent — title should contain 'Explained', 'What is', or 'How X Works'",
  },
];

// Stopwords to exclude from keyword overlap — adds noise to overlap scores
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "under", "again",
  "further", "then", "once", "here", "there", "when", "where", "why",
  "how", "all", "both", "each", "few", "more", "most", "other", "some",
  "such", "no", "nor", "not", "only", "own", "same", "so", "than",
  "too", "very", "and", "but", "or", "yet", "if", "it", "its", "i",
  "my", "your", "you", "we", "they", "this", "that", "these", "those",
  "what", "which", "who", "whom",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

function keywordOverlap(titleTokens, queryTokens) {
  if (queryTokens.length === 0) return 1;
  const titleSet = new Set(titleTokens);
  const matches = queryTokens.filter(t => titleSet.has(t));
  return matches.length / queryTokens.length;
}

function detectIntentMismatches(topQueries, title) {
  const mismatches = [];
  // Look at the dominant intent across top queries (by impression weight)
  const intentCounts = {};
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

  // Only flag if the intent pattern covers >= 30% of impressions
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

function getCtrBenchmark(position) {
  for (const b of CTR_BENCHMARKS) {
    if (position <= b.maxPosition) {
      return b;
    }
  }
  return { maxPosition: Infinity, expectedCtr: 0.003, label: "pos 20+" };
}

function checkLengths(title, description) {
  const issues = [];
  const titleLen = (title || "").length;
  const descLen = (description || "").length;

  if (titleLen < TITLE_MIN) {
    issues.push({ field: "title", severity: "error", message: `Title too short (${titleLen} chars, min ${TITLE_MIN})`, value: titleLen });
  } else if (titleLen > TITLE_MAX) {
    issues.push({ field: "title", severity: "warning", message: `Title too long — will be truncated in SERP (${titleLen} chars, max ${TITLE_MAX})`, value: titleLen });
  }

  if (descLen < DESC_MIN) {
    issues.push({ field: "description", severity: "error", message: `Meta description too short (${descLen} chars, min ${DESC_MIN})`, value: descLen });
  } else if (descLen > DESC_MAX) {
    issues.push({ field: "description", severity: "warning", message: `Meta description too long — will be truncated (${descLen} chars, max ${DESC_MAX})`, value: descLen });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Supabase fetch (lightweight, no SDK)
// ---------------------------------------------------------------------------

async function fetchBlogPosts() {
  const envPath = path.resolve(__dirname, "../../../../.env.api");
  let supabaseUrl = process.env.SUPABASE_URL;
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    try {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const eqIndex = trimmed.indexOf("=");
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (key === "SUPABASE_URL" && !supabaseUrl) supabaseUrl = value;
        if (key === "SUPABASE_SERVICE_ROLE_KEY" && !serviceRoleKey) serviceRoleKey = value;
      }
    } catch {
      // ignore
    }
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    console.error("Set them as env vars or ensure .env.api exists.");
    process.exit(1);
  }

  const url = `${supabaseUrl}/rest/v1/blog_posts?status=eq.published&select=slug,title,description,seo_title,seo_description`;
  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`ERROR fetching blog posts: ${response.status} ${text}`);
    process.exit(1);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

function extractBlogPages(gscData) {
  // GSC data has searchTypes.web.pages (or top-level pages)
  // Each page has: page, clicks, impressions, ctr, position, topQueries[]
  const webData = gscData.searchTypes?.web;
  if (!webData) {
    console.error("WARNING: No web search type data found in GSC JSON.");
    return [];
  }

  const pages = webData.pages || [];
  return pages.filter(p => p.page && p.page.includes("/blog/"));
}

function auditPost(post, gscPage, minImpressions) {
  const effectiveTitle = post.seo_title || post.title;
  const effectiveDesc = post.seo_description || post.description;
  const topQueries = (gscPage?.topQueries || []).slice(0, 10);

  const issues = [];

  // 1. Length checks
  const lengthIssues = checkLengths(effectiveTitle, effectiveDesc);
  issues.push(...lengthIssues);

  // 2. Missing SEO overrides
  if (!post.seo_title) {
    const titleLen = (post.title || "").length;
    if (titleLen > TITLE_MAX) {
      issues.push({
        field: "seo_title",
        severity: "error",
        message: `No seo_title set and title is ${titleLen} chars (SERP truncation guaranteed). Set seo_title to a 30-60 char version.`,
        value: titleLen,
      });
    } else {
      issues.push({
        field: "seo_title",
        severity: "info",
        message: "No seo_title override — using title field directly. Consider setting one for SERP optimization.",
        value: titleLen,
      });
    }
  }

  if (!post.seo_description) {
    const descLen = (post.description || "").length;
    if (descLen < DESC_MIN || descLen > DESC_MAX) {
      issues.push({
        field: "seo_description",
        severity: "error",
        message: `No seo_description set and description is ${descLen} chars (outside ${DESC_MIN}-${DESC_MAX} range). Set seo_description.`,
        value: descLen,
      });
    }
  }

  // 3-5 only apply if we have GSC data
  if (!gscPage || gscPage.impressions < minImpressions) {
    return { slug: post.slug, effectiveTitle, effectiveDesc, issues, gsc: null };
  }

  // 3. Keyword overlap
  const titleTokens = tokenize(effectiveTitle);
  const descTokens = tokenize(effectiveDesc);
  const titleDescTokens = [...new Set([...titleTokens, ...descTokens])];

  // Weight queries by impressions to find dominant query themes
  const queryWeightedTokens = new Map();
  for (const q of topQueries) {
    for (const token of tokenize(q.query)) {
      queryWeightedTokens.set(token, (queryWeightedTokens.get(token) || 0) + q.impressions);
    }
  }

  // Top query keywords by impression weight
  const topQueryKeywords = [...queryWeightedTokens.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([token]) => token);

  const titleOverlap = keywordOverlap(titleTokens, topQueryKeywords);
  const fullOverlap = keywordOverlap(titleDescTokens, topQueryKeywords);
  const missingFromTitle = topQueryKeywords.filter(t => !new Set(titleTokens).has(t));
  const missingFromBoth = topQueryKeywords.filter(t => !new Set(titleDescTokens).has(t));

  if (titleOverlap < 0.3) {
    issues.push({
      field: "keyword_overlap",
      severity: "error",
      message: `Title has only ${Math.round(titleOverlap * 100)}% keyword overlap with top GSC queries. Missing: [${missingFromTitle.join(", ")}]`,
      value: titleOverlap,
    });
  } else if (titleOverlap < 0.5) {
    issues.push({
      field: "keyword_overlap",
      severity: "warning",
      message: `Title keyword overlap is ${Math.round(titleOverlap * 100)}%. Consider adding: [${missingFromTitle.join(", ")}]`,
      value: titleOverlap,
    });
  }

  if (fullOverlap < 0.4) {
    issues.push({
      field: "keyword_coverage",
      severity: "warning",
      message: `Title+description together only cover ${Math.round(fullOverlap * 100)}% of top query keywords. Missing from both: [${missingFromBoth.join(", ")}]`,
      value: fullOverlap,
    });
  }

  // 4. Intent alignment
  const intentMismatches = detectIntentMismatches(topQueries, effectiveTitle);
  for (const mismatch of intentMismatches) {
    issues.push({
      field: "intent",
      severity: "error",
      message: `${mismatch.hint} (${mismatch.impressionShare}% of impressions have "${mismatch.intent}" intent)`,
      value: mismatch.intent,
    });
  }

  // 5. CTR benchmark
  const benchmark = getCtrBenchmark(gscPage.position);
  const ctrRatio = benchmark.expectedCtr > 0 ? gscPage.ctr / benchmark.expectedCtr : 1;

  if (ctrRatio < 0.3) {
    issues.push({
      field: "ctr",
      severity: "error",
      message: `CTR is ${(gscPage.ctr * 100).toFixed(1)}% at ${benchmark.label} (avg pos ${gscPage.position.toFixed(1)}) — expected ~${(benchmark.expectedCtr * 100).toFixed(1)}%. Snippet is not attracting clicks.`,
      value: gscPage.ctr,
    });
  } else if (ctrRatio < 0.6) {
    issues.push({
      field: "ctr",
      severity: "warning",
      message: `CTR is ${(gscPage.ctr * 100).toFixed(1)}% at ${benchmark.label} (avg pos ${gscPage.position.toFixed(1)}) — below expected ~${(benchmark.expectedCtr * 100).toFixed(1)}%.`,
      value: gscPage.ctr,
    });
  }

  return {
    slug: post.slug,
    effectiveTitle,
    effectiveDesc,
    issues,
    gsc: {
      impressions: gscPage.impressions,
      clicks: gscPage.clicks,
      ctr: gscPage.ctr,
      position: gscPage.position,
      topQueries: topQueries.slice(0, 5).map(q => ({ query: q.query, impressions: q.impressions, clicks: q.clicks })),
      titleKeywordOverlap: Math.round(titleOverlap * 100),
      topQueryKeywords,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Title/Meta Suggestion Generator (for --suggest mode)
// ---------------------------------------------------------------------------

// CTR hooks proven to increase click-through from SERPs
const CTR_HOOKS = [
  "Tested", "Free", "No Signup", "Instant", "Step by Step",
  "Before/After", "Side by Side", "Comparison", "2026",
  "No Watermark", "Works on Phone", "Try It Free",
];

function generateSuggestions(post, auditedPost) {
  if (!auditedPost.gsc || auditedPost.gsc.impressions < 100) return null;

  const topQueries = auditedPost.gsc.topQueries || [];
  const topKeywords = auditedPost.gsc.topQueryKeywords || [];
  const position = auditedPost.gsc.position;
  const ctr = auditedPost.gsc.ctr;
  const impressions = auditedPost.gsc.impressions;

  // Find the top 3 highest-impression query keywords to weave into suggestions
  const highValueKeywords = topKeywords.slice(0, 5);

  // Detect the dominant intent
  const intentIssues = auditedPost.issues.filter(i => i.field === "intent");
  const dominantIntent = intentIssues.length > 0 ? intentIssues[0].value : null;

  // Generate 3 title candidates
  const slug = post.slug;
  const titleCandidates = [];

  // Strategy 1: Lead with the #1 query keyword + CTR hook
  if (highValueKeywords.length > 0) {
    const mainKw = topQueries[0]?.query || highValueKeywords.join(" ");
    const words = mainKw.split(/\s+/).filter(w => w.length > 2);
    const titleBase = words.slice(0, 6).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const hook = ctr < 0.01 ? "Tested" : ctr < 0.02 ? "Free" : "2026";
    titleCandidates.push(`${titleBase} — ${hook} & Compared (${new Date().getFullYear()})`.slice(0, 60));
  }

  // Strategy 2: Question/curiosity format for low CTR
  if (ctr < 0.005) {
    const mainKw = highValueKeywords.slice(0, 3).join(" ");
    titleCandidates.push(`Which ${mainKw} Actually Works? (We Tested)`.slice(0, 60));
  }

  // Strategy 3: Intent-aligned format
  if (dominantIntent === "free-tool") {
    titleCandidates.push(`Free ${highValueKeywords.slice(0, 2).join(" ")} — No Watermark, No Signup`.slice(0, 60));
  } else if (dominantIntent === "how-to") {
    titleCandidates.push(`How to ${highValueKeywords.slice(0, 3).join(" ")} — Step by Step Guide`.slice(0, 60));
  } else if (dominantIntent === "comparison") {
    titleCandidates.push(`${highValueKeywords[0] || "Tool"} vs ${highValueKeywords[1] || "Alternative"}: Which Is Better?`.slice(0, 60));
  } else if (dominantIntent === "explainer") {
    titleCandidates.push(`What Is ${highValueKeywords.slice(0, 2).join(" ")}? How It Works (Explained)`.slice(0, 60));
  }

  // Fill up to 3 if we don't have enough
  while (titleCandidates.length < 3) {
    const kw = highValueKeywords[titleCandidates.length % highValueKeywords.length] || "Image";
    titleCandidates.push(`Best ${kw} ${new Date().getFullYear()} — Tested & Reviewed`.slice(0, 60));
  }

  // Generate 1 description candidate
  const benchmark = getCtrBenchmark(position);
  const descHooks = [];
  if (ctr < 0.01) descHooks.push("We tested");
  if (impressions > 5000) descHooks.push("Side-by-side results");
  if (dominantIntent === "free-tool") descHooks.push("No signup, no watermark, instant");

  const descBase = topQueries.slice(0, 2).map(q => q.query).join(". ");
  let description = "";
  if (descHooks.length > 0) {
    description = `${descHooks.join(". ")}. ${descBase}. See which ones actually deliver.`.slice(0, 160);
  } else {
    description = `${descBase}. Compare options and find the best fit for your needs.`.slice(0, 160);
  }

  // Pad description if too short
  if (description.length < 120) {
    description = `${description} Try our free tool — no account needed.`.slice(0, 160);
  }

  return {
    slug,
    current: {
      title: auditedPost.effectiveTitle,
      description: auditedPost.effectiveDesc?.slice(0, 160),
    },
    topQueries: topQueries.slice(0, 5).map(q => q.query),
    topKeywords: highValueKeywords,
    dominantIntent,
    gsc: {
      impressions,
      clicks: auditedPost.gsc.clicks,
      ctr: Number(ctr.toFixed(4)),
      position: Number(position.toFixed(1)),
      expectedCtr: Number(benchmark.expectedCtr.toFixed(4)),
      missedClicks: Math.max(0, Math.round(impressions * benchmark.expectedCtr - auditedPost.gsc.clicks)),
    },
    suggestions: {
      seo_title_options: titleCandidates.slice(0, 3).map(t => t.slice(0, 60)),
      seo_description: description.slice(0, 160),
    },
    rationale: `#${slug} has ${impressions.toLocaleString()} impressions at pos ${position.toFixed(1)} with ${(ctr * 100).toFixed(2)}% CTR (expected ~${(benchmark.expectedCtr * 100).toFixed(1)}%). Top query: "${topQueries[0]?.query || "N/A"}". ${intentIssues.length > 0 ? `Intent mismatch: queries signal "${dominantIntent}" intent.` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { gsc: null, output: null, minImpressions: 100, suggest: false };

  for (const arg of args) {
    if (arg === "--help") {
      console.error(`
Usage:
  node audit-blog-seo.cjs --gsc=/tmp/gsc-domain.json [options]

Options:
  --gsc=FILE               Path to GSC JSON output from gsc-fetch.cjs (required)
  --output=FILE            Write JSON report to file (default: stdout)
  --min-impressions=N      Minimum impressions to include in GSC cross-check (default: 100)
  --suggest                Generate actionable title/meta description suggestions
  --help                   Show this help
`);
      process.exit(0);
    }
    if (arg.startsWith("--gsc=")) result.gsc = arg.slice(6);
    else if (arg.startsWith("--output=")) result.output = arg.slice(9);
    else if (arg.startsWith("--min-impressions=")) result.minImpressions = parseInt(arg.slice(18), 10);
    else if (arg === "--suggest") result.suggest = true;
  }

  if (!result.gsc) {
    console.error("ERROR: --gsc=FILE is required. Run gsc-fetch.cjs first to generate the data.");
    process.exit(1);
  }

  return result;
}

async function main() {
  const args = parseArgs();

  // Load GSC data
  console.error("Loading GSC data...");
  let gscData;
  try {
    gscData = JSON.parse(fs.readFileSync(args.gsc, "utf-8"));
  } catch (err) {
    console.error(`ERROR reading GSC file: ${err.message}`);
    process.exit(1);
  }

  // Fetch blog posts from Supabase
  console.error("Fetching published blog posts from Supabase...");
  const posts = await fetchBlogPosts();
  console.error(`Found ${posts.length} published blog posts.`);

  // Extract blog pages from GSC data
  const gscBlogPages = extractBlogPages(gscData);
  console.error(`Found ${gscBlogPages.length} blog pages in GSC data.`);

  // Build slug-to-GSC-page index
  const gscBySlug = new Map();
  for (const gscPage of gscBlogPages) {
    // Extract slug from URL: https://domain.com/blog/my-slug -> my-slug
    const match = gscPage.page.match(/\/blog\/([^/?#]+)/);
    if (match) {
      gscBySlug.set(match[1], gscPage);
    }
  }

  // Run audits
  const results = [];
  for (const post of posts) {
    const gscPage = gscBySlug.get(post.slug);
    const result = auditPost(post, gscPage, args.minImpressions);
    results.push(result);
  }

  // Sort: most issues first, then by impression count
  results.sort((a, b) => {
    const aErrors = a.issues.filter(i => i.severity === "error").length;
    const bErrors = b.issues.filter(i => i.severity === "error").length;
    if (aErrors !== bErrors) return bErrors - aErrors;
    return (b.gsc?.impressions || 0) - (a.gsc?.impressions || 0);
  });

  // Summary
  const totalPosts = results.length;
  const postsWithErrors = results.filter(r => r.issues.some(i => i.severity === "error")).length;
  const postsWithWarnings = results.filter(r => r.issues.some(i => i.severity === "warning")).length;
  const postsWithGsc = results.filter(r => r.gsc).length;
  const ctrIssues = results.filter(r => r.issues.some(i => i.field === "ctr")).length;
  const intentIssues = results.filter(r => r.issues.some(i => i.field === "intent")).length;
  const lengthIssues = results.filter(r => r.issues.some(i => i.field === "title" || i.field === "description")).length;
  const overlapIssues = results.filter(r => r.issues.some(i => i.field === "keyword_overlap" || i.field === "keyword_coverage")).length;

  const report = {
    generatedAt: new Date().toISOString(),
    gscSource: args.gsc,
    minImpressions: args.minImpressions,
    summary: {
      totalPosts,
      postsWithErrors,
      postsWithWarnings,
      postsWithGscData: postsWithGsc,
      breakdownByIssueType: {
        ctrBelowBenchmark: ctrIssues,
        intentMismatch: intentIssues,
        titleOrDescLength: lengthIssues,
        keywordOverlapLow: overlapIssues,
      },
    },
    posts: results,
  };

  // Text summary to stderr
  console.error("\n=== Blog SEO Audit Summary ===");
  console.error(`Total posts:            ${totalPosts}`);
  console.error(`With errors:            ${postsWithErrors}`);
  console.error(`With warnings:          ${postsWithWarnings}`);
  console.error(`With GSC data:          ${postsWithGsc}`);
  console.error(`CTR below benchmark:    ${ctrIssues}`);
  console.error(`Intent mismatches:      ${intentIssues}`);
  console.error(`Title/desc length:      ${lengthIssues}`);
  console.error(`Low keyword overlap:    ${overlapIssues}`);

  if (postsWithErrors > 0) {
    console.error("\n--- Posts with errors (highest priority) ---");
    for (const r of results.filter(res => res.issues.some(i => i.severity === "error"))) {
      const impressions = r.gsc ? ` (${r.gsc.impressions.toLocaleString()} impressions)` : "";
      console.error(`\n  ${r.slug}${impressions}`);
      console.error(`  Title: "${r.effectiveTitle}"`);
      for (const issue of r.issues.filter(i => i.severity === "error")) {
        console.error(`  ✗ [${issue.field}] ${issue.message}`);
      }
    }
  }

  // Generate suggestions if --suggest flag is set
  let suggestions = [];
  if (args.suggest) {
    console.error("\n--- Generating title/meta suggestions ---");
    const postMap = new Map(posts.map(p => [p.slug, p]));
    for (const r of results) {
      const post = postMap.get(r.slug);
      if (!post) continue;
      const suggestion = generateSuggestions(post, r);
      if (suggestion) suggestions.push(suggestion);
    }
    suggestions.sort((a, b) => (b.gsc?.missedClicks || 0) - (a.gsc?.missedClicks || 0));
    console.error(`Generated ${suggestions.length} suggestions`);
  }

  report.suggestions = suggestions.length > 0 ? suggestions : undefined;

  // JSON output
  const json = JSON.stringify(report, null, 2);
  if (args.output) {
    fs.writeFileSync(args.output, json, "utf-8");
    console.error(`\nReport written to ${args.output}`);
  } else {
    process.stdout.write(json);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
