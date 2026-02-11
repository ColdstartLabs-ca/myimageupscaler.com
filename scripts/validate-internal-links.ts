#!/usr/bin/env tsx
/**
 * Internal Link Validator for pSEO Data Files
 *
 * Validates that all related* arrays in data files reference existing slugs.
 * Does NOT require a running server - validates data integrity only.
 *
 * Usage:
 *   npx tsx scripts/validate-internal-links.ts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(process.cwd(), 'app/seo/data');

interface IValidationResult {
  file: string;
  page: string;
  field: string;
  invalidReferences: string[];
  validReferences: string[];
}

interface IDataFile {
  pages: Array<{
    slug: string;
    relatedTools?: string[];
    relatedGuides?: string[];
    relatedFormats?: string[];
    relatedPlatforms?: string[];
    relatedUseCases?: string[];
    relatedAlternatives?: string[];
    relatedCompare?: string[];
    relatedPages?: string[];
  }>;
}

// Collect all valid slugs from each category
function getAllSlugs() {
  const slugs: Record<string, string[]> = {};

  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const category = file.replace('.json', '');

    try {
      const content = readFileSync(join(DATA_DIR, file), 'utf-8');
      const data = JSON.parse(content) as IDataFile;

      if (!slugs[category]) {
        slugs[category] = [];
      }

      for (const page of data.pages || []) {
        if (page.slug) {
          slugs[category].push(page.slug);
        }
      }
    } catch (error) {
      console.warn(`  ⚠️  Could not read ${file}: ${error}`);
    }
  }

  return slugs;
}

// Get the target categories for a given field in a given file
// Returns an array of categories to check (for multi-source fields)
function getTargetCategories(fileName: string, field: string): string[] {
  const currentCategory = fileName.replace('.json', '');

  // File-specific overrides (when a field has different meaning in specific files)
  const fileOverrides: Record<string, Record<string, string[]>> = {
    // In platform-format.json, relatedFormats/relatedPlatforms reference other platform-format pages
    'platform-format': {
      relatedFormats: ['platform-format'],
      relatedPlatforms: ['platform-format'],
    },
    // In alternatives.json, relatedComparisons references other alternatives
    alternatives: {
      relatedComparisons: ['alternatives'],
    },
    // In device-specific.json, relatedPages references other device-specific pages
    'device-specific': {
      relatedPages: ['device-specific'],
    },
  };

  // Check for file-specific override first
  if (fileOverrides[currentCategory]?.[field]) {
    return fileOverrides[currentCategory][field];
  }

  // Multi-source mappings (fields that can reference multiple categories)
  const multiSourceMappings: Record<string, string[]> = {
    relatedTools: ['tools', 'interactive-tools', 'bulk-tools'],
    relatedGuides: ['guides', 'technical-guides'],
    relatedFormats: ['formats', 'format-conversion'],
    relatedPlatforms: ['platforms'],
    relatedUseCases: ['use-cases', 'use-cases-expanded', 'device-use'],
    relatedAlternatives: ['alternatives'],
    relatedCompare: ['comparison', 'comparisons-expanded', 'competitor-comparisons'],
    relatedPages: ['guides', 'technical-guides', 'content', 'photo-restoration'],
  };

  // Self-referential fields (custom fields specific to certain data files)
  const selfReferentialFields: Record<string, string[]> = {
    relatedDevices: ['device-use'],
    relatedScales: ['format-scale', 'scale'],
    relatedContent: ['content'],
    relatedDeviceOptimization: ['device-optimization'],
    relatedDeviceSpecific: ['device-specific'],
    relatedComparisons: ['comparisons-expanded', 'comparison'],
    relatedCompetitorComparisons: ['competitor-comparisons'],
    relatedFree: ['free'],
    relatedIndustryInsights: ['industry-insights'],
    relatedUseCasesExpanded: ['use-cases-expanded'],
    relatedPersonas: ['personas-expanded'],
    relatedCameraRaw: ['camera-raw'],
    relatedFeatures: ['ai-features'],
  };

  // Check if this field has explicit category mappings (regardless of source file)
  if (selfReferentialFields[field]) {
    return selfReferentialFields[field];
  }

  // Use multi-source mapping if available
  if (multiSourceMappings[field]) {
    return multiSourceMappings[field];
  }

  // Fallback: use field name as category
  return [field.replace('related', '').toLowerCase()];
}

// Validate references in a single data file
function validateFile(fileName: string, allSlugs: Record<string, string[]>): IValidationResult[] {
  const filePath = join(DATA_DIR, fileName);
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as IDataFile;
  const results: IValidationResult[] = [];

  for (const page of data.pages || []) {
    for (const field of Object.keys(page)) {
      if (!field.startsWith('related')) continue;

      const references = (page as Record<string, unknown>)[field] as string[] | undefined;
      if (!references || references.length === 0) continue;

      // Get all target categories and combine their slugs
      const targetCategories = getTargetCategories(fileName, field);
      const validSlugs = targetCategories.flatMap(cat => allSlugs[cat] || []);
      const invalidRefs: string[] = [];
      const validRefs: string[] = [];

      for (const ref of references) {
        if (validSlugs.includes(ref)) {
          validRefs.push(ref);
        } else {
          invalidRefs.push(ref);
        }
      }

      if (invalidRefs.length > 0) {
        results.push({
          file: fileName,
          page: page.slug,
          field,
          invalidReferences: invalidRefs,
          validReferences: validRefs,
        });
      }
    }
  }

  return results;
}

// Main validation function
function main() {
  console.log('\n' + '='.repeat(70));
  console.log('              INTERNAL LINK VALIDATION REPORT');
  console.log('='.repeat(70));
  console.log(`\n🔍 Validating data files in: ${DATA_DIR}\n`);

  // Get all valid slugs
  console.log('📋 Collecting valid slugs from all data files...');
  const allSlugs = getAllSlugs();

  for (const [category, slugs] of Object.entries(allSlugs)) {
    console.log(`  ${category}: ${slugs.length} pages`);
  }

  // Validate all files
  console.log('\n🔍 Validating references in data files...\n');

  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const allIssues: IValidationResult[] = [];

  for (const file of files) {
    const issues = validateFile(file, allSlugs);
    allIssues.push(...issues);

    if (issues.length > 0) {
      console.log(`  ❌ ${file}: ${issues.length} issue(s)`);
    }
  }

  // Print report
  console.log('\n' + '='.repeat(70));
  console.log('                      SUMMARY');
  console.log('='.repeat(70));

  const totalIssues = allIssues.length;
  const filesWithIssues = new Set(allIssues.map(i => i.file)).size;

  console.log(`\nTotal files checked: ${files.length}`);
  console.log(`Files with issues: ${filesWithIssues}`);
  console.log(`Total invalid references: ${totalIssues}\n`);

  if (totalIssues === 0) {
    console.log('🎉 All internal links validated successfully!\n');
    process.exit(0);
  }

  console.log('❌ INVALID REFERENCES FOUND:\n');

  // Group issues by file
  const issuesByFile: Record<string, IValidationResult[]> = {};
  for (const issue of allIssues) {
    if (!issuesByFile[issue.file]) {
      issuesByFile[issue.file] = [];
    }
    issuesByFile[issue.file].push(issue);
  }

  // Print detailed issues
  for (const [file, fileIssues] of Object.entries(issuesByFile)) {
    console.log(`\n📄 ${file}`);

    for (const issue of fileIssues) {
      console.log(`  Page: ${issue.page}`);
      console.log(`  Field: ${issue.field}`);

      if (issue.invalidReferences.length > 0) {
        console.log(`  ❌ Invalid: ${issue.invalidReferences.join(', ')}`);
      }

      if (issue.validReferences.length > 0) {
        console.log(`  ✅ Valid: ${issue.validReferences.join(', ')}`);
      }

      console.log('');
    }
  }

  console.log('='.repeat(70));
  console.log(`\n⚠️  Action required: Remove invalid references from data files\n`);
  console.log('='.repeat(70) + '\n');

  process.exit(1);
}

main();
