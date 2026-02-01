#!/usr/bin/env tsx
/**
 * IndexNow Key File Generator
 *
 * Creates the IndexNow verification file in the public directory.
 * Search engines will look for this file to verify ownership.
 *
 * Usage:
 *   tsx scripts/create-indexnow-keyfile.ts <key>
 *   tsx scripts/create-indexnow-keyfile.ts --generate
 *
 * The key file should be accessible at: https://yourdomain.com/{key}.txt
 */

import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { generateIndexNowKey, validateIndexNowKey } from '../lib/seo/indexnow';

const PUBLIC_DIR = resolve(process.cwd(), 'public');

function printUsage(): void {
  console.log(`
IndexNow Key File Generator

Usage:
  tsx scripts/create-indexnow-keyfile.ts <key>
  tsx scripts/create-indexnow-keyfile.ts --generate

Options:
  <key>         Your IndexNow API key
  --generate    Automatically generate a new key

Examples:
  # Create key file with existing key
  tsx scripts/create-indexnow-keyfile.ts abc123def456

  # Generate new key and create file
  tsx scripts/create-indexnow-keyfile.ts --generate

The key file will be created at: public/{key}.txt
This makes it accessible at: https://myimageupscaler.com/{key}.txt

Documentation: https://www.indexnow.org/documentation.html
`);
}

function createKeyFile(key: string): void {
  // Validate key
  if (!validateIndexNowKey(key)) {
    console.error('✗ Invalid IndexNow key format.');
    console.error('Key must be 8-128 characters and contain only a-z, A-Z, 0-9, and hyphens.');
    process.exit(1);
  }

  const filePath = resolve(PUBLIC_DIR, `${key}.txt`);

  // Check if file already exists
  if (existsSync(filePath)) {
    console.warn(`⚠️  Key file already exists: ${filePath}`);
    console.warn('Overwriting...');
  }

  // Write key file
  try {
    writeFileSync(filePath, key, 'utf-8');
    console.log('✓ IndexNow key file created successfully!');
    console.log(`  File: ${filePath}`);
    console.log(`  Public URL: https://myimageupscaler.com/${key}.txt`);
    console.log('\nNext steps:');
    console.log('  1. Add the key to your .env.api file:');
    console.log(`     INDEXNOW_KEY=${key}`);
    console.log('  2. Verify the key file is accessible:');
    console.log(`     curl https://myimageupscaler.com/${key}.txt`);
    console.log('  3. Submit URLs to IndexNow:');
    console.log('     tsx scripts/submit-indexnow.ts --status');
  } catch (error) {
    console.error('✗ Failed to create key file.');
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Show help if no arguments
  if (args.length === 0) {
    printUsage();
    return;
  }

  const [arg] = args;

  if (arg === '--generate') {
    console.log('Generating new IndexNow key...\n');
    const key = generateIndexNowKey(32);
    console.log(`Generated key: ${key}\n`);
    createKeyFile(key);
  } else if (arg === '--help' || arg === '-h') {
    printUsage();
  } else {
    // Use provided key
    createKeyFile(arg);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
