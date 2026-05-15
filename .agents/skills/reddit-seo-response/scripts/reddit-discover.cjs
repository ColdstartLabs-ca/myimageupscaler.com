#!/usr/bin/env node
/**
 * Reddit SEO Opportunity Discovery
 *
 * Reads either a seo-growth-plan JSON file or a standalone target JSON file,
 * builds Reddit searches from page/query opportunities, fetches public Reddit
 * search JSON, and outputs ranked thread candidates for manual review and
 * reply drafting.
 */

const fs = require("fs");

const DEFAULT_USER_AGENT = "reddit-seo-response/1.0";
const DEFAULT_EXCLUDED_SUBREDDITS = [
  "funny", "cats", "europe", "todayilearned", "politics", "news",
  "worldnews", "askreddit", "memes", "pics", "music", "soccer", "hockey",
];
const VISUAL_CONTEXT_SUBREDDIT_PATTERNS = [
  "stable", "diffusion", "comfy", "photoshop", "photo", "photography",
  "canva", "printing", "print", "design", "graphic", "midjourney",
  "aiart", "image", "upscal",
];

function printHelp() {
  console.error(`
Usage:
  node reddit-discover.cjs --seo-plan=/tmp/seo-plan.json [options]
  node reddit-discover.cjs --targets=/tmp/reddit-targets.json [options]

Options:
  --site=example.com               Site/domain label
  --targets=/tmp/targets.json      Optional standalone target JSON
  --candidates=/tmp/reddit.json    Optional Reddit candidate export to score
  --output=/tmp/reddit.json        Write JSON to file instead of stdout
  --max-pages=12                   Max SEO pages/actions to search
  --pages=/blog/a,/blog/b          Optional comma list of target pages to force
  --page-prefix=/blog              Optional page-path prefix filter
  --queries-per-target=3           Max base queries per target
  --threads-per-query=5            Reddit results retained per query
  --subreddits=a,b,c               Optional subreddit allowlist
  --exclude-subreddits=a,b,c       Optional subreddit denylist
  --min-relevance=24               Minimum topical relevance score
  --delay-ms=1500                  Delay between Reddit requests
  --max-retries=2                  Retries for 429/5xx responses
  --dry-run                        Output targets + generated queries only
  --help                           Show this help
`);
}

function parseArgs() {
  const out = {
    seoPlan: null,
    targetsFile: null,
    candidatesFile: null,
    site: null,
    output: null,
    maxPages: 12,
    pages: [],
    pagePrefix: null,
    queriesPerTarget: 3,
    threadsPerQuery: 5,
    subreddits: [],
    excludeSubreddits: DEFAULT_EXCLUDED_SUBREDDITS,
    minRelevance: 24,
    delayMs: 1500,
    maxRetries: 2,
    dryRun: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--seo-plan=")) out.seoPlan = value(arg);
    else if (arg.startsWith("--targets=")) out.targetsFile = value(arg);
    else if (arg.startsWith("--candidates=")) out.candidatesFile = value(arg);
    else if (arg.startsWith("--site=")) out.site = value(arg);
    else if (arg.startsWith("--output=")) out.output = value(arg);
    else if (arg.startsWith("--max-pages=")) out.maxPages = Number(value(arg)) || out.maxPages;
    else if (arg.startsWith("--pages=")) out.pages = value(arg).split(",").map(s => s.trim()).filter(Boolean);
    else if (arg.startsWith("--page-prefix=")) out.pagePrefix = normalizePage(value(arg));
    else if (arg.startsWith("--queries-per-target=")) out.queriesPerTarget = Number(value(arg)) || out.queriesPerTarget;
    else if (arg.startsWith("--threads-per-query=")) out.threadsPerQuery = Number(value(arg)) || out.threadsPerQuery;
    else if (arg.startsWith("--subreddits=")) out.subreddits = value(arg).split(",").map(s => s.trim()).filter(Boolean);
    else if (arg.startsWith("--exclude-subreddits=")) out.excludeSubreddits = value(arg).split(",").map(s => s.trim()).filter(Boolean);
    else if (arg.startsWith("--min-relevance=")) out.minRelevance = Number(value(arg)) || out.minRelevance;
    else if (arg.startsWith("--delay-ms=")) out.delayMs = Number(value(arg)) || out.delayMs;
    else if (arg.startsWith("--max-retries=")) out.maxRetries = Number(value(arg)) || out.maxRetries;
    else if (arg === "--dry-run") out.dryRun = true;
  }

  if (!out.seoPlan && !out.targetsFile) {
    console.error("ERROR: provide --seo-plan=/path/to/seo-plan.json or --targets=/path/to/targets.json");
    process.exit(1);
  }

  return out;
}

function value(arg) {
  return arg.split("=").slice(1).join("=");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`ERROR: failed to read ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function uniq(items) {
  return [...new Set(items.filter(Boolean).map(s => String(s).trim()).filter(Boolean))];
}

function uniqTargets(targets) {
  const byPage = new Map();
  for (const target of targets) {
    const key = normalizePage(target.page);
    if (!key) continue;
    const existing = byPage.get(key);
    if (!existing || (target.baseScore || 0) > (existing.baseScore || 0)) byPage.set(key, target);
  }
  return [...byPage.values()].sort((a, b) => (b.baseScore || 0) - (a.baseScore || 0));
}

function cleanQuery(query) {
  return String(query || "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function queryTokens(text) {
  const stop = new Set([
    "the", "and", "for", "with", "free", "best", "online", "2026",
    "ai", "to", "how", "a", "an", "of",
    "in", "on", "vs", "or", "no", "latest", "version", "features", "official",
    "update", "websites", "tools", "tested", "compared", "quality", "without", "top",
  ]);
  return cleanQuery(text).split(" ").filter(token => token.length >= 3 && !stop.has(token));
}

function normalizePage(page) {
  if (!page) return "";
  let s = String(page).trim();
  if (s.startsWith("http")) {
    try { s = new URL(s).pathname; } catch { /* keep as-is */ }
  }
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

function pageMatches(page, requestedPages) {
  if (!requestedPages.length) return true;
  const normalized = normalizePage(page);
  return requestedPages.some(requested => {
    const wanted = normalizePage(requested);
    return normalized === wanted || normalized.endsWith(wanted) || wanted.endsWith(normalized);
  });
}

function pagePrefixMatches(page, pagePrefix) {
  if (!pagePrefix) return true;
  return normalizePage(page).startsWith(pagePrefix);
}

function targetPosition(target) {
  return Number(
    target.evidence?.gsc?.position ??
    target.evidence?.gsc?.gscPosition ??
    target.evidence?.position ??
    target.evidence?.gscPosition ??
    99
  );
}

function lowHangingFruitScore(target) {
  const position = targetPosition(target);
  if (position >= 4 && position <= 10) return 40;
  if (position > 10 && position <= 20) return 28;
  if (position > 20 && position <= 40) return 10;
  if (position >= 1 && position < 4) return 6;
  return 0;
}

function relevanceScore(thread, target) {
  const haystack = cleanQuery(`${thread.title || ""} ${thread.selftextPreview || ""} ${thread.subreddit || ""}`);
  const tokens = uniq((target.topQueries || []).flatMap(queryTokens));
  if (!tokens.length) return 0;

  const hits = tokens.filter(token => haystack.includes(token));
  const titleHits = tokens.filter(token => cleanQuery(thread.title || "").includes(token));
  const hitScore = Math.min(30, hits.length * 8) + Math.min(24, titleHits.length * 12);
  const title = cleanQuery(thread.title || "");
  const exactish = (target.topQueries || []).some(query => {
    const qTokens = queryTokens(query);
    if (qTokens.length === 1) return title.includes(qTokens[0]);
    return qTokens.length >= 2 && qTokens.filter(token => title.includes(token)).length >= 2;
  }) ? 20 : 0;

  return hitScore + exactish;
}

function isObviouslyIrrelevant(thread, target, args) {
  const relevance = relevanceScore(thread, target);
  const title = cleanQuery(thread.title || "");
  const tokens = uniq((target.topQueries || []).flatMap(queryTokens));
  const titleHitCount = tokens.filter(token => title.includes(token)).length;
  const subreddit = String(thread.subreddit || "").toLowerCase();
  const hasVisualSubredditContext = VISUAL_CONTEXT_SUBREDDIT_PATTERNS.some(pattern => subreddit.includes(pattern));
  const hasEnoughTitleContext = titleHitCount >= 2 || (titleHitCount >= 1 && hasVisualSubredditContext);
  if (relevance >= args.minRelevance && hasEnoughTitleContext) return false;

  const excluded = new Set((args.excludeSubreddits || []).map(s => `r/${s.replace(/^r\//, "").toLowerCase()}`));

  return excluded.has(subreddit) || relevance < args.minRelevance || !hasEnoughTitleContext;
}

function extractSeoTargets(plan, maxPages, requestedPages = [], pagePrefix = null) {
  const targets = [];

  for (const action of plan.priorityActions || []) {
    if (!action.page) continue;
    if (!pageMatches(action.page, requestedPages)) continue;
    if (!pagePrefixMatches(action.page, pagePrefix)) continue;
    targets.push({
      source: "priorityActions",
      actionType: action.type || "unknown",
      priority: action.priority || "medium",
      page: action.page,
      topQueries: uniq([...(action.topQueries || []), ...(action.evidence?.gsc?.topQueries || [])]).slice(0, 5),
      evidence: action.evidence || {},
      suggestedFix: action.suggestedFix || "",
      baseScore: (action.priority === "high" ? 30 : action.priority === "medium" ? 20 : 10) + lowHangingFruitScore(action),
    });
  }

  const striking = plan.opportunities?.strikingDistance?.rankingOpportunities || [];
  for (const item of striking) {
    if (!pageMatches(item.page, requestedPages)) continue;
    if (!pagePrefixMatches(item.page, pagePrefix)) continue;
    targets.push({
      source: "strikingDistance",
      actionType: "ranking",
      priority: "medium",
      page: item.page,
      topQueries: uniq(item.topQueries || []).slice(0, 5),
      evidence: { gsc: item, ga: item },
      suggestedFix: "Ranking opportunity with existing search demand and acceptable engagement.",
      baseScore: 18 + lowHangingFruitScore({ evidence: item }),
    });
  }

  const byPage = new Map();
  for (const target of targets) {
    const existing = byPage.get(target.page);
    if (!existing || target.baseScore > existing.baseScore) byPage.set(target.page, target);
  }

  return [...byPage.values()].slice(0, maxPages);
}

function loadManualTargets(filePath, maxPages, requestedPages = [], pagePrefix = null) {
  if (!filePath) return [];
  const raw = readJson(filePath);
  const rows = Array.isArray(raw) ? raw : raw.targets || raw.pages || [];

  return rows
    .filter(row => row && (row.page || row.url))
    .filter(row => pageMatches(row.page || row.url, requestedPages))
    .filter(row => pagePrefixMatches(row.page || row.url, pagePrefix))
    .map(row => {
      const position = Number(row.position ?? row.gscPosition ?? row.avgPosition ?? 99);
      const target = {
        source: "manualTargets",
        actionType: row.actionType || "ranking",
        priority: row.priority || "medium",
        page: normalizePage(row.page || row.url),
        topQueries: uniq(row.topQueries || row.queries || row.keywords || []).slice(0, 8),
        evidence: {
          gsc: {
            position,
            impressions: Number(row.impressions || 0),
            clicks: Number(row.clicks || 0),
            ctr: Number(row.ctr || 0),
          },
          ga: row.ga || {},
        },
        suggestedFix: row.notes || row.suggestedFix || "",
      };
      target.baseScore = (target.priority === "high" ? 30 : target.priority === "medium" ? 20 : 10) + lowHangingFruitScore(target);
      return target;
    })
    .slice(0, maxPages);
}

function loadCandidateThreads(filePath) {
  if (!filePath) return [];
  const raw = readJson(filePath);
  const rows = Array.isArray(raw) ? raw : raw.candidates || raw.threads || raw.opportunities || [];

  return rows
    .map(row => row.thread || row)
    .filter(row => row && (row.url || row.permalink) && row.title)
    .map(row => ({
      query: row.query || row.keyword || null,
      targetPage: row.targetPage || row.page || row.target?.page || null,
      subreddit: row.subreddit_name_prefixed || row.subreddit || null,
      title: row.title,
      url: row.url || (row.permalink && String(row.permalink).startsWith("http") ? row.permalink : `https://www.reddit.com${row.permalink}`),
      score: Number(row.score || row.ups || 0),
      comments: Number(row.comments || row.num_comments || row.commentCount || 0),
      createdUtc: Number(row.createdUtc || row.created_utc || 0) || null,
      over18: !!(row.over18 || row.over_18),
      locked: !!row.locked,
      archived: !!row.archived,
      selftextPreview: String(row.selftextPreview || row.selftext || row.body || "").slice(0, 500),
    }));
}

function buildQueries(target, limit) {
  const queries = [];
  for (const q of (target.topQueries || []).slice(0, limit)) {
    const cleaned = cleanQuery(q);
    if (!cleaned) continue;
    queries.push(cleaned);
  }
  return uniq(queries).slice(0, limit);
}

async function fetchRedditSearch(query, args) {
  const { subreddits, threadsPerQuery, delayMs, maxRetries } = args;
  const targets = subreddits.length ? subreddits.map(s => `/r/${s}/search.json`) : ["/search.json"];
  const rows = [];

  for (const path of targets) {
    const params = new URLSearchParams({
      q: query,
      sort: "relevance",
      t: "year",
      limit: String(Math.max(threadsPerQuery, 10)),
      restrict_sr: path.startsWith("/r/") ? "1" : "0",
      type: "link",
    });
    const url = `https://www.reddit.com${path}?${params.toString()}`;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      let res;
      try {
        if (delayMs > 0) await sleep(delayMs);
        res = await fetch(url, {
          headers: {
            "User-Agent": process.env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT,
            "Accept": "application/json",
          },
        });
      } catch (err) {
        if (attempt < maxRetries) {
          const waitMs = delayMs * (attempt + 2);
          console.error(`[reddit] fetch failed; retrying in ${waitMs}ms for "${query}": ${err.message}`);
          await sleep(waitMs);
          continue;
        }
        console.error(`[reddit] fetch failed for "${query}": ${err.message}`);
        break;
      }

      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          const retryAfter = Number(res.headers.get("retry-after") || 0);
          const waitMs = retryAfter ? retryAfter * 1000 : delayMs * (attempt + 3);
          console.error(`[reddit] ${res.status}; retrying in ${waitMs}ms for ${url}`);
          await sleep(waitMs);
          continue;
        }
        console.error(`[reddit] ${res.status} for ${url}`);
        break;
      }
      const json = await res.json();
      for (const child of json.data?.children || []) {
        const d = child.data || {};
        if (!d.permalink || d.stickied) continue;
        rows.push({
          query,
          subreddit: d.subreddit_name_prefixed || (d.subreddit ? `r/${d.subreddit}` : null),
          title: d.title,
          url: `https://www.reddit.com${d.permalink}`,
          score: d.score || 0,
          comments: d.num_comments || 0,
          createdUtc: d.created_utc || null,
          over18: !!d.over_18,
          locked: !!d.locked,
          archived: !!d.archived,
          selftextPreview: String(d.selftext || "").slice(0, 500),
        });
      }
      break;
    }
  }

  return rows;
}

function scoreCandidate(thread, target) {
  const comments = Math.min(thread.comments || 0, 250);
  const votes = Math.min(Math.max(thread.score || 0, 0), 500);
  const ageDays = thread.createdUtc ? (Date.now() / 1000 - thread.createdUtc) / 86400 : 365;
  const recency = ageDays <= 14 ? 20 : ageDays <= 90 ? 12 : ageDays <= 365 ? 6 : 0;
  const discussion = comments >= 5 ? Math.log10(comments + 1) * 10 : comments;
  const authority = Math.log10(votes + 1) * 6;
  const lockPenalty = thread.locked || thread.archived ? -40 : 0;
  const nsfwPenalty = thread.over18 ? -25 : 0;
  const relevance = relevanceScore(thread, target);
  const relevancePenalty = relevance < 16 ? -50 : 0;
  return Math.round(target.baseScore + relevance + recency + discussion + authority + lockPenalty + nsfwPenalty + relevancePenalty);
}

function buildOpportunity(thread, target) {
  return {
    opportunityScore: scoreCandidate(thread, target),
    linkDecision: thread.locked || thread.archived ? "skip" : "review_rules_before_linking",
    target: {
      page: target.page,
      source: target.source,
      actionType: target.actionType,
      priority: target.priority,
      topQueries: target.topQueries,
      suggestedFix: target.suggestedFix,
    },
    thread,
    replyBrief: {
      angle: `Answer the Reddit question first, using the page's query intent: ${target.topQueries.slice(0, 3).join(", ")}`,
      valueToGiveAway: "Give the practical steps directly in the comment before mentioning any URL.",
      humanizerPass: "Required before final user-facing draft.",
    },
  };
}

function dedupeOpportunities(opportunities) {
  const byUrl = new Map();
  for (const opportunity of opportunities) {
    const key = opportunity.thread.url;
    const existing = byUrl.get(key);
    if (!existing || opportunity.opportunityScore > existing.opportunityScore) byUrl.set(key, opportunity);
  }
  return [...byUrl.values()];
}

async function main() {
  const args = parseArgs();
  const plan = args.seoPlan ? readJson(args.seoPlan) : {};
  const targets = uniqTargets([
    ...loadManualTargets(args.targetsFile, args.maxPages, args.pages, args.pagePrefix),
    ...extractSeoTargets(plan, args.maxPages, args.pages, args.pagePrefix),
  ]).slice(0, args.maxPages);
  const seen = new Set();
  const opportunities = [];

  if (args.dryRun) {
    const result = {
      meta: {
        site: args.site,
        seoPlan: args.seoPlan,
        targetsFile: args.targetsFile,
        generatedAt: new Date().toISOString(),
        dryRun: true,
        requestedPages: args.pages,
        pagePrefix: args.pagePrefix,
      },
      targets: targets.map(target => ({
        ...target,
        generatedQueries: buildQueries(target, args.queriesPerTarget),
      })),
    };
    const json = JSON.stringify(result, null, 2);
    if (args.output) fs.writeFileSync(args.output, `${json}\n`);
    else process.stdout.write(`${json}\n`);
    return;
  }

  const candidateThreads = loadCandidateThreads(args.candidatesFile);
  if (candidateThreads.length) {
    for (const target of targets) {
      for (const thread of candidateThreads) {
        if (thread.targetPage && normalizePage(thread.targetPage) !== normalizePage(target.page)) continue;
        const key = `${target.page}::${thread.url}`;
        if (seen.has(key)) continue;
        if (isObviouslyIrrelevant(thread, target, args)) continue;
        seen.add(key);
        opportunities.push(buildOpportunity(thread, target));
      }
    }
  } else {
    for (const target of targets) {
      for (const query of buildQueries(target, args.queriesPerTarget)) {
        const threads = await fetchRedditSearch(query, args);
        for (const thread of threads) {
          const key = thread.url;
          if (seen.has(key)) continue;
          if (isObviouslyIrrelevant(thread, target, args)) continue;
          seen.add(key);
          opportunities.push(buildOpportunity(thread, target));
        }
      }
    }
  }

  const rankedOpportunities = dedupeOpportunities(opportunities)
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  const result = {
    meta: {
      site: args.site,
      seoPlan: args.seoPlan,
      targetsFile: args.targetsFile,
      candidatesFile: args.candidatesFile,
      generatedAt: new Date().toISOString(),
      targetsSearched: targets.length,
      requestedPages: args.pages,
      pagePrefix: args.pagePrefix,
      subreddits: args.subreddits,
      excludeSubreddits: args.excludeSubreddits,
      minRelevance: args.minRelevance,
      delayMs: args.delayMs,
    },
    targets,
    opportunities: rankedOpportunities.slice(0, args.maxPages * args.threadsPerQuery),
  };

  const json = JSON.stringify(result, null, 2);
  if (args.output) fs.writeFileSync(args.output, `${json}\n`);
  else process.stdout.write(`${json}\n`);
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
