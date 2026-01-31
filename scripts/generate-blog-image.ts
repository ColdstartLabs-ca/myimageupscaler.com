/**
 * Generate AI images using Replicate's black-forest-labs/flux-2-pro model
 *
 * Usage:
 *   yarn tsx scripts/generate-blog-image.ts "your prompt here"
 *   yarn tsx scripts/generate-blog-image.ts "your prompt here" output.png
 *   yarn tsx scripts/generate-blog-image.ts "your prompt here" output.png "16:9"
 *
 * Aspect ratios and costs:
 *   9:16  (576x1024)  - ~$0.009 (cheapest!)
 *   5:4   (960x768)   - ~$0.011
 *   21:9  (1344x576)  - ~$0.012
 *   4:3   (1024x768)  - ~$0.012
 *   3:2   (1152x768)  - ~$0.013
 *   16:9  (1280x720)  - ~$0.014
 *   1:1   (1024x1024) - ~$0.015
 *   16:9  (1920x1080) - ~$0.030
 */

import Replicate from 'replicate';
import fs from 'fs';
import https from 'https';
import path from 'path';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.api' });

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

if (!REPLICATE_API_TOKEN) {
  console.error('Error: REPLICATE_API_TOKEN not found in .env.api');
  console.error('Add it with: echo "REPLICATE_API_TOKEN=your-token-here" >> .env.api');
  process.exit(1);
}

const replicate = new Replicate({
  auth: REPLICATE_API_TOKEN,
});

async function downloadImage(url: string, filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);

    https
      .get(url, response => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        } else if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(filepath);
            downloadImage(redirectUrl, filepath).then(resolve).catch(reject);
          } else {
            reject(new Error(`Redirect without location header`));
          }
        } else {
          reject(new Error(`Failed to download: ${response.statusCode}`));
        }
      })
      .on('error', err => {
        fs.unlinkSync(filepath);
        reject(err);
      });
  });
}

async function generateImage(
  prompt: string,
  outputPath: string,
  aspectRatio: string = '9:16'
): Promise<string> {
  console.log('Generating image with Replicate flux-2-pro...');
  console.log(`  Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
  console.log(`  Aspect ratio: ${aspectRatio}`);
  console.log('  This may take 30-60 seconds...\n');

  const output = await replicate.run('black-forest-labs/flux-2-pro', {
    input: {
      prompt: prompt,
      aspect_ratio: aspectRatio,
      output_quality: 100,
      num_inference_steps: 50,
    },
  });

  // Output is an array of image URLs or a single URL
  const imageUrl = Array.isArray(output) ? output[0] : output;

  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('No image URL returned from Replicate');
  }

  console.log('Image generated successfully!');
  console.log(`  URL: ${imageUrl}`);
  console.log('  Downloading...\n');

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await downloadImage(imageUrl, outputPath);

  const stats = fs.statSync(outputPath);
  const sizeKB = Math.round(stats.size / 1024);

  console.log(`Image saved to: ${outputPath}`);
  console.log(`  Size: ${sizeKB} KB`);

  return outputPath;
}

// Main execution
const prompt =
  process.argv[2] ||
  'Modern workspace with laptop and professional setting, clean design, natural lighting, photorealistic';
const outputPath = process.argv[3] || `./generated-${Date.now()}.png`;
const aspectRatio = process.argv[4] || '9:16';

console.log('\n=== AI Image Generation ===\n');

generateImage(prompt, outputPath, aspectRatio)
  .then(path => {
    console.log('\nDone! To upload to blog, run:');
    console.log(`  source scripts/load-env.sh`);
    console.log(`  API_KEY=$(grep BLOG_API_KEY .env.api | cut -d'=' -f2)`);
    console.log(`  curl -X POST http://localhost:3000/api/blog/images/upload \\`);
    console.log(`    -H "x-api-key: $API_KEY" \\`);
    console.log(`    -F "file=@${path}" \\`);
    console.log(`    -F "alt_text=Your alt text here"`);
  })
  .catch(err => {
    console.error('\nError:', err.message);
    process.exit(1);
  });
