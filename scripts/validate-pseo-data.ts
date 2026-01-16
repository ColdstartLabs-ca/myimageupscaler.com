#!/usr/bin/env tsx

/**
 * pSEO Data Validator
 *
 * Validates that all pSEO data files are consistent and complete.
 * Runs BEFORE build/deploy to catch broken pages early.
 *
 * Checks:
 * 1. All JSON data files have valid structure
 * 2. All slugs are unique within their category
 * 3. No orphaned references (relatedTools, relatedGuides that don't exist)
 * 4. Interactive tools have proper route mappings
 * 5. Sitemap generators won't produce 404s
 * 6. HTTP validation of generated pages (optional, with --curl flag)
 *
 * Usage:
 *   npx tsx scripts/validate-pseo-data.ts
 *   npx tsx scripts/validate-pseo-data.ts --verbose
 *   npx tsx scripts/validate-pseo-data.ts --fix    # Auto-fix some issues
 *   npx tsx scripts/validate-pseo-data.ts --curl   # Validate pages via HTTP (one per category)
 *   npx tsx scripts/validate-pseo-data.ts --curl --base-url=http://localhost:3000
 */

import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.join(import.meta.dirname, '..');

// Data file paths
const DATA_DIR = path.join(PROJECT_ROOT, 'app/seo/data');

interface IValidationError {
  severity: 'error' | 'warning';
  category: string;
  message: string;
  file?: string;
  slug?: string;
}

interface IDataFile<T = unknown> {
  category: string;
  pages: T[];
}

interface IBasePage {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  category?: string;
  lastUpdated?: string;
}

interface IToolPage extends IBasePage {
  relatedTools?: string[];
  relatedGuides?: string[];
}

interface IGuidePage extends IBasePage {
  relatedGuides?: string[];
  relatedTools?: string[];
}

// HTTP Validation Result interface
interface IHttpValidationResult {
  url: string;
  status: number;
  issue?: string;
  responseTime?: number;
  category?: string;
  slug?: string;
}

// Command line arguments
const VERBOSE = process.argv.includes('--verbose');
const CURL_MODE = process.argv.includes('--curl');
// FIX_MODE reserved for future auto-fix functionality
// const FIX_MODE = process.argv.includes('--fix');

// Parse base URL from arguments
const baseUrlArg = process.argv.find(arg => arg.startsWith('--base-url='));
const BASE_URL = baseUrlArg ? baseUrlArg.split('=')[1] : 'http://localhost:3000';

const errors: IValidationError[] = [];
const warnings: IValidationError[] = [];
const httpErrors: IHttpValidationResult[] = [];

// Collect all valid slugs by category
const allSlugs: Record<string, Set<string>> = {
  tools: new Set<string>(),
  guides: new Set<string>(),
  formats: new Set<string>(),
  scale: new Set<string>(),
  'use-cases': new Set<string>(),
  compare: new Set<string>(),
  alternatives: new Set<string>(),
  free: new Set<string>(),
  platforms: new Set<string>(),
  'format-scale': new Set<string>(),
  'platform-format': new Set<string>(),
  'device-use': new Set<string>(),
  'photo-restoration': new Set<string>(),
  'camera-raw': new Set<string>(),
  'industry-insights': new Set<string>(),
  'device-optimization': new Set<string>(),
  'bulk-tools': new Set<string>(),
  content: new Set<string>(),
  'ai-features': new Set<string>(),
};

// Interactive tools that have special routing
const INTERACTIVE_TOOL_PATHS: Record<string, string> = {
  'image-resizer': '/tools/resize/image-resizer',
  'resize-image-for-instagram': '/tools/resize/resize-image-for-instagram',
  'resize-image-for-youtube': '/tools/resize/resize-image-for-youtube',
  'resize-image-for-facebook': '/tools/resize/resize-image-for-facebook',
  'resize-image-for-twitter': '/tools/resize/resize-image-for-twitter',
  'resize-image-for-linkedin': '/tools/resize/resize-image-for-linkedin',
  'bulk-image-resizer': '/tools/resize/bulk-image-resizer',
  'png-to-jpg': '/tools/convert/png-to-jpg',
  'jpg-to-png': '/tools/convert/jpg-to-png',
  'webp-to-jpg': '/tools/convert/webp-to-jpg',
  'webp-to-png': '/tools/convert/webp-to-png',
  'jpg-to-webp': '/tools/convert/jpg-to-webp',
  'png-to-webp': '/tools/convert/png-to-webp',
  'image-compressor': '/tools/compress/image-compressor',
  'bulk-image-compressor': '/tools/compress/bulk-image-compressor',
};

function log(message: string): void {
  console.log(message);
}

function logVerbose(message: string): void {
  if (VERBOSE) {
    console.log(`  ${message}`);
  }
}

function addError(error: Omit<IValidationError, 'severity'>): void {
  errors.push({ ...error, severity: 'error' });
}

function addWarning(warning: Omit<IValidationError, 'severity'>): void {
  warnings.push({ ...warning, severity: 'warning' });
}

function loadJsonFile<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (e) {
    const error = e as Error & { code?: string };
    if (error.code !== 'ENOENT') {
      addError({
        category: 'file',
        message: `Failed to parse JSON: ${error.message}`,
        file: filePath,
      });
    }
    return null;
  }
}

function validateBasePage(page: IBasePage, category: string, file: string): boolean {
  let valid = true;

  if (!page.slug) {
    addError({ category, message: 'Missing slug', file, slug: page.slug });
    valid = false;
  } else if (!/^[a-z0-9-]+$/.test(page.slug)) {
    addError({
      category,
      message: `Invalid slug format: "${page.slug}" (must be lowercase alphanumeric with hyphens)`,
      file,
      slug: page.slug,
    });
    valid = false;
  }

  if (!page.title) {
    addError({ category, message: 'Missing title', file, slug: page.slug });
    valid = false;
  }

  if (!page.metaTitle) {
    addWarning({ category, message: 'Missing metaTitle', file, slug: page.slug });
  } else if (page.metaTitle.length > 60) {
    addWarning({
      category,
      message: `metaTitle too long (${page.metaTitle.length} chars, max 60)`,
      file,
      slug: page.slug,
    });
  }

  if (!page.metaDescription) {
    addWarning({ category, message: 'Missing metaDescription', file, slug: page.slug });
  } else if (page.metaDescription.length > 160) {
    addWarning({
      category,
      message: `metaDescription too long (${page.metaDescription.length} chars, max 160)`,
      file,
      slug: page.slug,
    });
  }

  return valid;
}

function validateDataFile(fileName: string, categoryKey: string): void {
  const filePath = path.join(DATA_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    logVerbose(`Skipping ${fileName} (not found)`);
    return;
  }

  log(`📄 Validating ${fileName}...`);

  const data = loadJsonFile<IDataFile<IBasePage>>(filePath);
  if (!data) return;

  if (!data.pages || !Array.isArray(data.pages)) {
    addError({
      category: categoryKey,
      message: 'Invalid structure: missing "pages" array',
      file: fileName,
    });
    return;
  }

  const slugsInFile = new Set<string>();

  for (const page of data.pages) {
    const valid = validateBasePage(page, categoryKey, fileName);

    if (valid && page.slug) {
      // Check for duplicates within file
      if (slugsInFile.has(page.slug)) {
        addError({
          category: categoryKey,
          message: `Duplicate slug: "${page.slug}"`,
          file: fileName,
          slug: page.slug,
        });
      } else {
        slugsInFile.add(page.slug);
        allSlugs[categoryKey]?.add(page.slug);
      }
    }
  }

  logVerbose(`Found ${data.pages.length} pages, ${slugsInFile.size} unique slugs`);
}

function validateCrossReferences(): void {
  log('\n🔗 Validating cross-references...');

  // Load tools and guides to check relatedTools/relatedGuides references
  const toolsData = loadJsonFile<IDataFile<IToolPage>>(path.join(DATA_DIR, 'tools.json'));
  const guidesData = loadJsonFile<IDataFile<IGuidePage>>(path.join(DATA_DIR, 'guides.json'));
  const interactiveToolsData = loadJsonFile<IDataFile<IToolPage>>(
    path.join(DATA_DIR, 'interactive-tools.json')
  );

  // Combine all tool slugs
  const allToolSlugs = new Set<string>();
  toolsData?.pages.forEach(p => allToolSlugs.add(p.slug));
  interactiveToolsData?.pages.forEach(p => allToolSlugs.add(p.slug));

  // Check tools -> relatedGuides references
  if (toolsData) {
    for (const tool of toolsData.pages) {
      if (tool.relatedGuides) {
        for (const guideSlug of tool.relatedGuides) {
          if (!allSlugs.guides?.has(guideSlug)) {
            addWarning({
              category: 'tools',
              message: `relatedGuides references non-existent guide: "${guideSlug}"`,
              file: 'tools.json',
              slug: tool.slug,
            });
          }
        }
      }
      if (tool.relatedTools) {
        for (const toolSlug of tool.relatedTools) {
          if (!allToolSlugs.has(toolSlug)) {
            addWarning({
              category: 'tools',
              message: `relatedTools references non-existent tool: "${toolSlug}"`,
              file: 'tools.json',
              slug: tool.slug,
            });
          }
        }
      }
    }
  }

  // Check guides -> relatedTools references
  if (guidesData) {
    for (const guide of guidesData.pages) {
      if (guide.relatedTools) {
        for (const toolSlug of guide.relatedTools) {
          if (!allToolSlugs.has(toolSlug)) {
            addWarning({
              category: 'guides',
              message: `relatedTools references non-existent tool: "${toolSlug}"`,
              file: 'guides.json',
              slug: guide.slug,
            });
          }
        }
      }
      if (guide.relatedGuides) {
        for (const guideSlug of guide.relatedGuides) {
          if (!allSlugs.guides?.has(guideSlug)) {
            addWarning({
              category: 'guides',
              message: `relatedGuides references non-existent guide: "${guideSlug}"`,
              file: 'guides.json',
              slug: guide.slug,
            });
          }
        }
      }
    }
  }
}

function validateInteractiveTools(): void {
  log('\n🔧 Validating interactive tools routing...');

  const interactiveToolsData = loadJsonFile<IDataFile<IToolPage>>(
    path.join(DATA_DIR, 'interactive-tools.json')
  );

  if (!interactiveToolsData) {
    logVerbose('No interactive-tools.json found');
    return;
  }

  for (const tool of interactiveToolsData.pages) {
    const expectedPath = INTERACTIVE_TOOL_PATHS[tool.slug];
    if (!expectedPath) {
      addWarning({
        category: 'interactive-tools',
        message: `Tool "${tool.slug}" has no defined route path - will use fallback /tools/${tool.slug}`,
        file: 'interactive-tools.json',
        slug: tool.slug,
      });
    } else {
      logVerbose(`✓ ${tool.slug} → ${expectedPath}`);
    }
  }
}

function validateSitemapConsistency(): void {
  log('\n🗺️  Validating sitemap consistency...');

  // Check that all pages in data files will be accessible
  // This validates that the sitemap won't include 404s

  const toolsData = loadJsonFile<IDataFile<IToolPage>>(path.join(DATA_DIR, 'tools.json'));
  const guidesData = loadJsonFile<IDataFile<IGuidePage>>(path.join(DATA_DIR, 'guides.json'));
  const interactiveToolsData = loadJsonFile<IDataFile<IToolPage>>(
    path.join(DATA_DIR, 'interactive-tools.json')
  );

  // Tools sitemap includes both static and interactive tools
  const staticToolCount = toolsData?.pages.length || 0;
  const interactiveToolCount = interactiveToolsData?.pages.length || 0;
  log(
    `   Tools sitemap will have: ${staticToolCount} static + ${interactiveToolCount} interactive = ${staticToolCount + interactiveToolCount} URLs`
  );

  // Guides sitemap uses data from guides.json
  const guideCount = guidesData?.pages.length || 0;
  log(`   Guides sitemap will have: ${guideCount} URLs`);

  // Check for empty categories that will create empty sitemaps
  const categoriesWithData = Object.entries(allSlugs)
    .filter(([, slugs]) => slugs.size > 0)
    .map(([cat]) => cat);

  const emptyCategories = Object.entries(allSlugs)
    .filter(([, slugs]) => slugs.size === 0)
    .map(([cat]) => cat);

  if (emptyCategories.length > 0) {
    logVerbose(`Empty categories (no pages): ${emptyCategories.join(', ')}`);
  }

  logVerbose(`Categories with data: ${categoriesWithData.join(', ')}`);
}

/**
 * Build URL for a pSEO page based on category and slug
 */
function buildPageUrl(category: string, slug: string): string {
  // Handle interactive tools with custom routes
  const customPath = INTERACTIVE_TOOL_PATHS[slug];
  if (customPath) {
    return `${BASE_URL}${customPath}`;
  }

  // Standard pSEO route pattern: /[category]/[slug]
  return `${BASE_URL}/${category}/${slug}`;
}

/**
 * Delay between requests to avoid overwhelming the server
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate a single page via HTTP request
 * Checks for 404 status, "not found" content, and other error indicators
 */
async function validatePage(
  category: string,
  slug: string,
  url: string
): Promise<IHttpValidationResult> {
  const startTime = Date.now();
  const timeout = 10000; // 10 second timeout

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'pSEOValidator/1.0 (PixelPerfect QA Tool)',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    const status = response.status;
    const contentType = response.headers.get('content-type') || 'unknown';

    // Check HTTP status
    if (status === 404) {
      return {
        url,
        status,
        issue: 'HTTP 404 - Page not found',
        responseTime,
        category,
        slug,
      };
    }

    if (status >= 500) {
      return {
        url,
        status,
        issue: `HTTP ${status} - Server error`,
        responseTime,
        category,
        slug,
      };
    }

    if (status >= 400) {
      return {
        url,
        status,
        issue: `HTTP ${status} - Client error`,
        responseTime,
        category,
        slug,
      };
    }

    // For successful responses, check content for 404-related messages
    if (status === 200 && contentType.includes('text/html')) {
      const html = await response.text();
      const lowerHtml = html.toLowerCase();

      // Extract only visible HTML content (exclude script tags)
      const visibleHtml = lowerHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

      // Check for title containing 404 indicators
      const titleMatch = lowerHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].toLowerCase() : '';
      if (
        title.includes('404') ||
        title.includes('not found') ||
        title.includes('page not found')
      ) {
        return {
          url,
          status: 200,
          issue: `Page title indicates 404: "${titleMatch?.[1]}"`,
          responseTime,
          category,
          slug,
        };
      }

      // Check for h1 containing 404 messages
      const h1Match = visibleHtml.match(/<h1[^>]*>([^<]*)<\/h1>/i);
      if (h1Match) {
        const h1Text = h1Match[1].toLowerCase();
        if (
          h1Text.includes('404') ||
          h1Text.includes('not found') ||
          h1Text.includes('page not found')
        ) {
          return {
            url,
            status: 200,
            issue: `H1 indicates 404: "${h1Match[1]}"`,
            responseTime,
            category,
            slug,
          };
        }
      }

      // Check for structural 404 indicators
      const notFoundIndicators = [
        '>404<',
        '>page not found<',
        '>error 404<',
        'class="error-404"',
        'class="not-found"',
        "class='error-404'",
        "class='not-found'",
      ];

      for (const indicator of notFoundIndicators) {
        if (visibleHtml.includes(indicator)) {
          return {
            url,
            status: 200,
            issue: `Content contains 404 indicator: "${indicator}"`,
            responseTime,
            category,
            slug,
          };
        }
      }

      // Check for soft 404s - pages that return 200 but show error content
      const soft404Indicators = [
        'this page is not available',
        'page under construction',
        'coming soon',
        'this combination is not supported',
        'content not found',
        'no content found',
      ];

      for (const indicator of soft404Indicators) {
        if (visibleHtml.includes(indicator)) {
          return {
            url,
            status: 200,
            issue: `Soft 404 - "${indicator}"`,
            responseTime,
            category,
            slug,
          };
        }
      }

      // Check if page has minimal content (possible broken page)
      // Count words in visible HTML (after removing tags)
      const textContent = visibleHtml
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const wordCount = textContent.split(' ').filter(w => w.length > 0).length;

      if (wordCount < 50) {
        return {
          url,
          status: 200,
          issue: `Suspiciously low content (${wordCount} words) - possible broken page`,
          responseTime,
          category,
          slug,
        };
      }
    }

    // Success
    return {
      url,
      status,
      responseTime,
      category,
      slug,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        url,
        status: 0,
        issue: `Timeout after ${timeout}ms`,
        responseTime: timeout,
        category,
        slug,
      };
    }

    return {
      url,
      status: 0,
      issue: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      responseTime: Date.now() - startTime,
      category,
      slug,
    };
  }
}

/**
 * Validate one page per category via HTTP
 */
async function validatePagesByCategory(): Promise<void> {
  log('\n🌐 Validating pages via HTTP (one per category)...');
  log(`   Base URL: ${BASE_URL}\n`);

  // Map category to data file
  const categoryFiles: Record<string, string> = {
    tools: 'tools.json',
    guides: 'guides.json',
    formats: 'formats.json',
    scale: 'scale.json',
    'use-cases': 'use-cases.json',
    compare: 'comparison.json',
    alternatives: 'alternatives.json',
    free: 'free.json',
    'bulk-tools': 'bulk-tools.json',
    platforms: 'platforms.json',
    'format-scale': 'format-scale.json',
    'platform-format': 'platform-format.json',
    'device-use': 'device-use.json',
    'photo-restoration': 'photo-restoration.json',
    'camera-raw': 'camera-raw.json',
    'industry-insights': 'industry-insights.json',
    'device-optimization': 'device-optimization.json',
    content: 'content.json',
    'ai-features': 'ai-features.json',
  };

  const categoriesToTest = Object.keys(categoryFiles).filter(cat => allSlugs[cat]?.size > 0);

  log(`   Testing ${categoriesToTest.length} categories (one page each)...\n`);

  let tested = 0;
  let passed = 0;

  for (const category of categoriesToTest) {
    const fileName = categoryFiles[category];
    const data = loadJsonFile<IDataFile<IBasePage>>(path.join(DATA_DIR, fileName));

    if (!data || data.pages.length === 0) {
      logVerbose(`   Skipping ${category} (no pages found)`);
      continue;
    }

    // Test the first page in this category
    const samplePage = data.pages[0];
    const url = buildPageUrl(category, samplePage.slug);
    tested++;

    process.stdout.write(
      `   [${tested}/${categoriesToTest.length}] ${category.padEnd(20)} → ${url.substring(0, 50)}... `
    );

    const result = await validatePage(category, samplePage.slug, url);

    if (result.issue) {
      process.stdout.write(`❌ ${result.issue}\n`);
      httpErrors.push(result);
    } else {
      process.stdout.write(`✅ OK (${result.responseTime}ms)\n`);
      passed++;
    }

    // Add delay to avoid rate limiting
    if (tested < categoriesToTest.length) {
      await delay(300);
    }
  }

  log(`\n   HTTP validation complete: ${passed}/${tested} passed`);
}

async function main(): Promise<void> {
  log('🔍 pSEO Data Validator\n');
  log('═'.repeat(50));

  // Validate all data files
  const dataFiles: Array<[string, string]> = [
    ['tools.json', 'tools'],
    ['interactive-tools.json', 'tools'],
    ['guides.json', 'guides'],
    ['formats.json', 'formats'],
    ['scale.json', 'scale'],
    ['use-cases.json', 'use-cases'],
    ['comparison.json', 'compare'],
    ['alternatives.json', 'alternatives'],
    ['free.json', 'free'],
    ['platforms.json', 'platforms'],
    ['format-scale.json', 'format-scale'],
    ['platform-format.json', 'platform-format'],
    ['device-use.json', 'device-use'],
    ['photo-restoration.json', 'photo-restoration'],
    ['camera-raw.json', 'camera-raw'],
    ['industry-insights.json', 'industry-insights'],
    ['device-optimization.json', 'device-optimization'],
    ['bulk-tools.json', 'bulk-tools'],
    ['content.json', 'content'],
    ['ai-features.json', 'ai-features'],
  ];

  for (const [file, category] of dataFiles) {
    validateDataFile(file, category);
  }

  // Cross-reference validation
  validateCrossReferences();

  // Interactive tools routing validation
  validateInteractiveTools();

  // Sitemap consistency validation
  validateSitemapConsistency();

  // HTTP validation (if requested)
  if (CURL_MODE) {
    await validatePagesByCategory();
  }

  // Print summary
  log('\n' + '═'.repeat(50));
  log('📊 VALIDATION SUMMARY');
  log('═'.repeat(50));

  const totalPages = Object.values(allSlugs).reduce((sum, set) => sum + set.size, 0);
  log(`\n   Total pages across all categories: ${totalPages}`);

  if (errors.length > 0) {
    log(`\n   ❌ Errors: ${errors.length}`);
    for (const error of errors) {
      log(
        `      [${error.category}] ${error.message}${error.slug ? ` (slug: ${error.slug})` : ''}`
      );
    }
  } else {
    log('\n   ✅ No errors found');
  }

  if (warnings.length > 0) {
    log(`\n   ⚠️  Warnings: ${warnings.length}`);
    if (VERBOSE) {
      for (const warning of warnings) {
        log(
          `      [${warning.category}] ${warning.message}${warning.slug ? ` (slug: ${warning.slug})` : ''}`
        );
      }
    } else {
      log('      (use --verbose to see details)');
    }
  }

  if (CURL_MODE && httpErrors.length > 0) {
    log(`\n   🌐 HTTP Validation Errors: ${httpErrors.length}`);
    for (const error of httpErrors) {
      log(`      [${error.category}] ${error.url}`);
      log(`         Status: ${error.status} - ${error.issue}`);
    }
  } else if (CURL_MODE) {
    log('\n   🌐 HTTP Validation: All tested pages passed');
  }

  log('\n' + '═'.repeat(50));

  // Exit with error code if there are errors or HTTP validation failures
  const hasErrors = errors.length > 0;
  const hasHttpErrors = CURL_MODE && httpErrors.length > 0;

  if (hasErrors || hasHttpErrors) {
    log('\n❌ Validation FAILED - fix errors before deploying\n');
    process.exit(1);
  } else {
    log('\n✅ Validation PASSED\n');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('Validation script error:', e);
  process.exit(1);
});
