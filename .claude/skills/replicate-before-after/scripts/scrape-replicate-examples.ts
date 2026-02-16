#!/usr/bin/env npx tsx
/**
 * Scrape before/after example images from a Replicate model page.
 *
 * Usage:
 *   npx tsx .claude/skills/replicate-before-after/scripts/scrape-replicate-examples.ts <replicate-url> <tier-slug> [example-index] [size]
 *
 * Examples:
 *   npx tsx ... https://replicate.com/xinntao/gfpgan face-restore
 *   npx tsx ... https://replicate.com/nightmareai/real-esrgan quick 1
 *   npx tsx ... https://replicate.com/nightmareai/real-esrgan quick 0 512
 *
 * What it does:
 *   1. Opens the Replicate model page with Playwright (headless Chromium)
 *   2. Clicks the "Examples" tab to load example predictions
 *   3. Extracts input/output image pairs (handles both old and new Replicate layouts)
 *   4. Downloads the selected pair (default: first example, index 0)
 *   5. Resizes BOTH images to the same square dimensions (default: 512x512)
 *   6. Converts to .webp using ImageMagick
 *   7. Saves to public/before-after/{tier-slug}/before.webp & after.webp
 *
 * Requirements:
 *   - Playwright with Chromium: npx playwright install chromium
 *   - ImageMagick: convert command (for webp conversion + resize)
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

const DEFAULT_SIZE = 512; // Both before and after will be this size (square)

interface IImagePair {
  before: string; // URL
  after: string; // URL
}

function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol
      .get(url, response => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadFile(response.headers.location!, outputPath).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        const fileStream = fs.createWriteStream(outputPath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', reject);
      })
      .on('error', reject);
  });
}

/**
 * Convert and resize image to webp at a specific square size.
 * Uses center-crop to fill the square without distortion.
 */
function convertToWebp(inputPath: string, outputPath: string, size: number): void {
  // Resize to fill the square (may exceed), then crop to exact size, then convert to webp
  execSync(
    `convert "${inputPath}" -resize ${size}x${size}^ -gravity center -extent ${size}x${size} -quality 85 "${outputPath}"`,
    { stdio: 'pipe' }
  );
}

async function scrapeReplicateExamples(replicateUrl: string): Promise<IImagePair[]> {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`Navigating to ${replicateUrl}...`);
    await page.goto(replicateUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Click Examples tab
    const examplesTab = await page.$('a[href*="examples"], button:has-text("Examples")');
    if (examplesTab) {
      console.log('Clicking Examples tab...');
      await examplesTab.click();
      await page.waitForTimeout(3000);
    } else {
      console.log('No Examples tab found, checking main page for examples...');
    }

    // Extract image pairs using multiple strategies:
    // Strategy 1 (old layout): alt="img"/"Input image" + alt="output"/"Output image"
    // Strategy 2 (new layout): .input-col vs .output-col CSS ancestors
    // Strategy 3 (fallback): .example-list-item containers with replicate.delivery images
    const pairs: IImagePair[] = await page.evaluate(() => {
      const results: IImagePair[] = [];

      // Strategy 1: Try alt-text based pairing (old Replicate layout)
      const imgs = Array.from(document.querySelectorAll('img'));
      const inputAlts = ['img', 'Input image'];
      const outputAlts = ['Output image'];

      const altInputs = imgs.filter(img => img.src && inputAlts.includes(img.alt));
      const altOutputs = imgs.filter(img => img.src && outputAlts.includes(img.alt));

      if (altInputs.length > 0 && altOutputs.length > 0) {
        // Pair by DOM order within each example-list-item
        const examples = document.querySelectorAll('.example-list-item');
        examples.forEach(ex => {
          const exImgs = Array.from(ex.querySelectorAll('img'));
          const inp = exImgs.find(i => inputAlts.includes(i.alt) && i.src);
          const out = exImgs.find(i => outputAlts.includes(i.alt) && i.src);
          if (inp && out) {
            results.push({ before: inp.src, after: out.src });
          }
        });
        if (results.length > 0) return results;
      }

      // Strategy 2: Use .input-col / .output-col CSS ancestors (new layout)
      const examples = document.querySelectorAll('.example-list-item');
      examples.forEach(ex => {
        const inputCol = ex.querySelector('.input-col');
        const outputCol = ex.querySelector('.output-col');
        if (!inputCol || !outputCol) return;

        // Get the first replicate.delivery image from each column
        const inputImgs = Array.from(inputCol.querySelectorAll('img')).filter(img =>
          img.src?.includes('replicate.delivery')
        );
        const outputImgs = Array.from(outputCol.querySelectorAll('img')).filter(img =>
          img.src?.includes('replicate.delivery')
        );

        if (inputImgs.length > 0 && outputImgs.length > 0) {
          // Use the LAST input image (closest to actual input, not thumbnails)
          results.push({
            before: inputImgs[inputImgs.length - 1].src,
            after: outputImgs[0].src,
          });
        }
      });

      return results;
    });

    console.log(`Found ${pairs.length} before/after pairs`);
    pairs.forEach((pair, i) => {
      console.log(`  [${i}] before: ${pair.before}`);
      console.log(`       after:  ${pair.after}`);
    });

    return pairs;
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      'Usage: npx tsx scrape-replicate-examples.ts <replicate-url> <tier-slug> [example-index] [size]'
    );
    console.error(
      'Example: npx tsx scrape-replicate-examples.ts https://replicate.com/xinntao/gfpgan face-restore'
    );
    console.error('Size defaults to 512 (both images resized to 512x512 square)');
    process.exit(1);
  }

  const [replicateUrl, tierSlug, indexStr, sizeStr] = args;
  const exampleIndex = indexStr ? parseInt(indexStr, 10) : 0;
  const size = sizeStr ? parseInt(sizeStr, 10) : DEFAULT_SIZE;

  const outputDir = path.join(PROJECT_ROOT, 'public', 'before-after', tierSlug);
  const tmpDir = path.join('/tmp', `replicate-${tierSlug}-${Date.now()}`);

  // Ensure directories exist
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. Scrape examples
    const pairs = await scrapeReplicateExamples(replicateUrl);

    if (pairs.length === 0) {
      console.error('No before/after pairs found on the page.');
      process.exit(1);
    }

    if (exampleIndex >= pairs.length) {
      console.error(`Example index ${exampleIndex} out of range (found ${pairs.length} pairs)`);
      process.exit(1);
    }

    const selectedPair = pairs[exampleIndex];
    console.log(`\nUsing example pair [${exampleIndex}]:`);
    console.log(`  Before: ${selectedPair.before}`);
    console.log(`  After:  ${selectedPair.after}`);

    // 2. Download images
    const beforeExt = selectedPair.before.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'png';
    const afterExt = selectedPair.after.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'png';
    const tmpBefore = path.join(tmpDir, `before.${beforeExt}`);
    const tmpAfter = path.join(tmpDir, `after.${afterExt}`);

    console.log('\nDownloading before image...');
    await downloadFile(selectedPair.before, tmpBefore);
    console.log('Downloading after image...');
    await downloadFile(selectedPair.after, tmpAfter);

    // Check sizes
    const beforeSize = fs.statSync(tmpBefore).size;
    const afterSize = fs.statSync(tmpAfter).size;
    console.log(
      `Downloaded: before=${(beforeSize / 1024).toFixed(1)}KB, after=${(afterSize / 1024).toFixed(1)}KB`
    );

    // 3. Convert to webp at matching size
    const outputBefore = path.join(outputDir, 'before.webp');
    const outputAfter = path.join(outputDir, 'after.webp');

    console.log(`\nConverting to ${size}x${size} webp...`);
    convertToWebp(tmpBefore, outputBefore, size);
    convertToWebp(tmpAfter, outputAfter, size);

    const finalBeforeSize = fs.statSync(outputBefore).size;
    const finalAfterSize = fs.statSync(outputAfter).size;
    console.log(
      `Saved: before=${(finalBeforeSize / 1024).toFixed(1)}KB, after=${(finalAfterSize / 1024).toFixed(1)}KB`
    );

    console.log(`\nDone! Files saved to:`);
    console.log(`  ${outputBefore}`);
    console.log(`  ${outputAfter}`);
  } finally {
    // Cleanup tmp
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
