#!/usr/bin/env tsx
/**
 * SEO Site Crawler for MyImageUpscaler
 * Crawls the site to find broken links, redirect chains, and orphan pages
 *
 * Usage:
 *   yarn tsx scripts/seo-crawl-site.ts --base-url=https://myimageupscaler.com
 *   yarn tsx scripts/seo-crawl-site.ts --base-url=https://myimageupscaler.com --depth=5 --max-pages=100
 *   yarn tsx scripts/seo-crawl-site.ts --base-url=http://localhost:3000 --check-external
 */

import { chromium, Browser, Page } from "playwright";
import * as fs from "fs";

interface ICrawledPage {
  url: string;
  status: number;
  title: string;
  internalLinks: string[];
  externalLinks: string[];
  redirectedTo?: string;
  loadTime: number;
  depth: number;
  foundOn: string;
}

interface ICrawlResult {
  startedAt: string;
  completedAt: string;
  baseUrl: string;
  pagesVisited: number;
  summary: {
    totalPages: number;
    brokenLinks: number;
    redirects: number;
    orphanPages: number;
    slowPages: number;
  };
  brokenLinks: Array<{ url: string; status: number; foundOn: string }>;
  redirects: Array<{ from: string; to: string; foundOn: string }>;
  slowPages: Array<{ url: string; loadTime: number }>;
  pages: ICrawledPage[];
}

interface IArgs {
  baseUrl: string;
  depth: number;
  maxPages: number;
  checkExternal: boolean;
  slowThreshold: number;
}

function parseArgs(): IArgs {
  const args = process.argv.slice(2);
  const result: IArgs = {
    baseUrl: process.env.SITE_URL || "",
    depth: 3,
    maxPages: 50,
    checkExternal: false,
    slowThreshold: 3000,
  };

  for (const arg of args) {
    if (arg.startsWith("--base-url=")) {
      result.baseUrl = arg.split("=")[1];
    } else if (arg.startsWith("--depth=")) {
      result.depth = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--max-pages=")) {
      result.maxPages = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--check-external") {
      result.checkExternal = true;
    } else if (arg.startsWith("--slow-threshold=")) {
      result.slowThreshold = parseInt(arg.split("=")[1], 10);
    }
  }

  if (!result.baseUrl) {
    console.error(
      "Error: --base-url is required (or set SITE_URL env var)",
    );
    console.log("\nUsage:");
    console.log(
      "  yarn tsx scripts/seo-crawl-site.ts --base-url=https://myimageupscaler.com",
    );
    process.exit(1);
  }

  return result;
}

function normalizeUrl(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url, baseUrl);
    let normalized = parsed.origin + parsed.pathname.replace(/\/$/, "");
    return normalized || baseUrl;
  } catch {
    return url;
  }
}

function isInternalUrl(url: string, baseUrl: string): boolean {
  try {
    const parsedUrl = new URL(url, baseUrl);
    const parsedBase = new URL(baseUrl);
    return parsedUrl.hostname === parsedBase.hostname;
  } catch {
    return false;
  }
}

function shouldCrawl(url: string): boolean {
  const skipPatterns = [
    /\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|mp4|mp3|css|js|woff|woff2|ttf|eot)$/i,
    /^mailto:/i,
    /^tel:/i,
    /^javascript:/i,
    /#/,
    /\?/,
  ];

  return !skipPatterns.some((pattern) => pattern.test(url));
}

async function crawlPage(
  page: Page,
  url: string,
  depth: number,
  foundOn: string,
  baseUrl: string,
): Promise<ICrawledPage | null> {
  const startTime = Date.now();

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const loadTime = Date.now() - startTime;
    const status = response?.status() || 0;
    const finalUrl = page.url();

    const redirectedTo = finalUrl !== url ? finalUrl : undefined;

    const pageInfo = await page.evaluate(() => {
      const anchors = document.querySelectorAll("a[href]");
      const links = Array.from(anchors)
        .map((a) => a.getAttribute("href"))
        .filter((href): href is string => !!href);

      return {
        title: document.title,
        links,
      };
    });

    const internalLinks: string[] = [];
    const externalLinks: string[] = [];

    for (const link of pageInfo.links) {
      const normalizedLink = normalizeUrl(link, baseUrl);
      if (isInternalUrl(normalizedLink, baseUrl)) {
        if (
          shouldCrawl(normalizedLink) &&
          !internalLinks.includes(normalizedLink)
        ) {
          internalLinks.push(normalizedLink);
        }
      } else if (link.startsWith("http")) {
        if (!externalLinks.includes(link)) {
          externalLinks.push(link);
        }
      }
    }

    return {
      url,
      status,
      title: pageInfo.title,
      internalLinks,
      externalLinks,
      redirectedTo,
      loadTime,
      depth,
      foundOn,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      title: "",
      internalLinks: [],
      externalLinks: [],
      loadTime: Date.now() - startTime,
      depth,
      foundOn,
    };
  }
}

async function main() {
  const {
    baseUrl,
    depth: maxDepth,
    maxPages,
    checkExternal,
    slowThreshold,
  } = parseArgs();

  console.log("\n🕷️  SEO SITE CRAWLER");
  console.log("═".repeat(60));
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Max Depth: ${maxDepth}`);
  console.log(`Max Pages: ${maxPages}`);
  console.log(`Check External: ${checkExternal}`);
  console.log(`Slow Threshold: ${slowThreshold}ms\n`);

  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (compatible; SEOCrawler/1.0)",
  });
  const page = await context.newPage();

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number; foundOn: string }> = [
    { url: normalizeUrl(baseUrl, baseUrl), depth: 0, foundOn: "start" },
  ];

  const pages: ICrawledPage[] = [];
  const brokenLinks: ICrawlResult["brokenLinks"] = [];
  const redirects: ICrawlResult["redirects"] = [];
  const slowPages: ICrawlResult["slowPages"] = [];
  const externalLinksToCheck: Array<{ url: string; foundOn: string }> = [];

  const startedAt = new Date().toISOString();

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth, foundOn } = queue.shift()!;

    if (visited.has(url)) continue;
    visited.add(url);

    process.stdout.write(
      `\rCrawling: ${pages.length + 1}/${maxPages} - ${url.substring(0, 50)}...`,
    );

    const result = await crawlPage(page, url, depth, foundOn, baseUrl);

    if (result) {
      pages.push(result);

      if (result.status >= 400 || result.status === 0) {
        brokenLinks.push({
          url: result.url,
          status: result.status,
          foundOn: result.foundOn,
        });
      }

      if (result.redirectedTo) {
        redirects.push({
          from: result.url,
          to: result.redirectedTo,
          foundOn: result.foundOn,
        });
      }

      if (result.loadTime > slowThreshold) {
        slowPages.push({ url: result.url, loadTime: result.loadTime });
      }

      if (depth < maxDepth) {
        for (const link of result.internalLinks) {
          if (!visited.has(link)) {
            queue.push({ url: link, depth: depth + 1, foundOn: url });
          }
        }
      }

      if (checkExternal) {
        for (const link of result.externalLinks) {
          externalLinksToCheck.push({ url: link, foundOn: url });
        }
      }
    }
  }

  // Check external links if requested
  if (checkExternal && externalLinksToCheck.length > 0) {
    console.log(
      `\n\nChecking ${externalLinksToCheck.length} external links...`,
    );
    const checkedExternal = new Set<string>();

    for (const { url, foundOn } of externalLinksToCheck.slice(0, 50)) {
      if (checkedExternal.has(url)) continue;
      checkedExternal.add(url);

      try {
        const response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          brokenLinks.push({ url, status: response.status, foundOn });
        }
      } catch {
        brokenLinks.push({ url, status: 0, foundOn });
      }
    }
  }

  await browser.close();

  const completedAt = new Date().toISOString();

  // Find orphan pages
  const linkedPages = new Set<string>();
  for (const p of pages) {
    for (const link of p.internalLinks) {
      linkedPages.add(link);
    }
  }
  const orphanPages = pages.filter(
    (p) => p.depth > 0 && !linkedPages.has(p.url) && p.foundOn === p.url,
  );

  // Print results
  console.log("\n\n" + "═".repeat(60));
  console.log("                      CRAWL RESULTS");
  console.log("═".repeat(60) + "\n");

  console.log(`📊 SUMMARY`);
  console.log("-".repeat(40));
  console.log(`  Pages crawled:    ${pages.length}`);
  console.log(`  Broken links:     ${brokenLinks.length}`);
  console.log(`  Redirects:        ${redirects.length}`);
  console.log(`  Slow pages:       ${slowPages.length}`);
  console.log(`  Orphan pages:     ${orphanPages.length}`);

  if (brokenLinks.length > 0) {
    console.log("\n🔴 BROKEN LINKS");
    console.log("-".repeat(40));
    brokenLinks.slice(0, 10).forEach((link) => {
      console.log(`  ${link.status || "ERR"}: ${link.url}`);
      console.log(`       Found on: ${link.foundOn}`);
    });
    if (brokenLinks.length > 10) {
      console.log(`  ... and ${brokenLinks.length - 10} more`);
    }
  }

  if (redirects.length > 0) {
    console.log("\n🔄 REDIRECTS");
    console.log("-".repeat(40));
    redirects.slice(0, 10).forEach((redir) => {
      console.log(`  ${redir.from}`);
      console.log(`  → ${redir.to}`);
    });
    if (redirects.length > 10) {
      console.log(`  ... and ${redirects.length - 10} more`);
    }
  }

  if (slowPages.length > 0) {
    console.log("\n🐢 SLOW PAGES (>${slowThreshold}ms)");
    console.log("-".repeat(40));
    slowPages
      .sort((a, b) => b.loadTime - a.loadTime)
      .slice(0, 10)
      .forEach((p) => {
        console.log(`  ${(p.loadTime / 1000).toFixed(2)}s: ${p.url}`);
      });
  }

  // Link distribution
  console.log("\n🔗 INTERNAL LINKING");
  console.log("-".repeat(40));
  const linkCounts = pages.map((p) => p.internalLinks.length);
  const avgLinks =
    linkCounts.length > 0
      ? linkCounts.reduce((a, b) => a + b, 0) / linkCounts.length
      : 0;
  const pagesWithFewLinks = pages.filter((p) => p.internalLinks.length < 3);

  console.log(`  Average links per page: ${avgLinks.toFixed(1)}`);
  console.log(`  Pages with < 3 links:   ${pagesWithFewLinks.length}`);

  if (pagesWithFewLinks.length > 0) {
    console.log("\n  Pages needing more internal links:");
    pagesWithFewLinks.slice(0, 5).forEach((p) => {
      console.log(`    - ${p.url} (${p.internalLinks.length} links)`);
    });
  }

  // Export results
  const result: ICrawlResult = {
    startedAt,
    completedAt,
    baseUrl,
    pagesVisited: pages.length,
    summary: {
      totalPages: pages.length,
      brokenLinks: brokenLinks.length,
      redirects: redirects.length,
      orphanPages: orphanPages.length,
      slowPages: slowPages.length,
    },
    brokenLinks,
    redirects,
    slowPages,
    pages,
  };

  const dateStr = new Date().toISOString().split("T")[0];
  const reportDir = `/home/joao/projects/pixelperfect/seo-reports/${dateStr}`;
  fs.mkdirSync(reportDir, { recursive: true });
  const exportPath = `${reportDir}/seo-crawl.json`;
  fs.writeFileSync(exportPath, JSON.stringify(result, null, 2));

  console.log(`\n📁 Full report: ${exportPath}`);
  console.log("\n✅ Crawl complete!\n");

  process.exit(brokenLinks.length > 0 ? 1 : 0);
}

main().catch(console.error);
