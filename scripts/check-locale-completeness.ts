/**
 * Locale Completeness Checker
 *
 * Compares each locale file with the English version to find missing entries.
 * This helps identify gaps in translations that will cause 404 errors.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const LOCALES_DIR = join(process.cwd(), 'locales');
const LOCALE_FILES = [
  'interactive-tools.json',
  'bulk-tools.json',
  'formats.json',
  'free-tools.json',
  'guides.json',
  'scale.json',
  'alternatives.json',
  'use-cases.json',
  'format-scale.json',
  'platform-format.json',
  'device-use.json',
  'device-optimization.json',
  'industry-insights.json',
  'photo-restoration.json',
  'camera-raw.json',
  'ai-features.json',
  'content.json',
];

type Locale = 'en' | 'es' | 'pt' | 'de' | 'fr' | 'it' | 'ja';

const LOCALES: Locale[] = ['en', 'es', 'pt', 'de', 'fr', 'it', 'ja'];

interface IPageEntry {
  slug: string;
  title?: string;
}

interface ILocaleFile {
  pages?: IPageEntry[];
  category?: string;
}

/**
 * Get slugs from a locale file
 */
function getSlugs(locale: Locale, filename: string): string[] {
  const filePath = join(LOCALES_DIR, locale, filename);
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data: ILocaleFile = JSON.parse(content);
    return (data.pages || []).map((p: IPageEntry) => p.slug);
  } catch {
    return [];
  }
}

/**
 * Compare two arrays and find missing items
 */
function findMissing(englishSlugs: string[], localeSlugs: string[]): string[] {
  return englishSlugs.filter(slug => !localeSlugs.includes(slug));
}

console.log('🔍 Locale Completeness Checker\n');
console.log('='.repeat(70));

let totalMissing = 0;
const results: Array<{ file: string; locale: string; missing: number; slugs: string[] }> = [];

for (const filename of LOCALE_FILES) {
  // Check if English file exists
  const englishPath = join(LOCALES_DIR, 'en', filename);
  if (!existsSync(englishPath)) {
    continue;
  }

  const englishSlugs = getSlugs('en', filename);
  if (englishSlugs.length === 0) {
    continue;
  }

  console.log(`\n📄 ${filename}`);
  console.log(`   English: ${englishSlugs.length} entries\n`);

  for (const locale of LOCALES) {
    if (locale === 'en') continue;

    const localeSlugs = getSlugs(locale, filename);
    const missing = findMissing(englishSlugs, localeSlugs);

    if (missing.length > 0) {
      totalMissing += missing.length;
      results.push({ file: filename, locale, missing: missing.length, slugs: missing });

      const icon = localeSlugs.length === 0 ? '❌' : '⚠️';
      const status =
        localeSlugs.length === 0 ? 'MISSING FILE' : `${localeSlugs.length}/${englishSlugs.length}`;
      console.log(`   ${icon} ${locale}: ${status} - ${missing.length} missing`);
    } else {
      console.log(`   ✅ ${locale}: ${localeSlugs.length}/${englishSlugs.length} - Complete`);
    }
  }
}

// Print detailed results for files with missing entries
if (results.length > 0) {
  console.log('\n' + '='.repeat(70));
  console.log('\n📋 DETAILED MISSING ENTRIES\n');

  for (const result of results) {
    console.log(`\n${result.file} → ${result.locale} (${result.missing} missing):`);
    console.log('  ' + '─'.repeat(66));

    // Show up to 10 missing slugs
    const toShow = result.slugs.slice(0, 10);
    toShow.forEach(slug => {
      console.log(`  • ${slug}`);
    });

    if (result.slugs.length > 10) {
      console.log(`  ... and ${result.slugs.length - 10} more`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(
    `\n🔴 TOTAL: ${totalMissing} missing entries across ${results.length} locale files\n`
  );

  console.log('💡 To fix, copy the English entry and translate it to the target locale.\n');
} else {
  console.log('\n' + '='.repeat(70));
  console.log('\n✅ All locale files are complete!\n');
}

process.exit(results.length > 0 ? 1 : 0);
