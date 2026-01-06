#!/usr/bin/env tsx
/**
 * PageSpeed Insights Check for MyImageUpscaler
 * Fetches Core Web Vitals and performance data from Google PageSpeed API
 *
 * Usage:
 *   yarn tsx scripts/seo-pagespeed-check.ts --base-url=https://myimageupscaler.com
 *   yarn tsx scripts/seo-pagespeed-check.ts --base-url=https://myimageupscaler.com --url=/pricing
 *   yarn tsx scripts/seo-pagespeed-check.ts --base-url=https://myimageupscaler.com --strategy=desktop
 *
 * Note: Set PAGESPEED_API_KEY in .env for higher quotas (optional)
 */

import * as fs from "fs";

interface IPageSpeedResult {
  url: string;
  strategy: "mobile" | "desktop";
  fetchedAt: string;
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  coreWebVitals: {
    lcp: { value: number; rating: string };
    fid: { value: number; rating: string };
    cls: { value: number; rating: string };
    inp: { value: number; rating: string } | null;
    fcp: { value: number; rating: string };
    ttfb: { value: number; rating: string };
  };
  opportunities: Array<{
    id: string;
    title: string;
    savings: string;
  }>;
  diagnostics: Array<{
    id: string;
    title: string;
    description: string;
  }>;
}

interface IArgs {
  url: string;
  strategy: "mobile" | "desktop" | "both";
  baseUrl: string;
}

function parseArgs(): IArgs {
  const args = process.argv.slice(2);
  const result: IArgs = {
    url: "/",
    strategy: "mobile",
    baseUrl: process.env.SITE_URL || "",
  };

  for (const arg of args) {
    if (arg.startsWith("--url=")) {
      result.url = arg.split("=")[1];
    } else if (arg.startsWith("--strategy=")) {
      result.strategy = arg.split("=")[1] as IArgs["strategy"];
    } else if (arg.startsWith("--base-url=")) {
      result.baseUrl = arg.split("=")[1];
    }
  }

  if (!result.baseUrl) {
    console.error(
      "Error: --base-url is required (or set SITE_URL env var)",
    );
    console.log("\nUsage:");
    console.log(
      "  yarn tsx scripts/seo-pagespeed-check.ts --base-url=https://myimageupscaler.com",
    );
    process.exit(1);
  }

  return result;
}

function getRating(value: number, metric: string): string {
  const thresholds: Record<string, { good: number; poor: number }> = {
    lcp: { good: 2500, poor: 4000 },
    fid: { good: 100, poor: 300 },
    cls: { good: 0.1, poor: 0.25 },
    inp: { good: 200, poor: 500 },
    fcp: { good: 1800, poor: 3000 },
    ttfb: { good: 800, poor: 1800 },
  };

  const t = thresholds[metric];
  if (!t) return "unknown";

  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}

function getRatingEmoji(rating: string): string {
  switch (rating) {
    case "good":
      return "🟢";
    case "needs-improvement":
      return "🟡";
    case "poor":
      return "🔴";
    default:
      return "⚪";
  }
}

function getScoreEmoji(score: number): string {
  if (score >= 90) return "🟢";
  if (score >= 50) return "🟡";
  return "🔴";
}

async function fetchPageSpeed(
  url: string,
  strategy: "mobile" | "desktop",
): Promise<IPageSpeedResult | null> {
  const apiKey = process.env.PAGESPEED_API_KEY || "";
  const encodedUrl = encodeURIComponent(url);

  let apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodedUrl}&strategy=${strategy}&category=performance&category=accessibility&category=best-practices&category=seo`;

  if (apiKey) {
    apiUrl += `&key=${apiKey}`;
  }

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      const error = await response.json();
      console.error(
        `API Error: ${error.error?.message || response.statusText}`,
      );
      return null;
    }

    const data = await response.json();
    const lighthouse = data.lighthouseResult;
    const loadingExperience = data.loadingExperience;

    const scores = {
      performance: Math.round(
        (lighthouse.categories.performance?.score || 0) * 100,
      ),
      accessibility: Math.round(
        (lighthouse.categories.accessibility?.score || 0) * 100,
      ),
      bestPractices: Math.round(
        (lighthouse.categories["best-practices"]?.score || 0) * 100,
      ),
      seo: Math.round((lighthouse.categories.seo?.score || 0) * 100),
    };

    const metrics = loadingExperience?.metrics || {};
    const audits = lighthouse.audits || {};

    const getLcpValue = () => {
      if (metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile) {
        return metrics.LARGEST_CONTENTFUL_PAINT_MS.percentile;
      }
      return audits["largest-contentful-paint"]?.numericValue || 0;
    };

    const getClsValue = () => {
      if (metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile) {
        return metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100;
      }
      return audits["cumulative-layout-shift"]?.numericValue || 0;
    };

    const lcpValue = getLcpValue();
    const clsValue = getClsValue();
    const fidValue = metrics.FIRST_INPUT_DELAY_MS?.percentile || 0;
    const inpValue = metrics.INTERACTION_TO_NEXT_PAINT?.percentile || null;
    const fcpValue = audits["first-contentful-paint"]?.numericValue || 0;
    const ttfbValue = audits["server-response-time"]?.numericValue || 0;

    const coreWebVitals = {
      lcp: { value: lcpValue, rating: getRating(lcpValue, "lcp") },
      fid: { value: fidValue, rating: getRating(fidValue, "fid") },
      cls: { value: clsValue, rating: getRating(clsValue, "cls") },
      inp: inpValue
        ? { value: inpValue, rating: getRating(inpValue, "inp") }
        : null,
      fcp: { value: fcpValue, rating: getRating(fcpValue, "fcp") },
      ttfb: { value: ttfbValue, rating: getRating(ttfbValue, "ttfb") },
    };

    const opportunities = Object.values(lighthouse.audits || {})
      .filter(
        (audit: any) =>
          audit.details?.type === "opportunity" &&
          audit.details?.overallSavingsMs > 0,
      )
      .map((audit: any) => ({
        id: audit.id,
        title: audit.title,
        savings: `${(audit.details.overallSavingsMs / 1000).toFixed(1)}s`,
      }))
      .sort((a: any, b: any) => parseFloat(b.savings) - parseFloat(a.savings))
      .slice(0, 5);

    const diagnosticIds = [
      "dom-size",
      "render-blocking-resources",
      "unused-javascript",
      "unused-css-rules",
      "modern-image-formats",
      "uses-responsive-images",
    ];

    const diagnostics = diagnosticIds
      .map((id) => lighthouse.audits[id])
      .filter((audit: any) => audit && audit.score !== null && audit.score < 1)
      .map((audit: any) => ({
        id: audit.id,
        title: audit.title,
        description: audit.displayValue || "",
      }));

    return {
      url,
      strategy,
      fetchedAt: new Date().toISOString(),
      scores,
      coreWebVitals,
      opportunities,
      diagnostics,
    };
  } catch (error) {
    console.error(
      `Failed to fetch PageSpeed data: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return null;
  }
}

function printResult(result: IPageSpeedResult) {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${result.strategy.toUpperCase()} RESULTS`);
  console.log("═".repeat(60) + "\n");

  console.log("📊 LIGHTHOUSE SCORES");
  console.log("-".repeat(40));
  console.log(
    `  ${getScoreEmoji(result.scores.performance)} Performance:     ${result.scores.performance}`,
  );
  console.log(
    `  ${getScoreEmoji(result.scores.accessibility)} Accessibility:   ${result.scores.accessibility}`,
  );
  console.log(
    `  ${getScoreEmoji(result.scores.bestPractices)} Best Practices:  ${result.scores.bestPractices}`,
  );
  console.log(
    `  ${getScoreEmoji(result.scores.seo)} SEO:             ${result.scores.seo}`,
  );

  console.log("\n⚡ CORE WEB VITALS");
  console.log("-".repeat(40));

  const cwv = result.coreWebVitals;
  console.log(
    `  ${getRatingEmoji(cwv.lcp.rating)} LCP:  ${(cwv.lcp.value / 1000).toFixed(2)}s (${cwv.lcp.rating})`,
  );
  console.log(
    `  ${getRatingEmoji(cwv.fid.rating)} FID:  ${cwv.fid.value}ms (${cwv.fid.rating})`,
  );
  console.log(
    `  ${getRatingEmoji(cwv.cls.rating)} CLS:  ${cwv.cls.value.toFixed(3)} (${cwv.cls.rating})`,
  );
  if (cwv.inp) {
    console.log(
      `  ${getRatingEmoji(cwv.inp.rating)} INP:  ${cwv.inp.value}ms (${cwv.inp.rating})`,
    );
  }
  console.log(
    `  ${getRatingEmoji(cwv.fcp.rating)} FCP:  ${(cwv.fcp.value / 1000).toFixed(2)}s (${cwv.fcp.rating})`,
  );
  console.log(
    `  ${getRatingEmoji(cwv.ttfb.rating)} TTFB: ${cwv.ttfb.value}ms (${cwv.ttfb.rating})`,
  );

  if (result.opportunities.length > 0) {
    console.log("\n💡 TOP OPPORTUNITIES");
    console.log("-".repeat(40));
    result.opportunities.forEach((opp, idx) => {
      console.log(`  ${idx + 1}. ${opp.title}`);
      console.log(`     Potential savings: ${opp.savings}`);
    });
  }

  if (result.diagnostics.length > 0) {
    console.log("\n🔍 DIAGNOSTICS");
    console.log("-".repeat(40));
    result.diagnostics.forEach((diag) => {
      console.log(`  - ${diag.title}`);
      if (diag.description) {
        console.log(`    ${diag.description}`);
      }
    });
  }
}

async function main() {
  const { url, strategy, baseUrl } = parseArgs();
  const fullUrl = `${baseUrl}${url.startsWith("/") ? url : `/${url}`}`;

  console.log("\n🚀 PAGESPEED INSIGHTS CHECK");
  console.log("═".repeat(60));
  console.log(`URL: ${fullUrl}`);
  console.log(`Strategy: ${strategy}`);

  if (!process.env.PAGESPEED_API_KEY) {
    console.log(
      "\n⚠️  No PAGESPEED_API_KEY set - using public API (lower quota)",
    );
    console.log(
      "   Get a free key at: https://developers.google.com/speed/docs/insights/v5/get-started\n",
    );
  }

  const results: IPageSpeedResult[] = [];
  const strategies: Array<"mobile" | "desktop"> =
    strategy === "both"
      ? ["mobile", "desktop"]
      : [strategy as "mobile" | "desktop"];

  for (const strat of strategies) {
    console.log(`\nFetching ${strat} data...`);
    const result = await fetchPageSpeed(fullUrl, strat);

    if (result) {
      results.push(result);
      printResult(result);
    } else {
      console.log(`❌ Failed to fetch ${strat} data`);
    }
  }

  if (results.length > 0) {
    const dateStr = new Date().toISOString().split("T")[0];
    const reportDir = `/home/joao/projects/pixelperfect/seo-reports/${dateStr}`;
    fs.mkdirSync(reportDir, { recursive: true });
    const pageName = url.replace(/\//g, "-").replace(/^-/, "") || "home";
    const exportPath = `${reportDir}/pagespeed-${pageName}.json`;
    fs.writeFileSync(
      exportPath,
      JSON.stringify({ url: fullUrl, results }, null, 2),
    );
    console.log(`\n📁 Full report: ${exportPath}`);
  }

  console.log("\n" + "═".repeat(60));
  console.log("                  RECOMMENDATIONS");
  console.log("═".repeat(60) + "\n");

  const mobileResult = results.find((r) => r.strategy === "mobile");
  if (mobileResult) {
    const perf = mobileResult.scores.performance;

    if (perf < 50) {
      console.log("🔴 CRITICAL: Performance score is very low");
      console.log("   Priority actions:");
      console.log("   1. Reduce JavaScript bundle size");
      console.log("   2. Optimize images (WebP, lazy loading)");
      console.log("   3. Enable text compression");
      console.log("   4. Reduce server response time");
    } else if (perf < 90) {
      console.log("🟡 Performance could be improved");
      console.log("   Review the opportunities above for quick wins");
    } else {
      console.log("🟢 Performance is good! Focus on maintaining it.");
    }

    if (mobileResult.coreWebVitals.lcp.rating === "poor") {
      console.log("\n⚠️  LCP needs attention:");
      console.log("   - Preload hero images");
      console.log("   - Optimize server response time");
      console.log("   - Remove render-blocking resources");
    }

    if (mobileResult.coreWebVitals.cls.rating === "poor") {
      console.log("\n⚠️  CLS needs attention:");
      console.log("   - Add width/height to images");
      console.log("   - Reserve space for dynamic content");
      console.log("   - Avoid inserting content above existing content");
    }
  }

  console.log("\n✅ PageSpeed check complete!\n");
}

main().catch(console.error);
