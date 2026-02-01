#!/usr/bin/env tsx
/**
 * IndexNow Batch Submission Script
 *
 * Usage:
 *   node scripts/submit-indexnow.ts                    # Submit URLs from CSV file
 *   node scripts/submit-indexnow.ts --single <url>     # Submit single URL
 *   node scripts/submit-indexnow.ts --status           # Check IndexNow status
 *   node scripts/submit-indexnow.ts --generate-key     # Generate a new key
 *
 * Environment variables:
 *   INDEXNOW_KEY - Your IndexNow API key
 *   INDEXNOW_CSV - Path to CSV file (default: /tmp/seo-audit/Notice-Pages_to_submit_to_IndexNow.csv)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Import IndexNow functions
import {
  submitUrl,
  submitBatch,
  submitFromCSV,
  getSubmissionStatus,
  generateIndexNowKey,
  validateIndexNowKey,
  getKeyFileContent,
  type IIndexNowResult,
  type IIndexNowStatus,
} from '../lib/seo/indexnow';

// =============================================================================
// CLI Interface
// =============================================================================

interface ICLIArgs {
  single?: string;
  status?: boolean;
  generateKey?: boolean;
  csvPath?: string;
}

function parseArgs(): ICLIArgs {
  const args = process.argv.slice(2);

  const result: ICLIArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--single':
        result.single = args[++i];
        break;
      case '--status':
        result.status = true;
        break;
      case '--generate-key':
        result.generateKey = true;
        break;
      case '--csv':
        result.csvPath = args[++i];
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
IndexNow Batch Submission Tool

Usage:
  tsx scripts/submit-indexnow.ts [options]

Options:
  --single <url>       Submit a single URL to IndexNow
  --csv <path>         Submit URLs from CSV file (default: /tmp/seo-audit/Notice-Pages_to_submit_to_IndexNow.csv)
  --status             Check IndexNow configuration status
  --generate-key       Generate a new IndexNow key

Environment Variables:
  INDEXNOW_KEY         Your IndexNow API key (required for submissions)

Examples:
  # Check status
  tsx scripts/submit-indexnow.ts --status

  # Generate a new key
  tsx scripts/submit-indexnow.ts --generate-key

  # Submit single URL
  tsx scripts/submit-indexnow.ts --single https://myimageupscaler.com/blog/new-post

  # Submit URLs from default CSV file
  tsx scripts/submit-indexnow.ts

  # Submit URLs from custom CSV file
  tsx scripts/submit-indexnow.ts --csv ./my-urls.csv

Documentation: https://www.indexnow.org/documentation.html
`);
}

// =============================================================================
// Command Handlers
// =============================================================================

async function handleStatus(): Promise<void> {
  console.log('Checking IndexNow configuration...\n');

  const status = await getSubmissionStatus();

  console.log('IndexNow Status:');
  console.log(`  Enabled: ${status.isEnabled ? 'Yes' : 'No'}`);
  console.log(`  Total Submitted: ${status.totalSubmitted}`);
  console.log(`  Key Location: ${status.keyLocation || 'Not configured'}`);
  console.log(`  Last Submission: ${status.lastSubmission || 'Never'}`);

  if (!status.isEnabled) {
    console.log('\n⚠️  IndexNow is not configured.');
    console.log('Please set INDEXNOW_KEY environment variable.');
    console.log('Generate a key with: tsx scripts/submit-indexnow.ts --generate-key');
  }
}

async function handleGenerateKey(): Promise<void> {
  const key = generateIndexNowKey(32);

  console.log('Generated IndexNow Key:');
  console.log(`  ${key}`);
  console.log('\nAdd this to your .env.api file:');
  console.log(`  INDEXNOW_KEY=${key}`);
  console.log('\nCreate the key verification file:');
  console.log(`  echo "${key}" > public/${key}.txt`);
  console.log('\nOr use the create-key-file script:');
  console.log(`  tsx scripts/create-indexnow-keyfile.ts ${key}`);
}

async function handleSingleUrl(url: string): Promise<void> {
  console.log(`Submitting URL to IndexNow: ${url}\n`);

  const result = await submitUrl(url);

  if (result.success) {
    console.log('✓ Submission successful!');
    console.log(`  Status Code: ${result.statusCode}`);
    console.log(`  URLs Submitted: ${result.urlCount}`);
    console.log(`  Timestamp: ${result.timestamp}`);
  } else {
    console.error('✗ Submission failed!');
    console.error(`  Error: ${result.message}`);
    process.exit(1);
  }
}

async function handleCSVUpload(csvPath: string): Promise<void> {
  console.log(`Reading URLs from: ${csvPath}\n`);

  let csvContent: string;

  try {
    csvContent = readFileSync(csvPath, 'utf-8');
  } catch (error) {
    console.error(`✗ Failed to read CSV file: ${csvPath}`);
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }

  const result = await submitFromCSV(csvContent);

  if (result.success) {
    console.log('✓ Batch submission successful!');
    console.log(`  URLs Submitted: ${result.urlCount}`);
    console.log(`  Timestamp: ${result.timestamp}`);
    console.log(`  Message: ${result.message}`);
  } else {
    console.error('✗ Batch submission failed!');
    console.error(`  Error: ${result.message}`);
    process.exit(1);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  // Show help if no arguments
  if (Object.keys(args).length === 0) {
    printUsage();
    return;
  }

  // Handle commands
  if (args.status) {
    await handleStatus();
  } else if (args.generateKey) {
    await handleGenerateKey();
  } else if (args.single) {
    await handleSingleUrl(args.single);
  } else {
    // Default: submit from CSV
    const csvPath = args.csvPath || '/tmp/seo-audit/Notice-Pages_to_submit_to_IndexNow.csv';
    await handleCSVUpload(csvPath);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
