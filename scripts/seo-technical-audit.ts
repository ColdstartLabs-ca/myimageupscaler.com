#!/usr/bin/env tsx
/**
 * SEO Technical Audit Script for MyImageUpscaler
 * Audits pages for technical SEO issues using Playwright
 *
 * Usage:
 *   yarn tsx scripts/seo-technical-audit.ts --base-url=https://myimageupscaler.com
 *   yarn tsx scripts/seo-technical-audit.ts --base-url=https://myimageupscaler.com --url=/pricing
 *   yarn tsx scripts/seo-technical-audit.ts --base-url=http://localhost:3000 --pages=10
 */

import { chromium, Browser, Page } from "playwright";
import * as fs from "fs";

interface IPageAudit {
  url: string;
  status: number;
  loadTime: number;
  meta: {
    title: string;
    titleLength: number;
    description: string | null;
    descriptionLength: number;
    canonical: string | null;
    robots: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
  };
  headings: {
    h1Count: number;
    h1Text: string[];
    h2Count: number;
    headingOrder: string[];
  };
  images: {
    total: number;
    missingAlt: number;
    missingDimensions: number;
    notLazy: number;
  };
  links: {
    total: number;
    internal: number;
    external: number;
    broken: string[];
    noText: number;
  };
  schema: {
    count: number;
    types: string[];
    hasOrganization: boolean;
    hasBreadcrumb: boolean;
    errors: string[];
  };
  performance: {
    domElements: number;
    scripts: number;
    stylesheets: number;
    domContentLoaded: number;
    resourceCount: number;
  };
  issues: Array<{
    severity: "critical" | "high" | "medium" | "low";
    issue: string;
    recommendation: string;
  }>;
}

interface IArgs {
  url: string | null;
  pages: number;
  baseUrl: string;
}

function parseArgs(): IArgs {
  const args = process.argv.slice(2);
  const result: IArgs = {
    url: null,
    pages: 5,
    baseUrl: process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "",
  };

  for (const arg of args) {
    if (arg.startsWith("--url=")) {
      result.url = arg.split("=")[1];
    } else if (arg.startsWith("--pages=")) {
      result.pages = parseInt(arg.split("=")[1], 10);
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
      "  yarn tsx scripts/seo-technical-audit.ts --base-url=https://myimageupscaler.com",
    );
    console.log(
      "  yarn tsx scripts/seo-technical-audit.ts --base-url=http://localhost:3000 --pages=10",
    );
    process.exit(1);
  }

  return result;
}

async function auditPage(page: Page, url: string): Promise<IPageAudit> {
  const startTime = Date.now();
  const issues: IPageAudit["issues"] = [];

  const response = await page.goto(url, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  const loadTime = Date.now() - startTime;
  const status = response?.status() || 0;

  const meta = await page.evaluate(() => {
    const title = document.title || "";
    const descEl = document.querySelector('meta[name="description"]');
    const description = descEl?.getAttribute("content") || null;

    return {
      title,
      titleLength: title.length,
      description,
      descriptionLength: description?.length || 0,
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
        null,
      robots:
        document
          .querySelector('meta[name="robots"]')
          ?.getAttribute("content") || null,
      ogTitle:
        document
          .querySelector('meta[property="og:title"]')
          ?.getAttribute("content") || null,
      ogDescription:
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute("content") || null,
      ogImage:
        document
          .querySelector('meta[property="og:image"]')
          ?.getAttribute("content") || null,
    };
  });

  if (!meta.title || meta.titleLength === 0) {
    issues.push({
      severity: "critical",
      issue: "Missing page title",
      recommendation: "Add a unique, descriptive title tag",
    });
  } else if (meta.titleLength < 30) {
    issues.push({
      severity: "medium",
      issue: `Title too short (${meta.titleLength} chars)`,
      recommendation: "Title should be 50-60 characters",
    });
  } else if (meta.titleLength > 60) {
    issues.push({
      severity: "low",
      issue: `Title may be truncated (${meta.titleLength} chars)`,
      recommendation: "Keep title under 60 characters",
    });
  }

  if (!meta.description) {
    issues.push({
      severity: "high",
      issue: "Missing meta description",
      recommendation: "Add a compelling meta description (150-160 chars)",
    });
  } else if (meta.descriptionLength < 120) {
    issues.push({
      severity: "medium",
      issue: `Meta description too short (${meta.descriptionLength} chars)`,
      recommendation: "Expand to 150-160 characters",
    });
  } else if (meta.descriptionLength > 160) {
    issues.push({
      severity: "low",
      issue: `Meta description may be truncated (${meta.descriptionLength} chars)`,
      recommendation: "Keep under 160 characters",
    });
  }

  if (!meta.canonical) {
    issues.push({
      severity: "high",
      issue: "Missing canonical tag",
      recommendation: "Add canonical URL to prevent duplicate content",
    });
  }

  if (!meta.ogTitle || !meta.ogImage) {
    issues.push({
      severity: "medium",
      issue: "Incomplete Open Graph tags",
      recommendation:
        "Add og:title, og:description, og:image for social sharing",
    });
  }

  const headings = await page.evaluate(() => {
    const h1s = document.querySelectorAll("h1");
    const h2s = document.querySelectorAll("h2");
    const allHeadings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");

    return {
      h1Count: h1s.length,
      h1Text: Array.from(h1s)
        .map((h) => h.textContent?.trim() || "")
        .filter(Boolean),
      h2Count: h2s.length,
      headingOrder: Array.from(allHeadings).map((h) => h.tagName),
    };
  });

  if (headings.h1Count === 0) {
    issues.push({
      severity: "high",
      issue: "Missing H1 tag",
      recommendation: "Add a single, descriptive H1 tag",
    });
  } else if (headings.h1Count > 1) {
    issues.push({
      severity: "medium",
      issue: `Multiple H1 tags (${headings.h1Count})`,
      recommendation: "Use only one H1 per page",
    });
  }

  const images = await page.evaluate(() => {
    const imgs = document.querySelectorAll("img");
    return {
      total: imgs.length,
      missingAlt: Array.from(imgs).filter((i) => !i.alt).length,
      missingDimensions: Array.from(imgs).filter((i) => !i.width || !i.height).length,
      notLazy: Array.from(imgs).filter((i) => i.loading !== "lazy" && !i.src.includes("data:")).length,
    };
  });

  if (images.missingAlt > 0) {
    issues.push({
      severity: "medium",
      issue: `${images.missingAlt} images missing alt text`,
      recommendation: "Add descriptive alt text for accessibility and SEO",
    });
  }

  if (images.missingDimensions > 3) {
    issues.push({
      severity: "medium",
      issue: `${images.missingDimensions} images missing width/height`,
      recommendation: "Add explicit dimensions to prevent CLS",
    });
  }

  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll("a[href]");
    const hostname = window.location.hostname;
    return {
      total: anchors.length,
      internal: Array.from(anchors).filter((a) => (a as HTMLAnchorElement).href.includes(hostname)).length,
      external: Array.from(anchors).filter((a) => !(a as HTMLAnchorElement).href.includes(hostname) && (a as HTMLAnchorElement).href.startsWith("http")).length,
      noText: Array.from(anchors).filter((a) => !a.textContent?.trim()).length,
      broken: [] as string[],
    };
  });

  if (links.noText > 0) {
    issues.push({
      severity: "low",
      issue: `${links.noText} links without anchor text`,
      recommendation: "Add descriptive anchor text or aria-label",
    });
  }

  const schema = await page.evaluate(() => {
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    const schemas: Array<{ type: string; error?: string }> = [];

    scripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || "{}");
        const type =
          data["@type"] ||
          (Array.isArray(data["@graph"]) ? "Graph" : "Unknown");
        schemas.push({ type });
      } catch {
        schemas.push({ type: "Invalid", error: "JSON parse error" });
      }
    });

    return {
      count: scripts.length,
      types: schemas.map((s) => s.type),
      hasOrganization: schemas.some((s) => s.type === "Organization"),
      hasBreadcrumb: schemas.some((s) => s.type === "BreadcrumbList"),
      errors: schemas.filter((s) => s.error).map((s) => s.error!),
    };
  });

  if (schema.count === 0) {
    issues.push({
      severity: "medium",
      issue: "No structured data found",
      recommendation: "Add JSON-LD schema markup for rich results",
    });
  }

  if (schema.errors.length > 0) {
    issues.push({
      severity: "high",
      issue: `Invalid schema markup: ${schema.errors.join(", ")}`,
      recommendation: "Fix JSON-LD syntax errors",
    });
  }

  const performance = await page.evaluate(() => {
    return {
      domElements: document.querySelectorAll("*").length,
      scripts: document.querySelectorAll("script").length,
      stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
      domContentLoaded:
        window.performance.timing.domContentLoadedEventEnd -
        window.performance.timing.navigationStart,
      resourceCount: window.performance.getEntriesByType("resource").length,
    };
  });

  if (performance.domElements > 1500) {
    issues.push({
      severity: "medium",
      issue: `Large DOM size (${performance.domElements} elements)`,
      recommendation:
        "Simplify page structure, consider pagination/virtualization",
    });
  }

  if (loadTime > 3000) {
    issues.push({
      severity: "high",
      issue: `Slow page load (${(loadTime / 1000).toFixed(1)}s)`,
      recommendation: "Optimize server response, reduce blocking resources",
    });
  }

  return {
    url,
    status,
    loadTime,
    meta,
    headings,
    images,
    links,
    schema,
    performance,
    issues,
  };
}

async function main() {
  const { url, pages, baseUrl } = parseArgs();

  console.log("\n🔍 SEO TECHNICAL AUDIT");
  console.log("═".repeat(60));
  console.log(`Base URL: ${baseUrl}`);
  console.log(
    `Mode: ${url ? `Single page (${url})` : `Multi-page (${pages} pages)`}\n`,
  );

  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; SEOBot/1.0; +https://myimageupscaler.com)",
  });
  const page = await context.newPage();

  const pagesToAudit = url
    ? [`${baseUrl}${url.startsWith("/") ? url : `/${url}`}`]
    : [
        `${baseUrl}/`,
        `${baseUrl}/pricing`,
        `${baseUrl}/app`,
        `${baseUrl}/blog`,
        `${baseUrl}/tools/ai-image-upscaler`,
        `${baseUrl}/alternatives/topaz-gigapixel`,
      ].slice(0, pages);

  const results: IPageAudit[] = [];
  let totalIssues = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const pageUrl of pagesToAudit) {
    console.log(`Auditing: ${pageUrl}`);
    try {
      const audit = await auditPage(page, pageUrl);
      results.push(audit);

      audit.issues.forEach((issue) => {
        totalIssues[issue.severity]++;
      });

      const statusIcon = audit.status === 200 ? "✅" : "❌";
      console.log(
        `  ${statusIcon} Status: ${audit.status}, Load: ${audit.loadTime}ms, Issues: ${audit.issues.length}`,
      );
    } catch (error) {
      console.log(
        `  ❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      results.push({
        url: pageUrl,
        status: 0,
        loadTime: 0,
        meta: {
          title: "",
          titleLength: 0,
          description: null,
          descriptionLength: 0,
          canonical: null,
          robots: null,
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
        },
        headings: { h1Count: 0, h1Text: [], h2Count: 0, headingOrder: [] },
        images: {
          total: 0,
          missingAlt: 0,
          missingDimensions: 0,
          notLazy: 0,
        },
        links: { total: 0, internal: 0, external: 0, broken: [], noText: 0 },
        schema: {
          count: 0,
          types: [],
          hasOrganization: false,
          hasBreadcrumb: false,
          errors: [],
        },
        performance: {
          domElements: 0,
          scripts: 0,
          stylesheets: 0,
          domContentLoaded: 0,
          resourceCount: 0,
        },
        issues: [
          {
            severity: "critical",
            issue: "Page failed to load",
            recommendation: "Check server and URL",
          },
        ],
      });
      totalIssues.critical++;
    }
  }

  await browser.close();

  console.log("\n" + "═".repeat(60));
  console.log("                    AUDIT SUMMARY");
  console.log("═".repeat(60) + "\n");

  console.log(`Pages Audited: ${results.length}`);
  console.log(`\nIssues by Severity:`);
  console.log(`  🔴 Critical: ${totalIssues.critical}`);
  console.log(`  🟠 High:     ${totalIssues.high}`);
  console.log(`  🟡 Medium:   ${totalIssues.medium}`);
  console.log(`  🟢 Low:      ${totalIssues.low}`);

  const criticalIssues = results.flatMap((r) =>
    r.issues
      .filter((i) => i.severity === "critical" || i.severity === "high")
      .map((i) => ({ url: r.url, ...i })),
  );

  if (criticalIssues.length > 0) {
    console.log("\n" + "═".repeat(60));
    console.log("                 CRITICAL & HIGH ISSUES");
    console.log("═".repeat(60) + "\n");

    criticalIssues.forEach((issue, idx) => {
      const icon = issue.severity === "critical" ? "🔴" : "🟠";
      console.log(`${idx + 1}. ${icon} ${issue.issue}`);
      console.log(`   Page: ${issue.url}`);
      console.log(`   Fix: ${issue.recommendation}\n`);
    });
  }

  const dateStr = new Date().toISOString().split("T")[0];
  const reportDir = `/home/joao/projects/pixelperfect/seo-reports/${dateStr}`;
  fs.mkdirSync(reportDir, { recursive: true });
  const exportPath = `${reportDir}/seo-technical-audit.json`;
  fs.writeFileSync(
    exportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl,
        summary: {
          pagesAudited: results.length,
          issues: totalIssues,
        },
        pages: results,
      },
      null,
      2,
    ),
  );

  console.log(`\n📁 Full report: ${exportPath}`);
  console.log("\n✅ Audit complete!\n");

  process.exit(totalIssues.critical > 0 ? 1 : 0);
}

main().catch(console.error);
