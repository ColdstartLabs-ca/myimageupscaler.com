'use strict';

const fs = require('node:fs');

const BEST_FREE_CURRENT_H1 = '# Best Free AI Image Upscaler 2026: Only 3 Worked';
const BEST_FREE_PRIOR_H1 = '# Best Free AI Image Upscaler Online 2026: 12 Tested';
const BEST_FREE_PRIOR_DESCRIPTION =
  'Best free AI image upscaler 2026: we tested 12 tools for quality, speed, no signup, no watermark, and 4K/8K output. See winners and try free.';
const PIXELATED_CURRENT_OPENING =
  'To fix pixelated photos online, use a 2x or 4x AI upscale before sharpening. Pixelation is usually a missing-resolution problem, so a normal sharpen filter often makes the square blocks harsher. The clean workflow is: identify whether the source is small, compressed, cropped, or scanned; enlarge it with an AI upscaler; inspect faces, text, and edges at 100%; then sharpen only if the upscaled result is still soft.';
const PIXELATED_PRIOR_OPENING =
  'To fix pixelated photos, start by upscaling the image, then reduce blocky edges with AI sharpening or deblurring. Pixelation is usually a resolution problem, so a normal sharpen filter often makes the square edges harsher. The clean workflow is simple: identify why the photo became pixelated, enlarge it with an AI upscaler, check faces and edges at 100%, then export at the size you actually need.';
const PIXELATED_PRIOR_DESCRIPTION =
  'Learn how to fix pixelated photos online in 3 steps: upscale, sharpen, or rescan blocky images, then try the free AI upscaler.';

function removeH2Section(content, heading) {
  const marker = `## ${heading}`;
  const start = content.indexOf(marker);
  if (start < 0) throw new Error(`expected section not found: ${heading}`);

  const rest = content.slice(start + marker.length);
  const nextHeading = rest.search(/^##\s+/m);
  if (nextHeading < 0) throw new Error(`expected following H2 after: ${heading}`);

  const end = start + marker.length + nextHeading;
  return `${content.slice(0, start).trimEnd()}\n\n${content.slice(end).trimStart()}`;
}

function assertCreditTruth(content) {
  if (/10 free credits/i.test(content)) {
    throw new Error('repair would retain stale 10 free credits copy');
  }
}

function repairPost(post) {
  const repaired = { ...post };

  if (post.slug === 'best-free-ai-image-upscaler-2026-tested-compared') {
    if (!post.content.startsWith(BEST_FREE_CURRENT_H1)) {
      throw new Error('expected current H1 for best-free regression repair');
    }
    repaired.description = BEST_FREE_PRIOR_DESCRIPTION;
    repaired.seo_description = BEST_FREE_PRIOR_DESCRIPTION;
    repaired.content = removeH2Section(
      post.content.replace(BEST_FREE_CURRENT_H1, BEST_FREE_PRIOR_H1),
      'What Our 2026 Test Actually Found'
    );
  } else if (post.slug === 'fixing-pixelated-photos') {
    if (!post.content.startsWith(PIXELATED_CURRENT_OPENING)) {
      throw new Error('expected current opening for pixelated-photo regression repair');
    }
    repaired.description = PIXELATED_PRIOR_DESCRIPTION;
    repaired.seo_description = PIXELATED_PRIOR_DESCRIPTION;
    repaired.content = removeH2Section(
      post.content.replace(PIXELATED_CURRENT_OPENING, PIXELATED_PRIOR_OPENING),
      'What Actually Works on Pixelated Photos'
    );
  } else if (post.slug === 'photo-restoration-program') {
    repaired.content = removeH2Section(post.content, 'Best Photo Restoration Programs Compared');
  } else {
    throw new Error(`unsupported regression repair slug: ${post.slug}`);
  }

  assertCreditTruth(repaired.content);
  if (repaired.content.length < 100)
    throw new Error(`repaired content is unexpectedly short: ${post.slug}`);
  return repaired;
}

function main(argv) {
  const [inputPath, outputPath] = argv;
  if (!inputPath || !outputPath) {
    throw new Error('usage: node three-kings-regression-repair.cjs <input.json> <output.json>');
  }
  const posts = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(posts) || posts.length !== 3) {
    throw new Error('expected exactly three production blog posts');
  }
  const repaired = posts.map(repairPost);
  fs.writeFileSync(outputPath, JSON.stringify(repaired));
  for (const post of repaired) {
    console.log(`${post.slug}: repaired content length ${post.content.length}`);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { repairPost, removeH2Section };
