#!/usr/bin/env node
/**
 * SEO Growth Plan Synthesizer
 *
 * Reads GSC and GA4 export JSONs, joins by normalized landing-page URL,
 * and produces a merged opportunity dataset + ranked priority actions.
 *
 * Usage:
 *   node seo-synthesize.cjs --gsc=/tmp/gsc-miu.json --ga=/tmp/ga-miu.json --output=/tmp/seo-plan-miu.json
 */

const fs = require("fs");

function printHelp() {
  console.error(`
Usage:
  node seo-synthesize.cjs --gsc=/path/to/gsc.json --ga=/path/to/ga.json [options]

Options:
  --output=/tmp/seo-plan.json    Write JSON to a file instead of stdout
  --site=myimageupscaler.com     Site label for output meta
  --help                         Show this help
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { gsc: null, ga: null, output: null, site: null };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") { printHelp(); process.exit(0); }
    else if (arg.startsWith("--gsc="))    result.gsc = arg.split("=").slice(1).join("=");
    else if (arg.startsWith("--ga="))     result.ga  = arg.split("=").slice(1).join("=");
    else if (arg.startsWith("--output=")) result.output = arg.split("=").slice(1).join("=");
    else if (arg.startsWith("--site="))   result.site = arg.split("=").slice(1).join("=");
  }

  if (!result.gsc) { console.error("ERROR: --gsc=/path/to/gsc.json is required"); process.exit(1); }
  if (!result.ga)  { console.error("ERROR: --ga=/path/to/ga.json is required"); process.exit(1); }
  return result;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`ERROR: failed to read ${label} from ${filePath}: ${e.message}`);
    process.exit(1);
  }
}

function normalizeUrl(url) {
  if (!url) return null;
  let s = String(url).trim();
  if (s.startsWith("http")) {
    try {
      const u = new URL(s);
      s = u.pathname;
    } catch { /* keep as-is */ }
  } else {
    const qi = s.indexOf("?");
    if (qi >= 0) s = s.slice(0, qi);
  }
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

function buildPageIndex(gsc, ga) {
  const gscPages = (gsc.topPages || []).map(p => ({
    page: normalizeUrl(p.page),
    clicks: p.clicks || 0,
    impressions: p.impressions || 0,
    ctr: p.ctr || 0,
    position: p.position || 0,
    topQueries: (p.topQueries || []).slice(0, 5).map(q => ({
      query: q.query,
      clicks: q.clicks || 0,
      impressions: q.impressions || 0,
      position: q.position || 0,
    })),
  }));

  const gaPages = (ga.organic?.landingPages || []).map(p => ({
    page: normalizeUrl(p.page),
    sessions: p.sessions || 0,
    engagedSessions: p.engagedSessions || 0,
    engagementRate: p.engagementRate || 0,
    bounceRate: p.bounceRate || 0,
    averageSessionDuration: p.averageSessionDuration || 0,
    conversions: p.conversions || 0,
    conversionRate: p.conversionRate || 0,
    sessionDelta: p.sessionDelta || 0,
    sessionDeltaPct: p.sessionDeltaPct ?? null,
    previousSessions: p.previousSessions || 0,
  }));

  const gscByPage = new Map(gscPages.map(p => [p.page, p]));
  const gaByPage  = new Map(gaPages.map(p => [p.page, p]));
  const allPages  = new Set([...gscByPage.keys(), ...gaByPage.keys()]);

  const joined = [];
  for (const page of allPages) {
    if (!page) continue;
    joined.push({
      page,
      gsc: gscByPage.get(page) || null,
      ga:  gaByPage.get(page)  || null,
    });
  }

  return { joined, gscByPage, gaByPage };
}

// ─── Opportunity builders ────────────────────────────────────────────────────

function buildConversionOpportunities(joined) {
  const benchmark = 0.02;
  return joined
    .filter(p => p.ga && p.gsc && p.ga.sessions >= 100 && p.ga.conversionRate < benchmark)
    .map(p => ({
      page: p.page,
      gscClicks: p.gsc.clicks,
      gscImpressions: p.gsc.impressions,
      gscPosition: p.gsc.position,
      topQueries: (p.gsc.topQueries || []).slice(0, 3).map(q => q.query),
      gaSessions: p.ga.sessions,
      gaConversions: p.ga.conversions,
      gaConversionRate: p.ga.conversionRate,
      gaBounceRate: p.ga.bounceRate,
      missedConversionsEstimate: Math.max(0, Math.round(p.ga.sessions * benchmark) - p.ga.conversions),
    }))
    .sort((a, b) => b.missedConversionsEstimate - a.missedConversionsEstimate)
    .slice(0, 25);
}

function buildIntentMismatch(joined) {
  return joined
    .filter(p => p.ga && p.gsc)
    .filter(p => p.ga.sessions >= 50 && p.gsc.ctr >= 0.025 && p.ga.bounceRate >= 0.65)
    .map(p => ({
      page: p.page,
      gscCtr: p.gsc.ctr,
      gscPosition: p.gsc.position,
      gscImpressions: p.gsc.impressions,
      topQueries: (p.gsc.topQueries || []).slice(0, 3).map(q => q.query),
      gaSessions: p.ga.sessions,
      gaBounceRate: p.ga.bounceRate,
      gaAvgDuration: p.ga.averageSessionDuration,
    }))
    .sort((a, b) => b.gaSessions - a.gaSessions)
    .slice(0, 20);
}

function buildStrikingDistance(joined) {
  const good = [];
  const bad  = [];

  for (const p of joined) {
    if (!p.ga || !p.gsc) continue;
    if (p.gsc.position < 8 || p.gsc.position > 25) continue;
    if (p.gsc.impressions < 100) continue;

    const entry = {
      page: p.page,
      gscPosition: p.gsc.position,
      gscImpressions: p.gsc.impressions,
      gscClicks: p.gsc.clicks,
      gscCtr: p.gsc.ctr,
      topQueries: (p.gsc.topQueries || []).slice(0, 3).map(q => q.query),
      gaSessions: p.ga.sessions,
      gaBounceRate: p.ga.bounceRate,
      gaConversionRate: p.ga.conversionRate,
    };

    if (p.ga.bounceRate <= 0.55) good.push(entry);
    else if (p.ga.bounceRate >= 0.68) bad.push(entry);
  }

  return {
    rankingOpportunities: good.sort((a, b) => b.gscImpressions - a.gscImpressions).slice(0, 20),
    fixFirstOpportunities: bad.sort((a, b) => b.gscImpressions - a.gscImpressions).slice(0, 20),
  };
}

function buildCorrelatedDeclines(joined, gsc) {
  const gscPageLosers = new Map(
    (gsc.searchTypes?.web?.pageMovers?.losers || []).map(m => [normalizeUrl(m.page), m])
  );

  return joined
    .filter(p => p.ga)
    .filter(p => p.ga.previousSessions >= 50 && p.ga.sessionDelta < 0 && Math.abs(p.ga.sessionDeltaPct || 0) >= 20)
    .map(p => {
      const gscLoss = gscPageLosers.get(p.page);
      return {
        page: p.page,
        gaCurrentSessions:  p.ga.sessions,
        gaPreviousSessions: p.ga.previousSessions,
        gaSessionDelta:     p.ga.sessionDelta,
        gaSessionDeltaPct:  p.ga.sessionDeltaPct,
        gscImpressionDelta: gscLoss?.impressionDelta ?? null,
        gscClickDelta:      gscLoss?.clickDelta      ?? null,
        gscPositionDelta:   gscLoss?.positionDelta   ?? null,
        correlated: !!gscLoss,
      };
    })
    .sort((a, b) => a.gaSessionDelta - b.gaSessionDelta)
    .slice(0, 20);
}

function buildCannibalization(joined, gsc) {
  const cannibalization = gsc.cannibalization || gsc.searchTypes?.web?.cannibalization || [];
  const gaByPage = new Map(joined.filter(p => p.ga).map(p => [p.page, p.ga]));

  return cannibalization.slice(0, 20).map(entry => ({
    query: entry.query,
    pageCount: entry.pageCount,
    gscImpressions: entry.impressions || 0,
    pages: (entry.pages || []).map(pg => {
      const key = normalizeUrl(pg.page);
      const ga  = gaByPage.get(key);
      return {
        page: key,
        gscClicks:      pg.clicks    || 0,
        gscImpressions: pg.impressions || 0,
        gscPosition:    pg.position  || 0,
        gaSessions:      ga ? ga.sessions      : null,
        gaConversionRate: ga ? ga.conversionRate : null,
      };
    }),
  }));
}

function buildTrackingGaps(joined) {
  const gscGhosts = joined
    .filter(p => p.gsc && (!p.ga || p.ga.sessions === 0) && p.gsc.clicks >= 20)
    .map(p => ({
      page: p.page,
      gscClicks: p.gsc.clicks,
      gscImpressions: p.gsc.impressions,
      topQueries: (p.gsc.topQueries || []).slice(0, 3).map(q => q.query),
    }))
    .sort((a, b) => b.gscClicks - a.gscClicks)
    .slice(0, 15);

  const gaGhosts = joined
    .filter(p => p.ga && (!p.gsc || p.gsc.impressions === 0) && p.ga.sessions >= 50)
    .map(p => ({
      page: p.page,
      gaSessions: p.ga.sessions,
      gaConversionRate: p.ga.conversionRate,
    }))
    .sort((a, b) => b.gaSessions - a.gaSessions)
    .slice(0, 15);

  return { gscGhosts, gaGhosts };
}

// ─── Priority actions ────────────────────────────────────────────────────────

function buildPriorityActions({ conversionOpportunities, intentMismatch, strikingDistance, correlatedDeclines, cannibalization, trackingGaps }) {
  const actions = [];

  for (const op of conversionOpportunities.slice(0, 10)) {
    actions.push({
      type: "conversion",
      priority: "high",
      title: `Lift conversion rate on ${op.page}`,
      page: op.page,
      topQueries: op.topQueries,
      evidence: {
        gsc: { clicks: op.gscClicks, impressions: op.gscImpressions, position: op.gscPosition },
        ga:  { sessions: op.gaSessions, conversionRate: op.gaConversionRate, bounceRate: op.gaBounceRate },
      },
      estimatedImpact: { conversions: op.missedConversionsEstimate },
      suggestedFix: "Audit CTA placement, above-fold value prop, pricing clarity, and form friction. A/B test a focused variant against current layout.",
    });
  }

  for (const op of intentMismatch.slice(0, 8)) {
    actions.push({
      type: "engagement",
      priority: "high",
      title: `Fix intent mismatch on ${op.page}`,
      page: op.page,
      topQueries: op.topQueries,
      evidence: {
        gsc: { ctr: op.gscCtr, position: op.gscPosition, impressions: op.gscImpressions },
        ga:  { sessions: op.gaSessions, bounceRate: op.gaBounceRate, avgDuration: op.gaAvgDuration },
      },
      estimatedImpact: { conversions: Math.round(op.gaSessions * 0.015) },
      suggestedFix: `Users click (CTR ${(op.gscCtr * 100).toFixed(1)}%) but ${(op.gaBounceRate * 100).toFixed(0)}% bounce. The snippet promises something the page doesn't deliver. Rewrite above-fold to match intent of top queries, or update meta to be more accurate.`,
    });
  }

  for (const op of strikingDistance.rankingOpportunities.slice(0, 8)) {
    const currentCtr = op.gscImpressions > 0 ? op.gscClicks / op.gscImpressions : 0;
    const targetCtr  = op.gscPosition <= 10 ? 0.08 : 0.04;
    const clickGain  = Math.max(0, Math.round(op.gscImpressions * (targetCtr - currentCtr)));
    const diff       = op.gscPosition <= 12 ? "easy" : op.gscPosition <= 18 ? "medium" : "hard";
    actions.push({
      type: "ranking",
      priority: diff === "easy" ? "high" : "medium",
      title: `Push rankings on ${op.page} (pos ${op.gscPosition.toFixed(1)})`,
      page: op.page,
      topQueries: op.topQueries,
      evidence: {
        gsc: { position: op.gscPosition, impressions: op.gscImpressions, clicks: op.gscClicks },
        ga:  { sessions: op.gaSessions, bounceRate: op.gaBounceRate, conversionRate: op.gaConversionRate },
      },
      estimatedImpact: { clicks: clickGain, conversions: Math.round(clickGain * (op.gaConversionRate || 0.01)) },
      suggestedFix: `Page already engages users (bounce ${(op.gaBounceRate * 100).toFixed(0)}%). Add internal links pointing here, expand coverage of top queries in H2s, refresh publish date, and strengthen title/H1 alignment.`,
    });
  }

  for (const op of strikingDistance.fixFirstOpportunities.slice(0, 5)) {
    actions.push({
      type: "content",
      priority: "medium",
      title: `Rebuild ${op.page} before pushing rankings`,
      page: op.page,
      topQueries: op.topQueries,
      evidence: {
        gsc: { position: op.gscPosition, impressions: op.gscImpressions },
        ga:  { sessions: op.gaSessions, bounceRate: op.gaBounceRate, conversionRate: op.gaConversionRate },
      },
      estimatedImpact: { conversions: Math.round(op.gaSessions * 0.01) },
      suggestedFix: `Bounce rate is ${(op.gaBounceRate * 100).toFixed(0)}% — pushing rankings now funnels traffic to a broken experience. Fix content/UX first, then pursue link building and on-page SEO.`,
    });
  }

  for (const op of correlatedDeclines.slice(0, 5)) {
    actions.push({
      type: "technical",
      priority: "medium",
      title: `Investigate decline on ${op.page}`,
      page: op.page,
      topQueries: [],
      evidence: {
        gsc: op.correlated ? { impressionDelta: op.gscImpressionDelta, clickDelta: op.gscClickDelta } : null,
        ga:  { sessionDelta: op.gaSessionDelta, sessionDeltaPct: op.gaSessionDeltaPct },
      },
      estimatedImpact: { conversions: Math.round(Math.abs(op.gaSessionDelta) * 0.01) },
      suggestedFix: op.correlated
        ? "Both GSC impressions and GA sessions are down together — likely a ranking drop, core update, or SERP feature cannibalizing clicks. Check GSC index coverage and recent algorithm activity."
        : "GA organic sessions dropped but GSC appears stable — investigate GA tagging (broken pixel, redirect, SPA tracking gap) before assuming an SEO issue.",
    });
  }

  for (const op of cannibalization.slice(0, 4)) {
    actions.push({
      type: "consolidation",
      priority: "medium",
      title: `Consolidate "${op.query}" (${op.pageCount} URLs competing)`,
      page: op.pages[0]?.page || null,
      topQueries: [op.query],
      evidence: {
        gsc: { impressions: op.gscImpressions, competingPages: op.pages.slice(0, 3).map(p => p.page) },
        ga: null,
      },
      estimatedImpact: { conversions: Math.round(op.gscImpressions * 0.001) },
      suggestedFix: `Pick the strongest page (highest clicks + lowest bounce). 301 the weaker URLs to it. Add internal links from the redirected pages' inbound links to the canonical. Remove duplicate H1/title coverage.`,
    });
  }

  for (const op of trackingGaps.gscGhosts.slice(0, 3)) {
    actions.push({
      type: "technical",
      priority: "low",
      title: `Fix tracking gap on ${op.page}`,
      page: op.page,
      topQueries: op.topQueries,
      evidence: {
        gsc: { clicks: op.gscClicks },
        ga:  null,
      },
      estimatedImpact: { conversions: 0 },
      suggestedFix: "GSC records clicks but GA shows no sessions. Check: GA tag presence on this URL, redirect chains adding new sessions, URL fragment differences, or consent mode blocking GA.",
    });
  }

  // Rank by estimated conversions, deduplicate by page+type
  const seen = new Set();
  return actions
    .sort((a, b) => (b.estimatedImpact?.conversions || 0) - (a.estimatedImpact?.conversions || 0))
    .filter(action => {
      const key = `${action.type}:${action.page}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 15);
}

// ─── Summary synthesis ───────────────────────────────────────────────────────

function buildSummarySynthesis(gsc, ga) {
  const gscSum     = gsc.summary || {};
  const gaOrgCur   = ga.summary?.organic?.current  || {};
  const gaOrgPrev  = ga.summary?.organic?.previous || {};
  const gaAllCur   = ga.summary?.all?.current      || {};
  const gaOrgDelta = ga.summary?.organic?.deltaPct || {};

  const gscClicks   = gscSum.totalClicks      || 0;
  const gaOrgSess   = gaOrgCur.sessions       || 0;
  const clickRatio  = gaOrgSess > 0 ? Number((gscClicks / gaOrgSess).toFixed(2)) : null;

  return {
    gsc: {
      clicks:            gscClicks,
      impressions:       gscSum.totalImpressions  || 0,
      avgCtr:            gscSum.avgCtr            || 0,
      avgPosition:       gscSum.avgPosition       || 0,
      clicksDeltaPct:    gscSum.clicksDeltaPct    ?? null,
      impressionsDeltaPct: gscSum.impressionsDeltaPct ?? null,
    },
    ga: {
      organicSessions:        gaOrgCur.sessions        || 0,
      totalSessions:          gaAllCur.sessions        || 0,
      organicConversions:     gaOrgCur.conversions     || 0,
      organicEngagementRate:  gaOrgCur.engagementRate  || 0,
      organicBounceRate:      gaOrgCur.bounceRate      || 0,
      organicSessionsDeltaPct: gaOrgDelta.sessions     ?? null,
      organicShare:           ga.summary?.organicShare || null,
    },
    crosscheck: {
      gscClicksVsGaSessions: {
        gscClicks,
        gaOrganicSessions: gaOrgSess,
        ratio: clickRatio,
        looksNormal: clickRatio !== null && clickRatio >= 0.6 && clickRatio <= 1.6,
      },
    },
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs();

  console.error(`[SEO-PLAN] Reading GSC: ${args.gsc}`);
  console.error(`[SEO-PLAN] Reading GA:  ${args.ga}`);

  const gsc = readJson(args.gsc, "GSC");
  const ga  = readJson(args.ga,  "GA");

  const { joined } = buildPageIndex(gsc, ga);
  const pagesWithBoth = joined.filter(p => p.gsc && p.ga).length;
  console.error(`[SEO-PLAN] Joined ${joined.length} URLs (${pagesWithBoth} with both GSC + GA data)`);

  const conversionOpportunities = buildConversionOpportunities(joined);
  const intentMismatch           = buildIntentMismatch(joined);
  const strikingDistance         = buildStrikingDistance(joined);
  const correlatedDeclines       = buildCorrelatedDeclines(joined, gsc);
  const cannibalization          = buildCannibalization(joined, gsc);
  const trackingGaps             = buildTrackingGaps(joined);
  const priorityActions          = buildPriorityActions({
    conversionOpportunities,
    intentMismatch,
    strikingDistance,
    correlatedDeclines,
    cannibalization,
    trackingGaps,
  });

  const output = {
    meta: {
      site:        args.site || gsc.meta?.site || ga.meta?.site || "unknown",
      synthesizedAt: new Date().toISOString(),
      gscSource:   args.gsc,
      gaSource:    args.ga,
      gscPeriod:   gsc.meta?.dateRanges?.current,
      gaPeriod:    ga.meta?.dateRanges?.current,
      joinedPages:      joined.length,
      pagesWithBoth,
      pagesGscOnly: joined.filter(p => p.gsc && !p.ga).length,
      pagesGaOnly:  joined.filter(p => p.ga  && !p.gsc).length,
    },
    summary: buildSummarySynthesis(gsc, ga),
    priorityActions,
    opportunities: {
      conversionOpportunities,
      intentMismatch,
      strikingDistance,
      correlatedDeclines,
      cannibalization,
      trackingGaps,
    },
    joinedPagesTop: joined
      .filter(p => p.gsc && p.ga)
      .sort((a, b) => b.ga.sessions - a.ga.sessions)
      .slice(0, 30),
  };

  const json = JSON.stringify(output, null, 2);
  if (args.output) {
    fs.writeFileSync(args.output, json);
    console.error(`[SEO-PLAN] Written to ${args.output} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB)`);
  } else {
    process.stdout.write(json);
  }

  console.error("[SEO-PLAN] Done!");
}

main();
