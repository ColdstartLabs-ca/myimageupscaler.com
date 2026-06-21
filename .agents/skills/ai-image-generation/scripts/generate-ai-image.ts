/**
 * AI Image Generation Script
 *
 * Generates contextual images using Replicate's black-forest-labs/flux-2-pro model.
 * Use for blog featured images, inline content images, and marketing materials.
 *
 * Usage:
 *   yarn tsx scripts/generate-ai-image.ts "your prompt here" ./output.png
 *   yarn tsx scripts/generate-ai-image.ts "your prompt here" ./output.png 1200 630
 *
 * Environment:
 *   REPLICATE_API_TOKEN - Required, get from .env (DO NOT hardcode tokens)
 *
 * === PROMPT BEST PRACTICES ===
 *
 * ✅ GOOD: "Modern laptop showing bank statement converter on screen, professional office"
 * ✅ GOOD: "Accounting software interface on computer screen, clean modern design"
 * ✅ GOOD: "Workflow diagram from PDF to Excel, clean infographic style"
 *
 * Flux 2 Pro produces high-quality photorealistic images with excellent prompt following.
 */

import Replicate from 'replicate';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { execSync } from 'child_process';

// Ensure token is available
// eslint-disable-next-line no-restricted-syntax -- Standalone script needs process.env
const replicateApiToken = process.env.REPLICATE_API_TOKEN;
if (!replicateApiToken) {
  console.error('❌ REPLICATE_API_TOKEN not set');
  console.error('   Run: source .env');
  console.error('   Or set: export REPLICATE_API_TOKEN=your-token');
  process.exit(1);
}

const replicate = new Replicate({
  auth: replicateApiToken,
});

// Helper: timeout wrapper for long-running operations
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}

async function downloadImage(url: string, filepath: string): Promise<void> {
  const protocol = url.startsWith('https') ? https : http;

  console.log('📥 Downloading from:', url);

  return new Promise<void>((resolve, reject) => {
    protocol
      .get(url, response => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            console.log('↪️  Following redirect to:', redirectUrl);
            downloadImage(redirectUrl, filepath).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode === 200) {
          const fileStream = fs.createWriteStream(filepath);
          response.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            console.log('✅ Download complete');
            resolve();
          });
          fileStream.on('error', err => {
            console.error('❌ File stream error:', err);
            reject(err);
          });
        } else {
          const error = new Error(`Failed to download: ${response.statusCode}`);
          console.error('❌', error.message);
          reject(error);
        }
      })
      .on('error', err => {
        console.error('❌ Native download failed:', err.message);
        console.log('🔄 Trying fallback with curl...');

        // Fallback: try using curl if available
        try {
          execSync(`curl -L -o "${filepath}" "${url}"`, { stdio: 'inherit' });
          console.log('✅ Curl download successful');
          resolve();
        } catch {
          console.error('❌ Curl download also failed');
          reject(new Error(`All download methods failed: ${err.message}`));
        }
      });
  });
}

async function generateAIImage(
  prompt: string,
  outputPath: string = './generated-image.png',
  width: number = 1200,
  height: number = 630
): Promise<string> {
  console.log('🎨 Generating image with prompt:');
  console.log(`   "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
  console.log(`📐 Dimensions: ${width}x${height}`);
  console.log('⏳ This may take 30-90 seconds...\n');

  const startTime = Date.now();

  try {
    console.log('📤 Sending request to Replicate...');
    console.log('⏱️  Timeout set to 3 minutes for image generation...');

    // Use timeout wrapper - Replicate can take 1-2 minutes for image generation
    // Flux 2 Pro returns a URL to the generated image
    const output = await withTimeout(
      replicate.run('black-forest-labs/flux-2-pro', {
        input: {
          prompt: prompt,
          width,
          height,
          aspect_ratio: 'custom',
          output_format: 'png',
          output_quality: 90,
          safety_tolerance: 2,
          prompt_upsampling: true,
        },
      }),
      180000, // 3 minutes
      'Replicate image generation timed out after 3 minutes. Try again or use a smaller image size.'
    );

    // The output may be an iterator (async generator) from Replicate SDK
    // We need to consume it to get the final result
    let finalOutput = output;

    // Handle async iterator/generator from Replicate SDK
    if (output && typeof output === 'object' && Symbol.asyncIterator in output) {
      console.log('📦 Output is an async iterator, consuming...');
      const allChunks: Uint8Array[] = [];
      let itemCount = 0;
      let lastItem: unknown = output;

      for await (const item of output as unknown as AsyncIterable<unknown>) {
        itemCount++;
        lastItem = item;
        // Each item might be raw bytes, a Buffer, or an object with output property
        if (item instanceof Uint8Array) {
          allChunks.push(item);
          console.log(`📦 Chunk ${itemCount}: Uint8Array(${item.length} bytes)`);
        } else if (Buffer.isBuffer(item)) {
          allChunks.push(new Uint8Array(item));
          console.log(`📦 Chunk ${itemCount}: Buffer(${item.length} bytes)`);
        } else if (item && typeof item === 'object') {
          // Check for numeric keys (raw byte data)
          const keys = Object.keys(item);
          if (keys.length > 10 && keys.every(k => /^\d+$/.test(k))) {
            // Convert to Uint8Array
            const length = Math.max(...keys.map(Number)) + 1;
            const buffer = Buffer.alloc(length);
            for (const [key, value] of Object.entries(item)) {
              if (typeof value === 'number') {
                buffer[parseInt(key, 10)] = value;
              }
            }
            allChunks.push(new Uint8Array(buffer));
            console.log(`📦 Chunk ${itemCount}: array-like object (${length} bytes)`);
          } else if (item.output instanceof Uint8Array && !Array.isArray(item.output)) {
            allChunks.push(item.output);
            console.log(
              `📦 Chunk ${itemCount}: has output Uint8Array(${item.output.length} bytes)`
            );
          } else if (Buffer.isBuffer(item.output)) {
            allChunks.push(new Uint8Array(item.output));
            console.log(`📦 Chunk ${itemCount}: has output Buffer(${item.output.length} bytes)`);
          } else {
            console.log(`📦 Chunk ${itemCount}: keys [${keys.slice(0, 3).join(', ')}...]`);
          }
        } else if (typeof item === 'string') {
          // Could be a URL
          console.log(`📦 Chunk ${itemCount}: string (URL?)`);
        }
      }

      if (allChunks.length > 0) {
        // Concatenate all chunks
        const totalLength = allChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        console.log(
          `📦 Concatenating ${allChunks.length} chunks, total size: ${totalLength} bytes`
        );
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of allChunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        finalOutput = combined;
      } else {
        console.log('📦 No byte data chunks found, using last item');
        finalOutput = itemCount > 0 ? lastItem : output;
      }
    }

    // Debug: log the raw output to understand the structure
    console.log('📦 Final output type:', Array.isArray(finalOutput) ? 'array' : typeof finalOutput);

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Handle different response formats from Replicate
    // Flux 2 Pro returns a URL, but some models return raw image bytes (Uint8Array)
    if (finalOutput instanceof Uint8Array) {
      // Output is raw image bytes - write directly to file
      console.log('📦 Output is raw image bytes, writing to file...');
      fs.writeFileSync(outputPath, finalOutput);
      console.log('✅ Image saved to:', outputPath);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const stats = fs.statSync(outputPath);
      const sizeKB = (stats.size / 1024).toFixed(1);

      console.log(`📊 Size: ${sizeKB} KB`);
      console.log(`⏱️  Duration: ${duration}s`);

      return outputPath;
    }

    // Check if output is an array-like object (numeric keys with number values = raw bytes)
    if (finalOutput && typeof finalOutput === 'object' && !Array.isArray(finalOutput)) {
      const keys = Object.keys(finalOutput);
      if (keys.length > 100 && keys.every(k => /^\d+$/.test(k))) {
        // This looks like raw pixel data - convert to Uint8Array
        console.log('📦 Output is array-like raw byte data, converting...');
        const length = Math.max(...keys.map(Number)) + 1;
        const buffer = Buffer.alloc(length);
        for (const [key, value] of Object.entries(finalOutput)) {
          const index = parseInt(key, 10);
          if (typeof value === 'number') {
            buffer[index] = value;
          }
        }
        fs.writeFileSync(outputPath, buffer);
        console.log('✅ Image saved to:', outputPath);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const stats = fs.statSync(outputPath);
        const sizeKB = (stats.size / 1024).toFixed(1);

        console.log(`📊 Size: ${sizeKB} KB`);
        console.log(`⏱️  Duration: ${duration}s`);

        return outputPath;
      }
    }

    // Check if output is an object with image data in a nested property
    if (finalOutput && typeof finalOutput === 'object') {
      // Try to find image data in common properties
      const outputObj = finalOutput as Record<string, unknown>;
      const imageData =
        outputObj.image instanceof Uint8Array
          ? outputObj.image
          : outputObj.data instanceof Uint8Array
            ? outputObj.data
            : outputObj.output instanceof Uint8Array
              ? outputObj.output
              : outputObj.bytes instanceof Uint8Array
                ? outputObj.bytes
                : null;

      if (imageData) {
        console.log('📦 Found image data in object property, writing to file...');
        fs.writeFileSync(outputPath, imageData);
        console.log('✅ Image saved to:', outputPath);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const stats = fs.statSync(outputPath);
        const sizeKB = (stats.size / 1024).toFixed(1);

        console.log(`📊 Size: ${sizeKB} KB`);
        console.log(`⏱️  Duration: ${duration}s`);

        return outputPath;
      }
    }

    // Handle URL-based responses (for other models)
    let imageUrl: string;

    if (Array.isArray(finalOutput)) {
      imageUrl = String(finalOutput[0]);
    } else if (typeof finalOutput === 'string') {
      imageUrl = finalOutput;
    } else if (finalOutput && typeof finalOutput === 'object') {
      const outputObj = finalOutput as Record<string, unknown>;
      const outputVal = outputObj.output;
      imageUrl =
        (Array.isArray(outputVal) ? String(outputVal[0]) : outputVal ? String(outputVal) : '') ||
        (outputObj.url ? String(outputObj.url) : '') ||
        (outputObj.image ? String(outputObj.image) : '') ||
        (outputObj.image_url ? String(outputObj.image_url) : '');
    }

    if (!imageUrl || typeof imageUrl !== 'string') {
      console.error('❌ Could not extract image URL from output:', finalOutput);
      throw new Error('No image URL returned from Replicate');
    }

    console.log('✅ Image generated!');
    console.log('🔗 Image URL:', imageUrl);
    console.log('⬇️  Downloading...');

    await downloadImage(imageUrl, outputPath);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const stats = fs.statSync(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(1);

    console.log(`\n✅ Image saved to: ${outputPath}`);
    console.log(`📊 Size: ${sizeKB} KB`);
    console.log(`⏱️  Duration: ${duration}s`);

    return outputPath;
  } catch (error) {
    console.error('\n❌ Generation failed:', error);
    throw error;
  }
}

// Parse command line arguments
const prompt = process.argv[2];
const outputPath = process.argv[3] || `./generated-${Date.now()}.png`;
const width = parseInt(process.argv[4] || '1200', 10);
const height = parseInt(process.argv[5] || '630', 10);

if (!prompt) {
  console.log(
    'Usage: yarn tsx scripts/generate-ai-image.ts <prompt> [output-path] [width] [height]'
  );
  console.log('');
  console.log('Examples:');
  console.log('  yarn tsx scripts/generate-ai-image.ts "Modern office with laptop" ./featured.png');
  console.log('  yarn tsx scripts/generate-ai-image.ts "Data visualization" ./chart.png 800 600');
  console.log('');
  console.log('Default dimensions: 1200x630 (social sharing optimized)');
  process.exit(1);
}

generateAIImage(prompt, outputPath, width, height)
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n💥 Error:', err.message);
    process.exit(1);
  });
