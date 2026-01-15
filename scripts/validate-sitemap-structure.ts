#!/usr/bin/env tsx

/**
 * Sitemap Structure Validator for PixelPerfect
 *
 * Validates sitemap XML structure for:
 * - Canonical URL correctness (points to proper locale)
 * - Hreflang completeness (all 7 locales + x-default)
 * - XML namespace validity
 * - Hreflang URL format consistency
 * - Proper sitemap index structure
 *
 * Usage:
 *   npx tsx scripts/validate-sitemap-structure.ts                        # Localhost (default)
 *   npx tsx scripts/validate-sitemap-structure.ts --base-url=https://myimageupscaler.com
 *   npx tsx scripts/validate-sitemap-structure.ts --port=3003            # Custom port
 */

import { parseStringPromise } from 'xml2js';
import https from 'node:https';
import http from 'node:http';

// Types for xml2js parsed results
interface IXml2JsSitemapIndex {
  sitemapindex?: {
    sitemap: Array<{ loc: string[]; lastmod?: string[] }>;
  };
}

interface IXml2JsUrlEntry {
  loc: string[];
  lastmod?: string[];
  changefreq?: string[];
  priority?: string[];
  'xhtml:link'?: Array<{
    $: { rel: string; hreflang: string; href: string };
  }>;
}

interface IXml2JsUrlset {
  urlset?: {
    $?: { xmlns: string; 'xmlns:xhtml'?: string };
    url: IXml2JsUrlEntry[];
  };
}

interface IXml2JsSitemap {
  urlset?: IXml2JsUrlset['urlset'];
  sitemapindex?: IXml2JsSitemapIndex['sitemapindex'];
}

// Supported locales from i18n config
const SUPPORTED_LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'it', 'ja'] as const;
const DEFAULT_LOCALE = 'en';
type Locale = (typeof SUPPORTED_LOCALES)[number];

interface IValidationIssue {
  sitemap: string;
  type: 'error' | 'warning';
  category: 'canonical' | 'hreflang' | 'namespace' | 'structure' | 'format';
  message: string;
  url?: string;
  expected?: string;
  actual?: string;
}

interface ISitemapValidationResult {
  sitemap: string;
  totalUrls: number;
  issues: IValidationIssue[];
  hasHreflang: boolean;
  hasCanonicalIssues: boolean;
  hasHreflangIssues: boolean;
}

interface IValidationReport {
  baseUrl: string;
  totalSitemaps: number;
  totalUrls: number;
  results: ISitemapValidationResult[];
  issuesByCategory: Record<string, IValidationIssue[]>;
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    byCategory: Record<string, number>;
  };
}

class SitemapStructureValidator {
  private baseUrl: string;
  private issues: IValidationIssue[] = [];
  private results: ISitemapValidationResult[] = [];
  private timeout = 10000; // 10 second timeout

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Fetch XML content from URL
   */
  private async fetchXml(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, { timeout: this.timeout }, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      });

      req.on('error', reject);
    });
  }

  /**
   * Parse sitemap XML
   */
  private async parseSitemap(url: string): Promise<IXml2JsSitemap> {
    const xml = await this.fetchXml(url);
    return (await parseStringPromise(xml)) as IXml2JsSitemap;
  }

  /**
   * Validate canonical URL in sitemap entry
   */
  private validateCanonicalUrl(entry: IXml2JsUrlEntry, sitemapName: string): void {
    const url = entry.loc[0];

    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // Extract locale from pathname
      const localeMatch = pathname.match(/^\/([a-z]{2})\//);
      const locale = localeMatch ? (localeMatch[1] as Locale) : DEFAULT_LOCALE;

      // Check if locale is supported
      if (!SUPPORTED_LOCALES.includes(locale)) {
        this.issues.push({
          sitemap: sitemapName,
          type: 'error',
          category: 'canonical',
          message: `Unsupported locale in canonical URL`,
          url,
          expected: `Locale should be one of: ${SUPPORTED_LOCALES.join(', ')}`,
          actual: locale,
        });
      }

      // Check that English (default) URLs don't have /en/ prefix
      if (locale === DEFAULT_LOCALE && pathname.startsWith(`/${DEFAULT_LOCALE}/`)) {
        this.issues.push({
          sitemap: sitemapName,
          type: 'warning',
          category: 'canonical',
          message: `Default locale (en) should not have locale prefix`,
          url,
          expected: 'No /en/ prefix for default locale',
          actual: pathname,
        });
      }
    } catch (error) {
      this.issues.push({
        sitemap: sitemapName,
        type: 'error',
        category: 'canonical',
        message: `Invalid canonical URL format`,
        url,
        expected: 'Valid URL with proper format',
        actual: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Validate hreflang links in sitemap entry
   */
  private validateHreflangLinks(entry: IXml2JsUrlEntry, sitemapName: string): void {
    const hreflangLinks = entry['xhtml:link'] || [];
    const canonicalUrl = entry.loc[0];

    if (hreflangLinks.length === 0) {
      // Not necessarily an error - some sitemaps may not have hreflang
      return;
    }

    // Extract the path from canonical URL for validation
    let expectedPath = '';
    try {
      const urlObj = new URL(canonicalUrl);
      expectedPath = urlObj.pathname;
    } catch {
      this.issues.push({
        sitemap: sitemapName,
        type: 'error',
        category: 'hreflang',
        message: `Invalid canonical URL for hreflang validation`,
        url: canonicalUrl,
      });
      return;
    }

    // Remove locale prefix from expected path for comparison
    const localeMatch = expectedPath.match(/^\/([a-z]{2})\/(.*)$/);
    const basePath = localeMatch ? `/${localeMatch[2]}` : expectedPath;

    // Track which locales we've seen
    const seenLocales = new Set<string>();

    for (const link of hreflangLinks) {
      const attrs = link.$;

      if (attrs.rel !== 'alternate') {
        this.issues.push({
          sitemap: sitemapName,
          type: 'warning',
          category: 'hreflang',
          message: `xhtml:link should have rel="alternate"`,
          url: canonicalUrl,
          expected: 'rel="alternate"',
          actual: `rel="${attrs.rel}"`,
        });
        continue;
      }

      const hreflang = attrs.hreflang;
      seenLocales.add(hreflang);

      // Validate hreflang URL format
      try {
        const hreflangUrl = new URL(attrs.href);
        const hreflangPath = hreflangUrl.pathname;

        // Check that hreflang URL matches expected pattern
        let expectedHreflangPath: string;
        if (hreflang === 'x-default') {
          // x-default should point to the default locale (no prefix)
          expectedHreflangPath = basePath;
        } else if (hreflang === DEFAULT_LOCALE) {
          // Default locale should not have prefix
          expectedHreflangPath = basePath;
        } else {
          // Other locales should have prefix
          expectedHreflangPath = `/${hreflang}${basePath}`;
        }

        if (hreflangPath !== expectedHreflangPath) {
          this.issues.push({
            sitemap: sitemapName,
            type: 'error',
            category: 'hreflang',
            message: `Hreflang URL path mismatch for hreflang="${hreflang}"`,
            url: canonicalUrl,
            expected: expectedHreflangPath,
            actual: hreflangPath,
          });
        }
      } catch (error) {
        this.issues.push({
          sitemap: sitemapName,
          type: 'error',
          category: 'hreflang',
          message: `Invalid hreflang URL format`,
          url: canonicalUrl,
          actual: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Check for missing required locales
    const requiredLocales = [...SUPPORTED_LOCALES, 'x-default'];
    for (const locale of requiredLocales) {
      if (!seenLocales.has(locale)) {
        this.issues.push({
          sitemap: sitemapName,
          type: 'error',
          category: 'hreflang',
          message: `Missing hreflang for locale "${locale}"`,
          url: canonicalUrl,
          expected: `xhtml:link rel="alternate" hreflang="${locale}"`,
        });
      }
    }

    // Check for extra/invalid hreflang entries
    for (const locale of seenLocales) {
      if (!requiredLocales.includes(locale)) {
        this.issues.push({
          sitemap: sitemapName,
          type: 'warning',
          category: 'hreflang',
          message: `Extra/invalid hreflang locale "${locale}" found`,
          url: canonicalUrl,
          expected: `Only ${requiredLocales.join(', ')}`,
        });
      }
    }
  }

  /**
   * Validate URL entry structure
   */
  private validateUrlEntry(entry: IXml2JsUrlEntry, sitemapName: string): void {
    // Check required elements
    if (!entry.loc || entry.loc.length === 0) {
      this.issues.push({
        sitemap: sitemapName,
        type: 'error',
        category: 'structure',
        message: `URL entry missing required <loc> element`,
      });
      return;
    }

    // Validate canonical URL
    this.validateCanonicalUrl(entry, sitemapName);

    // Validate hreflang links
    this.validateHreflangLinks(entry, sitemapName);
  }

  /**
   * Validate URL sitemap (not index)
   */
  private validateUrlSitemap(
    parsed: IXml2JsSitemap,
    sitemapName: string
  ): ISitemapValidationResult {
    const urlset = parsed.urlset;
    const sitemapIssues: IValidationIssue[] = [];
    const startingIssueCount = this.issues.length;

    // Check for URL entries
    if (!urlset?.url || urlset.url.length === 0) {
      sitemapIssues.push({
        sitemap: sitemapName,
        type: 'error',
        category: 'structure',
        message: `Sitemap has no URL entries`,
      });
      return {
        sitemap: sitemapName,
        totalUrls: 0,
        issues: sitemapIssues,
        hasHreflang: false,
        hasCanonicalIssues: false,
        hasHreflangIssues: false,
      };
    }

    // Check if any entries have hreflang
    const hasHreflang = urlset.url.some(
      entry => entry['xhtml:link'] && entry['xhtml:link'].length > 0
    );

    // Check XML namespaces - only required if sitemap has hreflang links
    if (hasHreflang) {
      const namespaces = urlset?.$ || {};
      if (!namespaces['xmlns:xhtml']) {
        sitemapIssues.push({
          sitemap: sitemapName,
          type: 'error',
          category: 'namespace',
          message: `Missing xmlns:xhtml namespace declaration (required for hreflang)`,
          expected: 'xmlns:xhtml="http://www.w3.org/1999/xhtml"',
        });
      }
    }

    // Validate each URL entry
    for (const entry of urlset.url) {
      this.validateUrlEntry(entry, sitemapName);
    }

    // Collect new issues for this sitemap
    const newIssues = this.issues.slice(startingIssueCount);
    sitemapIssues.push(...newIssues);

    return {
      sitemap: sitemapName,
      totalUrls: urlset.url.length,
      issues: sitemapIssues,
      hasHreflang,
      hasCanonicalIssues: sitemapIssues.some(i => i.category === 'canonical'),
      hasHreflangIssues: sitemapIssues.some(i => i.category === 'hreflang'),
    };
  }

  /**
   * Process a sitemap (can be index or urlset)
   */
  private async processSitemap(url: string): Promise<void> {
    console.log(`\n📄 Processing: ${url}`);

    try {
      const parsed = await this.parseSitemap(url);
      const sitemapName = url.split('/').pop() || url;

      // Check if it's a sitemap index (contains nested sitemaps)
      if (parsed.sitemapindex?.sitemap) {
        console.log(
          `   ↳ Sitemap index with ${parsed.sitemapindex.sitemap.length} nested sitemaps`
        );
        // Process each nested sitemap
        for (const nestedSitemap of parsed.sitemapindex.sitemap) {
          const nestedUrl = nestedSitemap.loc[0];
          await this.processSitemap(nestedUrl);
        }
      }
      // Check if it's a URL set (contains actual URLs)
      else if (parsed.urlset?.url) {
        const result = this.validateUrlSitemap(parsed, sitemapName);
        this.results.push(result);
        console.log(
          `   ✅ ${result.totalUrls} URLs${result.hasHreflang ? ' (with hreflang)' : ''} - ${result.issues.length} issues`
        );
      } else {
        this.issues.push({
          sitemap: sitemapName,
          type: 'error',
          category: 'structure',
          message: `Sitemap has neither urlset nor sitemapindex`,
        });
      }
    } catch (error) {
      this.issues.push({
        sitemap: url,
        type: 'error',
        category: 'structure',
        message: `Failed to parse sitemap: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Generate validation report
   */
  private generateReport(): IValidationReport {
    // Group issues by category
    const issuesByCategory: Record<string, IValidationIssue[]> = {};
    for (const issue of this.issues) {
      if (!issuesByCategory[issue.category]) {
        issuesByCategory[issue.category] = [];
      }
      issuesByCategory[issue.category].push(issue);
    }

    // Calculate summary
    const errors = this.issues.filter(i => i.type === 'error').length;
    const warnings = this.issues.filter(i => i.type === 'warning').length;
    const byCategory: Record<string, number> = {};
    for (const category of Object.keys(issuesByCategory)) {
      byCategory[category] = issuesByCategory[category].length;
    }

    return {
      baseUrl: this.baseUrl,
      totalSitemaps: this.results.length,
      totalUrls: this.results.reduce((sum, r) => sum + r.totalUrls, 0),
      results: this.results,
      issuesByCategory,
      summary: {
        totalIssues: this.issues.length,
        errors,
        warnings,
        byCategory,
      },
    };
  }

  /**
   * Print formatted report
   */
  private printReport(report: IValidationReport): void {
    console.log('\n' + '='.repeat(70));
    console.log('              SITEMAP STRUCTURE VALIDATION REPORT');
    console.log('='.repeat(70));
    console.log(`\nBase URL: ${report.baseUrl}`);
    console.log(`Sitemaps processed: ${report.totalSitemaps}`);
    console.log(`Total URLs: ${report.totalUrls}\n`);

    console.log('─'.repeat(70));
    console.log('SUMMARY');
    console.log('─'.repeat(70));
    console.log(`Total Issues: ${report.summary.totalIssues}`);
    console.log(`❌ Errors: ${report.summary.errors}`);
    console.log(`⚠️  Warnings: ${report.summary.warnings}\n`);

    if (Object.keys(report.summary.byCategory).length > 0) {
      console.log('Issues by Category:');
      for (const [category, count] of Object.entries(report.summary.byCategory)) {
        console.log(`  ${category}: ${count}`);
      }
      console.log();
    }

    // Print results by sitemap
    if (report.results.length > 0) {
      console.log('─'.repeat(70));
      console.log('SITEMAP DETAILS');
      console.log('─'.repeat(70));

      for (const result of report.results) {
        const status =
          result.issues.length === 0
            ? '✅ PASS'
            : result.issues.some(i => i.type === 'error')
              ? '❌ FAIL'
              : '⚠️  WARN';
        console.log(
          `\n${status} ${result.sitemap} (${result.totalUrls} URLs, ${result.issues.length} issues)`
        );

        // Print issues for this sitemap
        if (result.issues.length > 0) {
          for (const issue of result.issues) {
            const icon = issue.type === 'error' ? '❌' : '⚠️ ';
            console.log(`  ${icon}[${issue.category.toUpperCase()}] ${issue.message}`);
            if (issue.url) {
              console.log(`     URL: ${issue.url}`);
            }
            if (issue.expected) {
              console.log(`     Expected: ${issue.expected}`);
            }
            if (issue.actual) {
              console.log(`     Actual: ${issue.actual}`);
            }
          }
        }
      }
      console.log();
    }

    // Print issues not tied to specific sitemaps
    const otherIssues = this.issues.filter(i => !report.results.some(r => r.issues.includes(i)));
    if (otherIssues.length > 0) {
      console.log('─'.repeat(70));
      console.log('OTHER ISSUES');
      console.log('─'.repeat(70));
      for (const issue of otherIssues) {
        const icon = issue.type === 'error' ? '❌' : '⚠️ ';
        console.log(`${icon}[${issue.category.toUpperCase()}] ${issue.message}`);
        if (issue.url) {
          console.log(`   URL: ${issue.url}`);
        }
        if (issue.expected) {
          console.log(`   Expected: ${issue.expected}`);
        }
        if (issue.actual) {
          console.log(`   Actual: ${issue.actual}`);
        }
      }
      console.log();
    }

    console.log('='.repeat(70) + '\n');

    if (report.summary.errors === 0 && report.summary.warnings === 0) {
      console.log('🎉 All sitemaps passed validation!\n');
    } else if (report.summary.errors === 0) {
      console.log(`⚠️  Validation passed with ${report.summary.warnings} warning(s)\n`);
    } else {
      console.log(`❌ Validation failed with ${report.summary.errors} error(s)\n`);
    }
  }

  /**
   * Main validation process
   */
  public async validate(): Promise<IValidationReport> {
    console.log(`\n🔍 Starting sitemap structure validation for: ${this.baseUrl}`);
    console.log(`⏰ Timeout per request: ${this.timeout}ms\n`);

    const sitemapIndexUrl = `${this.baseUrl}/sitemap.xml`;

    try {
      await this.processSitemap(sitemapIndexUrl);
    } catch (error) {
      console.error(
        `\n❌ Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }

    const report = this.generateReport();
    this.printReport(report);

    return report;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const baseUrlArg = args.find(arg => arg.startsWith('--base-url='));
  const portArg = args.find(arg => arg.startsWith('--port='));

  const baseUrl = baseUrlArg
    ? baseUrlArg.split('=')[1]
    : portArg
      ? `http://localhost:${portArg.split('=')[1]}`
      : 'http://localhost:3000';

  const validator = new SitemapStructureValidator(baseUrl);

  try {
    const report = await validator.validate();

    // Exit with error code if there are errors
    if (report.summary.errors > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(
      `\n❌ Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
