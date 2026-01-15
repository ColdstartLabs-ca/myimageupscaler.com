#!/usr/bin/env ts-node
/**
 * Translation Checker Script
 *
 * Checks for missing translations across locales by comparing:
 * 1. Missing translation files (e.g., pt has no alternatives.json)
 * 2. Missing translation keys within files
 * 3. Untranslated content (values identical to English reference)
 * 4. pSEO data files without i18n integration (e.g., interactive-tools.json)
 *
 * Usage:
 *   npx ts-node scripts/check-translations.ts [options]
 *
 * Options:
 *   --namespace <name>   Check specific namespace (e.g., common, auth)
 *   --locale <code>      Check specific locale (e.g., pt, de)
 *   --keys-only          Only check for missing keys, not files
 *   --files-only         Only check for missing files, not keys
 *   --check-pseo         Check pSEO data files for i18n coverage
 *   --json               Output as JSON
 *   --verbose            Show all checked items, not just missing ones
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const PSEO_DATA_DIR = path.join(__dirname, '..', 'app', 'seo', 'data');
const REFERENCE_LOCALE = 'en'; // English is the source of truth
const EXCLUDED_LOCALES: string[] = []; // Locales to exclude from checks

// Supported locales
type Locale = 'en' | 'es' | 'pt' | 'de' | 'fr' | 'it' | 'ja';

// pSEO data files that are known to NOT need translations (technical/config files)
const PSEO_EXCLUDED_FILES = new Set([
  'ai-features', // Technical config
  'content', // Internal content management
]);

interface IPSEODataFile {
  name: string;
  pageCount: number;
  hasTranslation: boolean;
  translationNamespace?: string;
  sampleContent?: string[];
  hasStaticImport?: boolean;
  hasGetTranslations?: boolean;
  architecturalIssue?: 'static-import' | 'no-i18n';
  localesWithTranslations?: Locale[];
}

interface IInvalidJsonFile {
  locale: string;
  namespace: string;
  error: string;
}

interface IICUFormatError {
  locale: string;
  namespace: string;
  key: string;
  value: string;
  issue: string;
}

interface ITranslationReport {
  summary: {
    totalLocales: number;
    totalNamespaces: number;
    invalidJsonFiles: number;
    icuFormatErrors: number;
    missingFiles: number;
    missingKeys: number;
    untranslatedFiles: number;
    untranslatedKeys: number;
    pseoWithoutI18n: number;
  };
  invalidJsonFiles: IInvalidJsonFile[];
  icuFormatErrors: IICUFormatError[];
  missingFiles: Array<{
    locale: string;
    namespace: string;
  }>;
  missingKeys: Array<{
    locale: string;
    namespace: string;
    keys: string[];
  }>;
  untranslatedContent: Array<{
    locale: string;
    namespace: string;
    keys: string[];
    totalKeys: number;
    percentage: number;
  }>;
  extraFiles: Array<{
    locale: string;
    namespace: string;
  }>;
  extraKeys: Array<{
    locale: string;
    namespace: string;
    keys: string[];
  }>;
  pseoWithoutI18n: IPSEODataFile[];
}

interface ICLIOptions {
  namespace?: string;
  locale?: string;
  keysOnly: boolean;
  filesOnly: boolean;
  checkPseo: boolean;
  icuOnly: boolean;
  json: boolean;
  verbose: boolean;
  debug: boolean;
}

function parseArgs(): ICLIOptions {
  const args = process.argv.slice(2);
  const options: ICLIOptions = {
    keysOnly: false,
    filesOnly: false,
    checkPseo: true, // Check pSEO by default
    icuOnly: false,
    json: false,
    verbose: false,
    debug: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--namespace':
        options.namespace = args[++i];
        break;
      case '--locale':
        options.locale = args[++i];
        break;
      case '--keys-only':
        options.keysOnly = true;
        break;
      case '--files-only':
        options.filesOnly = true;
        break;
      case '--check-pseo':
        options.checkPseo = true;
        break;
      case '--no-pseo':
        options.checkPseo = false;
        break;
      case '--icu-only':
        options.icuOnly = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--debug':
        options.debug = true;
        options.verbose = true; // Debug implies verbose
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Translation Checker - Find missing translations across locales

Usage:
  npx ts-node scripts/check-translations.ts [options]

Options:
  --namespace <name>   Check specific namespace (e.g., common, auth, pricing)
  --locale <code>      Check specific locale (e.g., pt, de, fr)
  --keys-only          Only check for missing keys, not files
  --files-only         Only check for missing files, not keys
  --icu-only           Only check ICU message format (double braces, unbalanced braces)
  --check-pseo         Check pSEO data files for i18n coverage (default: on)
  --no-pseo            Skip pSEO data file checks
  --json               Output as JSON (useful for CI/CD)
  --verbose            Show all checked items, not just missing ones
  --debug              Show detailed debug info (file structure, key counts, etc.)
  --help               Show this help message

Examples:
  # Check all translations (including pSEO data files)
  npx ts-node scripts/check-translations.ts

  # Check only Portuguese translations
  npx ts-node scripts/check-translations.ts --locale pt

  # Check only the pricing namespace
  npx ts-node scripts/check-translations.ts --namespace pricing

  # Check Portuguese pricing translations
  npx ts-node scripts/check-translations.ts --locale pt --namespace pricing

  # Output as JSON for CI/CD
  npx ts-node scripts/check-translations.ts --json

  # Skip pSEO data file checks
  npx ts-node scripts/check-translations.ts --no-pseo
`);
}

function getLocales(): string[] {
  return fs
    .readdirSync(LOCALES_DIR)
    .filter(item => {
      const itemPath = path.join(LOCALES_DIR, item);
      return fs.statSync(itemPath).isDirectory();
    })
    .filter(locale => !EXCLUDED_LOCALES.includes(locale))
    .sort();
}

function getNamespaces(locale: string): string[] {
  const localeDir = path.join(LOCALES_DIR, locale);
  if (!fs.existsSync(localeDir)) return [];

  return fs
    .readdirSync(localeDir)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''))
    .sort();
}

interface ILoadResult {
  data: Record<string, unknown> | null;
  error?: string;
}

function loadTranslation(locale: string, namespace: string): ILoadResult {
  const filePath = path.join(LOCALES_DIR, locale, `${namespace}.json`);
  if (!fs.existsSync(filePath)) return { data: null };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { data: JSON.parse(content) };
  } catch (error) {
    const errorMessage = error instanceof SyntaxError ? error.message : 'Unknown parsing error';
    return { data: null, error: errorMessage };
  }
}

function detectArchitecturalIssues(dataFile: string): {
  hasStaticImport: boolean;
  hasGetTranslations: boolean;
  architecturalIssue?: 'static-import' | 'no-i18n';
} {
  const APP_DIR = path.join(__dirname, '..', 'app');
  let hasStaticImport = false;
  let hasGetTranslations = false;

  // Find all locale directories that might use this pSEO data
  const localeDirs = fs
    .readdirSync(APP_DIR, { withFileTypes: true })
    .filter(
      dirent => dirent.isDirectory() && !dirent.name.startsWith('.') && dirent.name !== '[locale]'
    )
    .map(dirent => dirent.name);

  // Also check [locale] directory
  const localeDir = path.join(APP_DIR, '[locale]');
  if (fs.existsSync(localeDir)) {
    const localePathDirs = fs
      .readdirSync(localeDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    localeDirs.push(...localePathDirs);
  }

  // Check for static imports and getTranslations usage
  for (const localeDir of localeDirs) {
    const searchDir = path.join(APP_DIR, localeDir);

    // Find all .tsx/.ts files in this directory
    const tsFiles = findTsFiles(searchDir);

    for (const file of tsFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');

        // Check for static import of this pSEO data file
        const staticImportPattern = new RegExp(
          `import.*from\\s+['"]@/app/seo/data/${dataFile}\\.json['"]`,
          'g'
        );
        if (staticImportPattern.test(content)) {
          hasStaticImport = true;
        }

        // Check for getTranslations usage
        const getTranslationsPattern = new RegExp(`getTranslations\\(['"]${dataFile}['"]`, 'g');
        if (getTranslationsPattern.test(content)) {
          hasGetTranslations = true;
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
  }

  // Determine architectural issue
  let architecturalIssue: 'static-import' | 'no-i18n' | undefined;
  if (hasStaticImport && !hasGetTranslations) {
    architecturalIssue = 'static-import';
  } else if (!hasStaticImport && !hasGetTranslations) {
    architecturalIssue = 'no-i18n';
  }

  return { hasStaticImport, hasGetTranslations, architecturalIssue };
}

function findTsFiles(dir: string): string[] {
  const files: string[] = [];

  function search(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Skip node_modules and other common directories
          if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
            continue;
          }
          search(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories that can't be accessed (e.g., non-existent auth directory)
    }
  }

  search(dir);
  return files;
}

function getPSEODataFiles(): string[] {
  if (!fs.existsSync(PSEO_DATA_DIR)) return [];

  return fs
    .readdirSync(PSEO_DATA_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''))
    .filter(name => !PSEO_EXCLUDED_FILES.has(name))
    .sort();
}

function loadPSEOData(dataFile: string): Record<string, unknown> | null {
  const filePath = path.join(PSEO_DATA_DIR, `${dataFile}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

function checkPSEODataFiles(translationNamespaces: string[]): IPSEODataFile[] {
  const pseoFiles = getPSEODataFiles();
  const missingI18n: IPSEODataFile[] = [];

  for (const pseoFile of pseoFiles) {
    const data = loadPSEOData(pseoFile);
    if (!data) continue;

    // Check if there's a corresponding translation file in ANY non-English locale
    // We check all locales (not just English) to see if translations exist
    const allLocales = getLocales();
    const localesWithTranslations: Locale[] = [];

    for (const locale of allLocales) {
      if (locale === REFERENCE_LOCALE) continue;
      const localeNamespaces = getNamespaces(locale);
      if (localeNamespaces.includes(pseoFile)) {
        localesWithTranslations.push(locale as Locale);
      }
    }

    const hasTranslationInAnyLocale = localesWithTranslations.length > 0;
    const hasTranslation = hasTranslationInAnyLocale || translationNamespaces.includes(pseoFile);

    // Get page count if it's a pSEO data file with pages array
    const pages = data.pages as Array<Record<string, unknown>> | undefined;
    const pageCount = Array.isArray(pages) ? pages.length : 0;

    // Extract sample content (titles from first few pages)
    let sampleContent: string[] = [];
    if (Array.isArray(pages) && pages.length > 0) {
      sampleContent = pages
        .slice(0, 3)
        .map(p => (p.title as string) || (p.slug as string) || 'Unknown')
        .filter(Boolean);
    }

    // Detect architectural issues
    const architectural = detectArchitecturalIssues(pseoFile);

    // Create report entry
    const reportEntry: IPSEODataFile = {
      name: pseoFile,
      pageCount,
      hasTranslation,
      sampleContent,
      hasStaticImport: architectural.hasStaticImport,
      hasGetTranslations: architectural.hasGetTranslations,
      architecturalIssue: architectural.architecturalIssue,
      localesWithTranslations,
    };

    // If no translation exists, this is a gap
    // Static imports in app/(pseo)/ are OK for English - the localized versions
    // in app/[locale]/(pseo)/ use locale-aware loading
    if (!hasTranslation && pageCount > 0) {
      missingI18n.push(reportEntry);
    }
    // Don't flag static-import as an issue if translations exist
    // The architecture correctly uses static imports for English (app/(pseo)/)
    // and locale-aware loading for other locales (app/[locale]/(pseo)/)
  }

  return missingI18n;
}

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>();

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nestedKeys = flattenKeys(value as Record<string, unknown>, fullKey);
      nestedKeys.forEach(k => keys.add(k));
    } else if (Array.isArray(value)) {
      // Handle arrays by checking each element's keys with index
      // Add the array key itself
      keys.add(fullKey);
      // Then recurse into array elements with index in key path
      value.forEach((item, index) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const itemKeys = flattenKeys(item as Record<string, unknown>, `${fullKey}[${index}]`);
          itemKeys.forEach(k => keys.add(k));
        }
      });
    } else {
      keys.add(fullKey);
    }
  }

  return keys;
}

function flattenKeyValues(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const keyValues = new Map<string, string>();

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenKeyValues(value as Record<string, unknown>, fullKey);
      nested.forEach((v, k) => keyValues.set(k, v));
    } else if (Array.isArray(value)) {
      // Handle arrays by recursing into each element with index in key path
      value.forEach((item, index) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const itemValues = flattenKeyValues(
            item as Record<string, unknown>,
            `${fullKey}[${index}]`
          );
          itemValues.forEach((v, k) => keyValues.set(k, v));
        }
      });
    } else if (typeof value === 'string') {
      keyValues.set(fullKey, value);
    }
  }

  return keyValues;
}

/**
 * Validate ICU message format in translation strings
 * Checks for common issues like double braces {{variable}} which should be {variable}
 */
function validateICUFormat(
  locale: string,
  namespace: string,
  keyValues: Map<string, string>
): IICUFormatError[] {
  const errors: IICUFormatError[] = [];

  keyValues.forEach((value, key) => {
    // Check for double braces {{variable}} - should be {variable}
    // But skip if it looks like a template literal (e.g., Mustache syntax)
    const doubleBraceMatch = value.match(/\{\{[^}]+\}\}/g);
    if (doubleBraceMatch) {
      errors.push({
        locale,
        namespace,
        key,
        value: value.length > 100 ? value.substring(0, 100) + '...' : value,
        issue: `Double braces found: ${doubleBraceMatch.join(', ')}. Use single braces {variable} for ICU format.`,
      });
    }

    // Check for unclosed braces using a stack-based approach
    // This properly handles nested ICU plural/select syntax like {count, plural, one {item} other {items}}
    let depth = 0;
    let maxDepth = 0;
    for (const char of value) {
      if (char === '{') {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      } else if (char === '}') {
        depth--;
        if (depth < 0) break; // More closes than opens
      }
    }
    if (depth !== 0) {
      errors.push({
        locale,
        namespace,
        key,
        value: value.length > 100 ? value.substring(0, 100) + '...' : value,
        issue: `Unbalanced braces: final depth is ${depth} (should be 0)`,
      });
    }

    // Note: Empty braces {} are valid in ICU plural/select syntax
    // e.g., {count, plural, one {} other {s}} means "nothing" for singular
    // So we don't flag standalone {} as errors
  });

  return errors;
}

function checkTranslations(options: ICLIOptions): ITranslationReport {
  const report: ITranslationReport = {
    summary: {
      totalLocales: 0,
      totalNamespaces: 0,
      invalidJsonFiles: 0,
      icuFormatErrors: 0,
      missingFiles: 0,
      missingKeys: 0,
      untranslatedFiles: 0,
      untranslatedKeys: 0,
      pseoWithoutI18n: 0,
    },
    invalidJsonFiles: [],
    icuFormatErrors: [],
    missingFiles: [],
    missingKeys: [],
    untranslatedContent: [],
    extraFiles: [],
    extraKeys: [],
    pseoWithoutI18n: [],
  };

  // Get all locales and filter if specified
  let locales = getLocales().filter(l => l !== REFERENCE_LOCALE);
  if (options.locale) {
    locales = locales.filter(l => l === options.locale);
    if (locales.length === 0) {
      console.error(`Locale "${options.locale}" not found.`);
      console.error(`Available locales: ${getLocales().join(', ')}`);
      process.exit(1);
    }
  }

  // Get reference namespaces and filter if specified
  let referenceNamespaces = getNamespaces(REFERENCE_LOCALE);
  if (options.namespace) {
    if (!referenceNamespaces.includes(options.namespace)) {
      console.error(`Namespace "${options.namespace}" not found in ${REFERENCE_LOCALE}.`);
      console.error(`Available namespaces: ${referenceNamespaces.join(', ')}`);
      process.exit(1);
    }
    referenceNamespaces = [options.namespace];
  }

  report.summary.totalLocales = locales.length;
  report.summary.totalNamespaces = referenceNamespaces.length;

  // First pass: validate all JSON files for syntax errors and ICU format
  const allLocales = [REFERENCE_LOCALE, ...locales];
  for (const locale of allLocales) {
    const namespaces = getNamespaces(locale);
    for (const namespace of namespaces) {
      if (options.namespace && namespace !== options.namespace) continue;

      const result = loadTranslation(locale, namespace);
      if (result.error) {
        // Check if we already recorded this error
        const alreadyRecorded = report.invalidJsonFiles.some(
          f => f.locale === locale && f.namespace === namespace
        );
        if (!alreadyRecorded) {
          report.invalidJsonFiles.push({
            locale,
            namespace,
            error: result.error,
          });
          report.summary.invalidJsonFiles++;
        }
      } else if (result.data) {
        // Check ICU format for all locales including reference
        const keyValues = flattenKeyValues(result.data);
        const icuErrors = validateICUFormat(locale, namespace, keyValues);
        if (icuErrors.length > 0) {
          // Avoid duplicates
          for (const err of icuErrors) {
            const alreadyRecorded = report.icuFormatErrors.some(
              e => e.locale === err.locale && e.namespace === err.namespace && e.key === err.key
            );
            if (!alreadyRecorded) {
              report.icuFormatErrors.push(err);
              report.summary.icuFormatErrors++;
            }
          }
        }
      }
    }
  }

  // If icuOnly, skip all other checks
  if (options.icuOnly) {
    return report;
  }

  // Check each locale against the reference
  for (const locale of locales) {
    const localeNamespaces = getNamespaces(locale);

    // Check for missing files
    if (!options.keysOnly) {
      for (const namespace of referenceNamespaces) {
        if (!localeNamespaces.includes(namespace)) {
          report.missingFiles.push({ locale, namespace });
          report.summary.missingFiles++;
        }
      }

      // Check for extra files (in locale but not in reference)
      for (const namespace of localeNamespaces) {
        if (
          !referenceNamespaces.includes(namespace) &&
          (!options.namespace || namespace === options.namespace)
        ) {
          report.extraFiles.push({ locale, namespace });
        }
      }
    }

    // Check for missing keys
    if (!options.filesOnly) {
      for (const namespace of referenceNamespaces) {
        const referenceResult = loadTranslation(REFERENCE_LOCALE, namespace);
        const localeResult = loadTranslation(locale, namespace);

        // Track invalid JSON files
        if (referenceResult.error) {
          report.invalidJsonFiles.push({
            locale: REFERENCE_LOCALE,
            namespace,
            error: referenceResult.error,
          });
          report.summary.invalidJsonFiles++;
          continue;
        }

        if (localeResult.error) {
          report.invalidJsonFiles.push({
            locale,
            namespace,
            error: localeResult.error,
          });
          report.summary.invalidJsonFiles++;
          continue;
        }

        const referenceTranslation = referenceResult.data;
        const localeTranslation = localeResult.data;

        if (!referenceTranslation) continue;
        if (!localeTranslation) continue; // Already reported as missing file

        const referenceKeys = flattenKeys(referenceTranslation);
        const localeKeys = flattenKeys(localeTranslation);

        // Debug output for file structure
        if (options.debug) {
          console.log(`\n[DEBUG] ${locale}/${namespace}.json`);
          console.log(`  Reference keys: ${referenceKeys.size}`);
          console.log(`  Locale keys: ${localeKeys.size}`);

          // Check array structures
          const refPages = (referenceTranslation as Record<string, unknown>)['pages'];
          const locPages = (localeTranslation as Record<string, unknown>)['pages'];
          if (Array.isArray(refPages) && Array.isArray(locPages)) {
            console.log(`  Reference pages array: ${refPages.length} items`);
            console.log(`  Locale pages array: ${locPages.length} items`);
            if (refPages.length !== locPages.length) {
              console.log(`  ⚠️  MISMATCH: Different array lengths!`);
            }
            // Show slugs for comparison
            const refSlugs = refPages
              .map((p: Record<string, unknown>) => p.slug)
              .filter(Boolean) as string[];
            const locSlugs = locPages
              .map((p: Record<string, unknown>) => p.slug)
              .filter(Boolean) as string[];
            const missingSlugs = refSlugs.filter(s => !locSlugs.includes(s));
            const extraSlugs = locSlugs.filter(s => !refSlugs.includes(s));
            if (missingSlugs.length > 0) {
              console.log(`  Missing slugs: ${missingSlugs.join(', ')}`);
            }
            if (extraSlugs.length > 0) {
              console.log(`  Extra slugs: ${extraSlugs.join(', ')}`);
            }
          }
        }

        // Find missing keys
        const missingKeys: string[] = [];
        referenceKeys.forEach(key => {
          if (!localeKeys.has(key)) {
            missingKeys.push(key);
          }
        });

        if (missingKeys.length > 0) {
          report.missingKeys.push({
            locale,
            namespace,
            keys: missingKeys.sort(),
          });
          report.summary.missingKeys += missingKeys.length;
        }

        // Find extra keys
        const extraKeys: string[] = [];
        localeKeys.forEach(key => {
          if (!referenceKeys.has(key)) {
            extraKeys.push(key);
          }
        });

        if (extraKeys.length > 0) {
          report.extraKeys.push({
            locale,
            namespace,
            keys: extraKeys.sort(),
          });
        }

        // Check for untranslated content (values identical to English)
        const referenceKeyValues = flattenKeyValues(referenceTranslation);
        const localeKeyValues = flattenKeyValues(localeTranslation);
        const untranslatedKeys: string[] = [];

        // Keys that should be excluded from untranslated check
        // These are technical identifiers or universal values that legitimately match across locales
        const excludedKeys = new Set([
          'category',
          'meta.lastUpdated',
          'meta.totalPages',
          'meta.description',
        ]);

        referenceKeyValues.forEach((refValue, key) => {
          // Skip excluded keys
          if (excludedKeys.has(key)) {
            return;
          }
          const localeValue = localeKeyValues.get(key);
          if (localeValue === refValue) {
            untranslatedKeys.push(key);
          }
        });

        if (untranslatedKeys.length > 0) {
          const totalKeys = referenceKeyValues.size;
          const percentage = Math.round((untranslatedKeys.length / totalKeys) * 100);

          // Only report if significant portion is untranslated (>50% or all keys match)
          // This avoids false positives for files with legitimately same values (e.g., brand names)
          if (percentage >= 50) {
            report.untranslatedContent.push({
              locale,
              namespace,
              keys: untranslatedKeys.sort(),
              totalKeys,
              percentage,
            });
            report.summary.untranslatedKeys += untranslatedKeys.length;
            if (percentage === 100) {
              report.summary.untranslatedFiles++;
            }
          }
        }
      }
    }
  }

  // Check pSEO data files for i18n coverage
  if (options.checkPseo) {
    const referenceNamespaces = getNamespaces(REFERENCE_LOCALE);
    report.pseoWithoutI18n = checkPSEODataFiles(referenceNamespaces);
    report.summary.pseoWithoutI18n = report.pseoWithoutI18n.length;
  }

  return report;
}

function printReport(report: ITranslationReport, options: ICLIOptions): void {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const {
    summary,
    invalidJsonFiles,
    icuFormatErrors,
    missingFiles,
    missingKeys,
    untranslatedContent,
    extraFiles,
    extraKeys,
    pseoWithoutI18n,
  } = report;

  console.log('\n========================================');
  console.log('       TRANSLATION CHECK REPORT        ');
  console.log('========================================\n');

  console.log(`Reference locale: ${REFERENCE_LOCALE}`);
  console.log(`Locales checked: ${summary.totalLocales}`);
  console.log(`Namespaces checked: ${summary.totalNamespaces}`);
  console.log('');

  // Invalid JSON files (syntax errors)
  if (invalidJsonFiles.length > 0) {
    console.log('----------------------------------------');
    console.log(`INVALID JSON FILES (${invalidJsonFiles.length})`);
    console.log('----------------------------------------');

    for (const { locale, namespace, error } of invalidJsonFiles) {
      console.log(`\n  ${locale}/${namespace}.json:`);
      console.log(`    Error: ${error}`);
    }
    console.log('');
  } else if (options.verbose) {
    console.log('All JSON files are valid.');
    console.log('');
  }

  // ICU format errors (malformed message arguments)
  if (icuFormatErrors.length > 0) {
    console.log('----------------------------------------');
    console.log(`ICU FORMAT ERRORS (${icuFormatErrors.length})`);
    console.log('----------------------------------------');
    console.log('\nThese translation strings have invalid ICU message format.\n');

    // Group by locale/namespace
    const byFile = icuFormatErrors.reduce(
      (acc, err) => {
        const key = `${err.locale}/${err.namespace}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(err);
        return acc;
      },
      {} as Record<string, IICUFormatError[]>
    );

    for (const [file, errors] of Object.entries(byFile)) {
      console.log(`  📁 ${file}.json (${errors.length} errors):`);
      for (const err of errors.slice(0, 5)) {
        console.log(`    - ${err.key}`);
        console.log(`      Issue: ${err.issue}`);
      }
      if (errors.length > 5) {
        console.log(`    ... and ${errors.length - 5} more errors`);
      }
      console.log('');
    }
  } else if (options.verbose) {
    console.log('No ICU format errors found.');
    console.log('');
  }

  // Missing files
  if (missingFiles.length > 0) {
    console.log('----------------------------------------');
    console.log(`MISSING FILES (${missingFiles.length})`);
    console.log('----------------------------------------');

    const byLocale = missingFiles.reduce(
      (acc, { locale, namespace }) => {
        if (!acc[locale]) acc[locale] = [];
        acc[locale].push(namespace);
        return acc;
      },
      {} as Record<string, string[]>
    );

    for (const [locale, namespaces] of Object.entries(byLocale)) {
      console.log(`\n  ${locale.toUpperCase()}:`);
      namespaces.forEach(ns => console.log(`    - ${ns}.json`));
    }
    console.log('');
  } else if (options.verbose) {
    console.log('No missing files found.');
    console.log('');
  }

  // Missing keys
  if (missingKeys.length > 0) {
    console.log('----------------------------------------');
    console.log(`MISSING KEYS (${summary.missingKeys} total)`);
    console.log('----------------------------------------');

    for (const { locale, namespace, keys } of missingKeys) {
      console.log(`\n  ${locale.toUpperCase()} / ${namespace}.json (${keys.length} keys):`);
      keys.forEach(key => console.log(`    - ${key}`));
    }
    console.log('');
  } else if (options.verbose) {
    console.log('No missing keys found.');
    console.log('');
  }

  // Untranslated content (values identical to English)
  if (untranslatedContent.length > 0) {
    console.log('----------------------------------------');
    console.log(`UNTRANSLATED CONTENT (${untranslatedContent.length} files)`);
    console.log('----------------------------------------');

    for (const { locale, namespace, keys, totalKeys, percentage } of untranslatedContent) {
      console.log(
        `\n  ${locale.toUpperCase()} / ${namespace}.json (${percentage}% untranslated - ${keys.length}/${totalKeys} keys):`
      );
      // Only show first 10 keys to avoid overwhelming output
      const displayKeys = keys.slice(0, 10);
      displayKeys.forEach(key => console.log(`    - ${key}`));
      if (keys.length > 10) {
        console.log(`    ... and ${keys.length - 10} more`);
      }
    }
    console.log('');
  } else if (options.verbose) {
    console.log('No untranslated content found.');
    console.log('');
  }

  // Extra files (warnings)
  if (extraFiles.length > 0 && options.verbose) {
    console.log('----------------------------------------');
    console.log(`EXTRA FILES (${extraFiles.length}) - Not in ${REFERENCE_LOCALE}`);
    console.log('----------------------------------------');

    for (const { locale, namespace } of extraFiles) {
      console.log(`  ${locale}/${namespace}.json`);
    }
    console.log('');
  }

  // Extra keys (warnings)
  if (extraKeys.length > 0 && options.verbose) {
    console.log('----------------------------------------');
    console.log('EXTRA KEYS - Not in reference');
    console.log('----------------------------------------');

    for (const { locale, namespace, keys } of extraKeys) {
      console.log(`\n  ${locale.toUpperCase()} / ${namespace}.json (${keys.length} keys):`);
      keys.forEach(key => console.log(`    - ${key}`));
    }
    console.log('');
  }

  // pSEO data files without i18n (CRITICAL - these pages won't be translated)
  if (pseoWithoutI18n.length > 0) {
    console.log('----------------------------------------');
    console.log(`PSEO DATA WITHOUT I18N (${pseoWithoutI18n.length} files)`);
    console.log('----------------------------------------');
    console.log(
      '\nThese pSEO data files have translation issues that will prevent proper localization.\n'
    );

    // Group by issue type
    const byIssueType = pseoWithoutI18n.reduce(
      (acc, file) => {
        if (!acc[file.architecturalIssue || 'unknown']) {
          acc[file.architecturalIssue || 'unknown'] = [];
        }
        acc[file.architecturalIssue || 'unknown'].push(file);
        return acc;
      },
      {} as Record<string, typeof pseoWithoutI18n>
    );

    // Report different types of issues
    if (byIssueType['static-import']) {
      console.log('\n🚨 ARCHITECTURAL ISSUES - Static Import detected:');
      console.log('   These pages import static JSON files instead of using i18n.');
      console.log('   They will show English content regardless of locale!\n');

      for (const file of byIssueType['static-import']) {
        console.log(`  📁 ${file.name}.json (${file.pageCount} pages)`);
        console.log(`     ⚠️  Uses static import: \`@/app/seo/data/${file.name}.json\``);
        if (file.hasGetTranslations) {
          console.log(`     ✅ Also has getTranslations - may be migrating`);
        }
        if (file.sampleContent && file.sampleContent.length > 0) {
          console.log(`     📄 Sample: ${file.sampleContent.slice(0, 2).join(', ')}`);
        }
        console.log('');
      }
    }

    if (byIssueType['no-i18n']) {
      console.log('\n📚 MISSING TRANSLATION FILES:');
      console.log('   No translation files exist for these data files.\n');

      for (const file of byIssueType['no-i18n']) {
        console.log(`  📁 ${file.name}.json (${file.pageCount} pages)`);
        console.log(`     ❌ No translations found in locales/{locale}/${file.name}.json`);
        if (file.hasStaticImport) {
          console.log(`     🚨 Uses static import (compounding the issue)`);
        }
        if (file.sampleContent && file.sampleContent.length > 0) {
          console.log(`     📄 Sample: ${file.sampleContent.slice(0, 2).join(', ')}`);
        }
        console.log('');
      }
    }

    // Show generic issues if any
    if (byIssueType['unknown'] && byIssueType['unknown'].length > 0) {
      console.log('\n❓ OTHER ISSUES:');
      for (const file of byIssueType['unknown']) {
        console.log(`  📁 ${file.name}.json (${file.pageCount} pages)`);
        console.log(`     ❓ Unclear issue detected`);
        console.log('');
      }
    }

    // Show solutions
    console.log('\n🛠️  SOLUTIONS:');
    console.log('\n  For static import issues (English-only pages):');
    console.log('    Static imports in app/(pseo)/ are OK for English content.');
    console.log('    Localized versions are served from app/[locale]/(pseo)/');
    console.log('    which use getToolDataWithLocale() for locale-aware loading.\n');

    console.log('  For missing translation files:');
    console.log('    1. Create translation files: locales/{locale}/{dataFile}.json');
    console.log('    2. Copy structure from English version');
    console.log('    3. Translate content while keeping keys intact\n');
    console.log('    1. Create translation files: locales/{locale}/{dataFile}.json');
    console.log('    2. Copy structure from English version');
    console.log('    3. Translate content while keeping keys intact\n');
  } else if (options.verbose) {
    console.log('All pSEO data files have proper i18n support.');
    console.log('');
  }

  // Summary
  console.log('========================================');
  console.log('                SUMMARY                ');
  console.log('========================================');

  const hasIssues =
    summary.invalidJsonFiles > 0 ||
    summary.icuFormatErrors > 0 ||
    summary.missingFiles > 0 ||
    summary.missingKeys > 0 ||
    summary.untranslatedFiles > 0 ||
    summary.untranslatedKeys > 0 ||
    summary.pseoWithoutI18n > 0;

  if (hasIssues) {
    console.log(`\n  Invalid JSON files:  ${summary.invalidJsonFiles}`);
    console.log(`  ICU format errors:   ${summary.icuFormatErrors}`);
    console.log(`  Missing files:       ${summary.missingFiles}`);
    console.log(`  Missing keys:        ${summary.missingKeys}`);
    console.log(`  Untranslated files:  ${summary.untranslatedFiles}`);
    console.log(`  Untranslated keys:   ${summary.untranslatedKeys}`);
    console.log(`  pSEO without i18n:   ${summary.pseoWithoutI18n}`);
    console.log('\n  Status: INCOMPLETE');
  } else {
    console.log('\n  All translations are complete!');
    console.log('\n  Status: COMPLETE');
  }

  console.log('\n========================================\n');
}

// Main execution
const options = parseArgs();
const report = checkTranslations(options);
printReport(report, options);

// Exit with error code if there are any issues
if (
  report.summary.invalidJsonFiles > 0 ||
  report.summary.icuFormatErrors > 0 ||
  report.summary.missingFiles > 0 ||
  report.summary.missingKeys > 0 ||
  report.summary.untranslatedFiles > 0 ||
  report.summary.untranslatedKeys > 0 ||
  report.summary.pseoWithoutI18n > 0
) {
  process.exit(1);
}
