/**
 * Programmatic SEO Content Audit Script
 * Uses Playwright to audit pSEO pages for quality, SEO, and performance
 *
 * Usage:
 *   yarn tsx scripts/pseo-audit.ts
 *   yarn tsx scripts/pseo-audit.ts --sample=50
 *   yarn tsx scripts/pseo-audit.ts --category=alternatives
 */

import { chromium, type Browser, type Page } from 'playwright';
import fs from 'fs';
import path from 'path';

interface IAuditResult {
  url: string;
  title: string;
  description: string;
  h1: string;
  wordCount: number;
  keywordPresence: {
    primary: boolean;
    inTitle: boolean;
    inH1: boolean;
    inBody: boolean;
  };
  technicalSeo: {
    hasCanonical: boolean;
    canonicalUrl: string;
    hasSchema: boolean;
    schemaTypes: string[];
    hasMetaDescription: boolean;
    hasOpenGraph: boolean;
    hasTwitterCard: boolean;
  };
  contentQuality: {
    hasUniqueContent: boolean;
    hasDynamicElements: boolean;
    hasSampleOutput: boolean;
    hasConversionStats: boolean;
    internalLinksCount: number;
    faqCount: number;
  };
  performance: {
    loadTime: number;
    domContentLoaded: number;
  };
  issues: string[];
  score: number;
}

interface IArgs {
  sample: number;
  category: string | null;
}

function parseArgs(): IArgs {
  const args = process.argv.slice(2);
  const result: IArgs = {
    sample: 20,
    category: null,
  };

  for (const arg of args) {
    if (arg.startsWith('--sample=')) {
      result.sample = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--category=')) {
      result.category = arg.split('=')[1];
    }
  }

  return result;
}

class PSeoAuditor {
  private baseUrl: string;
  private browser: Browser | null = null;
  private results: IAuditResult[] = [];

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
    });
    console.log('[Audit] Browser launched');
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log('[Audit] Browser closed');
    }
  }

  /**
   * Fetch all pSEO URLs from sitemap
   */
  async fetchSitemapUrls(category?: string): Promise<string[]> {
    // Pixelperfect sitemap structure
    const sitemaps = [
      `${this.baseUrl}/sitemap-static.xml`,
      `${this.baseUrl}/sitemap-tools.xml`,
      `${this.baseUrl}/sitemap-alternatives.xml`,
      `${this.baseUrl}/sitemap-formats.xml`,
      `${this.baseUrl}/sitemap-guides.xml`,
      `${this.baseUrl}/sitemap-compare.xml`,
      `${this.baseUrl}/sitemap-free.xml`,
      `${this.baseUrl}/sitemap-scale.xml`,
      `${this.baseUrl}/sitemap-use-cases.xml`,
    ];

    const allUrls: string[] = [];

    for (const sitemapUrl of sitemaps) {
      // Skip specific category sitemaps if filter is set
      if (category && !sitemapUrl.includes(category)) {
        continue;
      }

      try {
        const response = await fetch(sitemapUrl);
        const xml = await response.text();
        const urls = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
        const extractedUrls = urls.map((u) => u.replace(/<loc>|<\/loc>/g, ''));
        allUrls.push(...extractedUrls);
      } catch (error) {
        console.error(`[Audit] Failed to fetch ${sitemapUrl}:`, error);
      }
    }

    console.log(`[Audit] Found ${allUrls.length} URLs in sitemaps`);
    return allUrls;
  }

  /**
   * Audit a single page
   */
  async auditPage(url: string, targetKeyword?: string): Promise<IAuditResult> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();
    const issues: string[] = [];
    let score = 100;

    const performanceMetrics = {
      navigationStart: 0,
      domContentLoaded: 0,
      loadComplete: 0,
    };

    try {
      const startTime = Date.now();

      page.on('domcontentloaded', () => {
        performanceMetrics.domContentLoaded = Date.now() - startTime;
      });

      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      performanceMetrics.loadComplete = Date.now() - startTime;

      const title = await page.title();
      const description = (await page.getAttribute('meta[name="description"]', 'content')) || '';

      const h1Element = await page.$('h1');
      const h1 = h1Element ? await h1Element.textContent() : '';

      const bodyText = await page.evaluate(() => document.body.innerText);
      const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

      const keyword = targetKeyword || this.extractKeywordFromUrl(url);
      const keywordLower = keyword.toLowerCase();

      const keywordInTitle = title.toLowerCase().includes(keywordLower);
      const keywordInH1 = h1.toLowerCase().includes(keywordLower);
      const keywordInBody = bodyText.toLowerCase().includes(keywordLower);
      const keywordPresent = keywordInTitle && keywordInH1 && keywordInBody;

      if (!keywordInTitle) {
        issues.push('Target keyword not in title tag');
        score -= 10;
      }
      if (!keywordInH1) {
        issues.push('Target keyword not in H1');
        score -= 10;
      }
      if (!keywordInBody) {
        issues.push('Target keyword not in body content');
        score -= 5;
      }

      const canonicalUrl = (await page.getAttribute('link[rel="canonical"]', 'href')) || '';
      const hasCanonical = !!canonicalUrl;

      if (!hasCanonical) {
        issues.push('Missing canonical tag');
        score -= 5;
      }

      const schemaScripts = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
        scripts.map((s) => {
          try {
            return JSON.parse(s.textContent || '');
          } catch {
            return {};
          }
        })
      );

      const schemaTypes = schemaScripts
        .map((s: Record<string, unknown>) => s['@type'])
        .filter(Boolean);
      const hasSchema = schemaTypes.length > 0;

      if (!hasSchema) {
        issues.push('Missing schema markup');
        score -= 5;
      }

      const hasMetaDescription = description.length > 0;
      if (!hasMetaDescription) {
        issues.push('Missing meta description');
        score -= 10;
      }

      const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content');
      const hasOpenGraph = !!ogTitle;
      if (!hasOpenGraph) {
        issues.push('Missing Open Graph tags');
        score -= 3;
      }

      const twitterCard = await page.getAttribute('meta[name="twitter:card"]', 'content');
      const hasTwitterCard = !!twitterCard;

      const internalLinks = await page.$$eval('a[href^="/"]', (links) => links.length);

      const faqItems = await page.$$eval('[itemtype*="FAQ"] itemtype, .faq, [role="faq"]', (items) => items.length);
      const faqCount = faqItems > 0 ? faqItems : await page.$$eval('details', (d) => d.length);

      const hasSampleOutput = await page.$('[data-testid="sample-output"], .sample-output, .preview, [data-testid="tool-preview"]') !== null;
      const hasConversionStats = await page.$('[data-testid="conversion-stats"], .stats-badge, .conversion-count') !== null;

      const hasDynamicElements = hasSampleOutput || hasConversionStats;
      if (!hasDynamicElements) {
        issues.push('No dynamic content elements found (sample output, stats, etc.)');
        score -= 15;
      }

      if (wordCount < 200) {
        issues.push(`Thin content: ${wordCount} words (target: 200+)`);
        score -= 15;
      }

      if (faqCount > 8) {
        issues.push(`FAQ bloat: ${faqCount} FAQs (target: 3-5)`);
        score -= 5;
      }

      const result: IAuditResult = {
        url,
        title,
        description,
        h1: h1 || '',
        wordCount,
        keywordPresence: {
          primary: keywordPresent,
          inTitle: keywordInTitle,
          inH1: keywordInH1,
          inBody: keywordInBody,
        },
        technicalSeo: {
          hasCanonical,
          canonicalUrl,
          hasSchema,
          schemaTypes,
          hasMetaDescription,
          hasOpenGraph,
          hasTwitterCard,
        },
        contentQuality: {
          hasUniqueContent: wordCount >= 200,
          hasDynamicElements,
          hasSampleOutput,
          hasConversionStats,
          internalLinksCount: internalLinks,
          faqCount,
        },
        performance: {
          loadTime: performanceMetrics.loadComplete,
          domContentLoaded: performanceMetrics.domContentLoaded,
        },
        issues,
        score: Math.max(0, score),
      };

      this.results.push(result);

      await page.close();
      return result;
    } catch (error) {
      await page.close();
      issues.push(`Page load failed: ${error}`);
      return {
        url,
        title: '',
        description: '',
        h1: '',
        wordCount: 0,
        keywordPresence: { primary: false, inTitle: false, inH1: false, inBody: false },
        technicalSeo: {
          hasCanonical: false,
          canonicalUrl: '',
          hasSchema: false,
          schemaTypes: [],
          hasMetaDescription: false,
          hasOpenGraph: false,
          hasTwitterCard: false,
        },
        contentQuality: {
          hasUniqueContent: false,
          hasDynamicElements: false,
          hasSampleOutput: false,
          hasConversionStats: false,
          internalLinksCount: 0,
          faqCount: 0,
        },
        performance: { loadTime: 0, domContentLoaded: 0 },
        issues,
        score: 0,
      };
    }
  }

  /**
   * Extract target keyword from URL
   */
  private extractKeywordFromUrl(url: string): string {
    const urlParts = url.split('/').filter(Boolean);
    const lastPart = urlParts[urlParts.length - 1];
    return lastPart.replace(/-/g, ' ');
  }

  /**
   * Generate audit report
   */
  generateReport(): string {
    const totalPages = this.results.length;
    const avgScore = this.results.reduce((sum, r) => sum + r.score, 0) / totalPages;
    const highQualityPages = this.results.filter((r) => r.score >= 80).length;
    const lowQualityPages = this.results.filter((r) => r.score < 60).length;

    let report = '# Programmatic SEO Content Audit Report\n\n';

    report += '## Executive Summary\n\n';
    report += `- **Total Pages Audited**: ${totalPages}\n`;
    report += `- **Average Quality Score**: ${avgScore.toFixed(1)}/100\n`;
    report += `- **High Quality Pages (80+)**: ${highQualityPages} (${((highQualityPages / totalPages) * 100).toFixed(1)}%)\n`;
    report += `- **Low Quality Pages (<60)**: ${lowQualityPages} (${((lowQualityPages / totalPages) * 100).toFixed(1)}%)\n\n`;

    const allIssues = this.results.flatMap((r) => r.issues);
    const issueCounts = allIssues.reduce(
      (acc, issue) => {
        acc[issue] = (acc[issue] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    report += '## Most Common Issues\n\n';
    Object.entries(issueCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([issue, count]) => {
        report += `- **${issue}**: ${count} pages (${((count / totalPages) * 100).toFixed(1)}%)\n`;
      });

    report += '\n## Page-by-Page Results\n\n';
    report += '| URL | Score | Word Count | Issues |\n';
    report += '|-----|-------|------------|--------|\n';

    this.results.forEach((result) => {
      const urlShort = result.url.replace(this.baseUrl, '').substring(0, 40);
      const issuesStr = result.issues.slice(0, 3).join('; ');
      report += `| ${urlShort} | ${result.score}/100 | ${result.wordCount} | ${issuesStr} |\n`;
    });

    return report;
  }

  /**
   * Save report to file
   */
  async saveReport(outputPath: string): Promise<void> {
    const report = this.generateReport();
    await fs.promises.writeFile(outputPath, report, 'utf-8');
    console.log(`[Audit] Report saved to ${outputPath}`);
  }

  /**
   * Run batch audit on sample of pages
   */
  async runBatchAudit(urls: string[], sampleSize = 20): Promise<void> {
    console.log(`[Audit] Starting batch audit of ${Math.min(urls.length, sampleSize)} pages...`);

    const sampleUrls = urls.slice(0, sampleSize);

    for (let i = 0; i < sampleUrls.length; i++) {
      const url = sampleUrls[i];
      console.log(`[Audit] ${i + 1}/${sampleUrls.length}: ${url}`);

      await this.auditPage(url);
    }

    console.log('[Audit] Batch audit complete');
  }
}

/**
 * Main execution
 */
async function main() {
  const { sample, category } = parseArgs();
  const auditor = new PSeoAuditor('http://localhost:3000');

  try {
    await auditor.init();

    const urls = await auditor.fetchSitemapUrls(category || undefined);

    // Filter only pSEO pages (exclude static, blog, etc.)
    const pseoUrls = urls.filter(
      (url) =>
        (url.includes('/tools/') ||
         url.includes('/alternatives/') ||
         url.includes('/formats/') ||
         url.includes('/guides/') ||
         url.includes('/compare/') ||
         url.includes('/free/') ||
         url.includes('/scale/') ||
         url.includes('/use-cases/')) &&
        !url.includes('/blog/')
    );

    console.log(`[Audit] Found ${pseoUrls.length} pSEO pages to audit`);

    await auditor.runBatchAudit(pseoUrls, sample);

    const dateStr = new Date().toISOString().split('T')[0];
    const reportDir = path.join(process.cwd(), 'seo-reports', dateStr);
    fs.mkdirSync(reportDir, { recursive: true });
    const outputPath = path.join(reportDir, 'pseo-audit-report.md');

    await auditor.saveReport(outputPath);

    console.log('\n' + auditor.generateReport());
  } finally {
    await auditor.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { PSeoAuditor, type IAuditResult };
