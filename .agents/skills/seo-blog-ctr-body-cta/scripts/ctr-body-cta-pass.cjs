#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  })
);

const gscPath = String(args.gsc || '');
const shouldApply = Boolean(args.apply);
const dryRun = Boolean(args['dry-run']) || !shouldApply;
const minImpressions = Number(args['min-impressions'] || 1000);
const maxCtr = Number(args['max-ctr'] || 0.0025);
const maxPages = Number(args['max-pages'] || 20);
const includeLowPosition = Boolean(args['include-low-position']);

if (!gscPath || !fs.existsSync(gscPath)) {
  console.error('Usage: ctr-body-cta-pass.cjs --gsc=/tmp/ctr.json [--dry-run|--apply]');
  process.exit(2);
}

function readApiKey() {
  const envPath = path.resolve('.env.api');
  if (!fs.existsSync(envPath)) return '';
  return fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((line) => line.startsWith('BLOG_API_KEY='))
    ?.replace('BLOG_API_KEY=', '')
    .trim() || '';
}

function canonicalSlug(rawUrl) {
  const url = String(rawUrl || '').split('#')[0].replace(/\/$/, '');
  const marker = '/blog/';
  const idx = url.indexOf(marker);
  if (idx === -1) return '';
  return url.slice(idx + marker.length);
}

function getRows(gsc) {
  return gsc.allCtrDeficitPages || gsc.pages || gsc.rows || [];
}

function candidatesFromGsc(gsc) {
  const bySlug = new Map();
  for (const row of getRows(gsc)) {
    const slug = canonicalSlug(row.url || row.page);
    if (!slug) continue;
    const impressions = Number(row.impressions || 0);
    const ctr = Number(row.ctr || 0);
    const position = Number(row.position || row.avgPosition || 0);
    if (impressions < minImpressions || ctr > maxCtr) continue;
    if (!includeLowPosition && position && (position < 4 || position > 15)) continue;
    const normalized = {
      slug,
      url: `https://myimageupscaler.com/blog/${slug}`,
      clicks: Number(row.clicks || 0),
      impressions,
      ctr,
      position,
      missedClicks: Number(row.missedClicks || row.estimatedMissedClicks || 0),
    };
    const prev = bySlug.get(slug);
    if (!prev || normalized.missedClicks > prev.missedClicks || normalized.impressions > prev.impressions) {
      bySlug.set(slug, normalized);
    }
  }
  return [...bySlug.values()]
    .sort((a, b) => b.missedClicks - a.missedClicks || b.impressions - a.impressions)
    .slice(0, maxPages);
}

function inferKind(slug, title = '') {
  const haystack = `${slug} ${title}`.toLowerCase();
  if (haystack.includes('pixelated') || haystack.includes('pixelation')) return 'pixelated';
  if (haystack.includes('video') || haystack.includes('topaz-video')) return 'video';
  if (haystack.includes('print') || haystack.includes('dpi') || haystack.includes('poster')) return 'print';
  if (haystack.includes('blur')) return 'photoEnhance';
  if (haystack.includes('denoise') || haystack.includes('noise')) return 'denoise';
  if (haystack.includes('restore') || haystack.includes('restoration')) return 'restore';
  if (haystack.includes('stable-diffusion') || haystack.includes('midjourney')) return 'aiArt';
  if (haystack.includes('resolution')) return 'resolution';
  if (haystack.includes('enhancer')) return 'photoEnhance';
  return 'upscaler';
}

function blocks(kind) {
  const map = {
    pixelated: [
      '[Try the AI image upscaler](/tools/ai-image-upscaler) if you want to test a pixelated photo before reading the full guide. Upload once, compare the 2x and 4x result, then keep the cleaner export.\n\n> [!CTA_TRY]\n',
      '> [!CTA_DEMO]\n\nUse this as the checkpoint: if your photo still looks blocky after the 2x test, rerun it at 4x and inspect faces, edges, and text at 100% zoom before applying any extra sharpening.\n',
    ],
    video: [
      '[Try the AI image upscaler on a frame](/tools/ai-image-upscaler) before committing to a paid video workflow. Export one representative frame, upscale it, and use the result to judge whether AI restoration is worth the full render.\n\n> [!CTA_TRY]\n',
      '> [!CTA_DEMO]\n\nFor a quick video-quality check, grab a still frame from the clip, upscale it, and compare edges, faces, and compression blocks before paying for heavier video software.\n',
    ],
    print: [
      '[Try the AI image upscaler for print](/tools/ai-image-upscaler) if your image is smaller than the pixel chart below. Upscale first, then match the download to your target print size.\n\n> [!CTA_TRY]\n',
      '> [!CTA_DEMO]\n\nBefore sending the file to print, upload a copy to the upscaler, choose the smallest scale that clears your target pixel dimensions, and check the result at 100% zoom.\n',
    ],
    photoEnhance: [
      '[Try the AI photo enhancer](/tools/ai-photo-enhancer) if your image needs more than simple resizing. It can combine upscaling, sharpening, and cleanup in one browser workflow.\n\n> [!CTA_TRY]\n',
      '> [!CTA_DEMO]\n\nUse one test image first: if the enhanced version improves faces, edges, and texture without looking artificial, apply the same settings to the rest of the set.\n',
    ],
    denoise: [
      '[Try the AI photo enhancer](/tools/ai-photo-enhancer) on a noisy image before buying denoise software. Start with a light cleanup so texture does not become waxy.\n\n> [!CTA_TRY]\n',
      '> [!CTA_DEMO]\n\nA good denoise pass should reduce grain while keeping hair, fabric, and edge detail. Upload one sample, compare at 100% zoom, then batch similar photos.\n',
    ],
    restore: [
      '[Try AI photo restoration](/tools/ai-photo-enhancer) on one scanned photo first. Use the result to decide whether the image needs upscaling, face restoration, denoise, or a manual repair workflow.\n\n> [!CTA_TRY]\n',
      '> [!CTA_DEMO]\n\nFor old photos, test a single face or high-detail scan before processing the whole archive. The best result keeps natural texture while reducing blur, grain, and pixelation.\n',
    ],
    aiArt: [
      '[Try the AI image upscaler](/tools/ai-image-upscaler) on one AI image before changing your generation workflow. A 2x or 4x upscale is often faster than regenerating from scratch.\n\n> [!CTA_TRY]\n',
      '> [!CTA_DEMO]\n\nFor AI art, inspect fine texture, hands, eyes, and typography after upscaling. If those areas hold up, the image is usually ready for web or print prep.\n',
    ],
    resolution: [
      '[Try the AI image upscaler](/tools/ai-image-upscaler) if the resolution check shows your image is too small. Upscale first, then export for web, social, or print at the size you actually need.\n\n> [!CTA_TRY]\n',
      '> [!CTA_DEMO]\n\nIf the pixel dimensions are below your target, test a 2x upscale first. Use 4x only when the image needs a larger print, crop, or high-resolution layout.\n',
    ],
    upscaler: [
      '[Try the AI image upscaler](/tools/ai-image-upscaler) with one real image before comparing every tool. You can upload, upscale, and inspect the export in seconds.\n\n> [!CTA_TRY]\n',
      '> [!CTA_DEMO]\n\nThe fastest way to choose an upscaler is to test the same image in your browser, then compare detail, edge halos, watermarks, and download quality side by side.\n',
    ],
  };
  return map[kind] || map.upscaler;
}

function insertAfterNthH2(content, insertion, n) {
  if (content.includes(insertion.trim().split('\n')[0])) return content;
  const matches = [...content.matchAll(/^##\s+.+$/gm)];
  const target = matches[n - 1] || matches[0];
  if (!target) return `${content.trimEnd()}\n\n${insertion.trimEnd()}\n`;
  const next = content.indexOf('\n## ', target.index + target[0].length);
  const pos = next === -1 ? content.length : next;
  return `${content.slice(0, pos).trimEnd()}\n\n${insertion.trimEnd()}\n\n${content.slice(pos).trimStart()}`;
}

function insertBlocks(content, kind) {
  const [tryBlock, demoBlock] = blocks(kind);
  let next = content;
  if (!next.includes('[!CTA_TRY]')) next = insertAfterNthH2(next, tryBlock, 1);
  if (!next.includes('[!CTA_DEMO]')) next = insertAfterNthH2(next, demoBlock, 4);
  return next;
}

async function fetchApiPost(slug, apiKey) {
  if (!apiKey) return null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await fetch(`https://myimageupscaler.com/api/blog/posts/${slug}`, {
      headers: { 'x-api-key': apiKey },
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success && json.data?.content) return json.data;
    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(json?.details?.retryAfter || res.headers.get('retry-after') || 5);
      await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
      continue;
    }
    if (res.status === 404) return null;
    return { __fetchError: true, status: res.status, response: json };
  }
  return null;
}

async function patchApiPost(slug, content, apiKey) {
  const res = await fetch(`https://myimageupscaler.com/api/blog/posts/${slug}`, {
    method: 'PATCH',
    headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) throw new Error(`${slug} API PATCH failed ${res.status}`);
  return json.data;
}

async function main() {
  const gsc = JSON.parse(fs.readFileSync(gscPath, 'utf8'));
  const candidates = candidatesFromGsc(gsc);
  const apiKey = readApiKey();
  const staticPath = path.resolve('content/blog-data.json');
  const staticData = fs.existsSync(staticPath) ? JSON.parse(fs.readFileSync(staticPath, 'utf8')) : { posts: [] };
  const results = [];

  for (const candidate of candidates) {
    let post = await fetchApiPost(candidate.slug, apiKey);
    let source = 'api';
    if (!post) {
      post = staticData.posts?.find((item) => item.slug === candidate.slug);
      source = post ? 'static' : 'missing';
    }
    if (post?.__fetchError) {
      results.push({ ...candidate, status: 'fetch_error', http: post.status });
      continue;
    }
    if (!post) {
      results.push({ ...candidate, status: 'missing' });
      continue;
    }

    const kind = inferKind(candidate.slug, post.title);
    const content = post.content || '';
    const nextContent = insertBlocks(content, kind);
    if (nextContent === content) {
      results.push({ ...candidate, source, kind, status: 'unchanged' });
      continue;
    }

    if (dryRun) {
      results.push({ ...candidate, source, kind, status: 'would_update' });
      continue;
    }

    if (source === 'api') {
      const updated = await patchApiPost(candidate.slug, nextContent, apiKey);
      results.push({ ...candidate, source, kind, status: 'updated', updated_at: updated.updated_at });
    } else {
      post.content = nextContent;
      results.push({ ...candidate, source, kind, status: 'updated_static' });
    }
  }

  if (shouldApply && staticData.posts?.some((post) => candidates.some((item) => item.slug === post.slug))) {
    fs.writeFileSync(staticPath, `${JSON.stringify(staticData, null, 2)}\n`);
  }

  console.log(JSON.stringify({ dryRun, minImpressions, maxCtr, count: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
