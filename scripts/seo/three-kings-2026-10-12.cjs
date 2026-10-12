'use strict';

const OPENING =
  '**Quick answer:** The best image upscaling software depends on your workflow: use a free web tool for quick 2x–8x enlargements, or pro desktop software for RAW editing, privacy, batch processing, and print controls. This guide compares 12 free and paid tools for 2026.';
const HEADING = '### Check the evidence before choosing upscaling software';
const ANSWER =
  '**Quick answer:** Choose image upscaling software by the file and workflow you need to deliver. Start with your existing editor for RAW photos; compare desktop print tools for batches and output controls; use a browser tool for a one-off image. For private files, verify that the selected model uses local processing, not a cloud upload. The 12-tool shortlist below is organized by those tradeoffs, not a universal quality winner.';
const EVIDENCE = `${HEADING}

**Use the same source file and the same output dimensions.** Inspect the same text edge, face, and fine texture at equal display size. Reject an enlargement that changes lettering or identity, adds halos, or makes textures look painted. This is a check you can reproduce, not a claim that we benchmarked all 12 tools.

| Your requirement | Evidence to check before paying |
| :--- | :--- |
| RAW editing | Supported file types and whether the enhancement fits your existing catalog or editor. |
| Large prints and batches | Target pixels, export naming, sharpening controls, and batch output; [ON1 lists print and batch features](https://www.on1.com/products/resize-ai/), which are workflow features rather than proof of superior image quality. |
| Private images | The specific model's local/cloud processing path. A desktop app alone does not prove offline processing; [Topaz lists both local and cloud rendering](https://www.topazlabs.com/topaz-gigapixel). |
| Subscription or free tier | Renewal commitment, download limits, watermark policy, and the credits needed for your actual output size. Check current terms before uploading or subscribing. |

**PNG is a file format, not an upscaling algorithm.** The [W3C PNG specification](https://www.w3.org/TR/png-3/) describes lossless image storage and optional transparency. Choose the model for the image content, then verify that the exported PNG retains any transparency you need. Saving a blurred image as PNG does not restore missing detail.

**Resolution proof:** 4000×3000 enlarged 2× becomes 8000×6000: twice each side and four times the pixel count. The extra pixels establish output size, not recovered factual detail. Review the result before printing or sending a batch to a client.

For free-tier comparisons rather than software workflow, use our [dedicated free image upscaler comparison](/blog/best-free-ai-image-upscaler-2026-tested-compared).
`;

function applyBestImageUpscalerRung3(post) {
  if (post.content.includes(HEADING)) throw new Error('evidence module already exists');
  const count = post.content.split(OPENING).length - 1;
  if (count !== 1) throw new Error(`opening anchor count must be 1, got ${count}`);
  let content = post.content.replace(OPENING, ANSWER + '\n\n' + EVIDENCE.trim());
  content = content.replaceAll(
    '**10 free credits**',
    '**free credits where available** (availability varies by region)'
  );
  content = content.replaceAll(
    'The free trial is limited to 10 credits, after which you would need a',
    'Account required; free-credit availability varies by region. After your credits are used, you would need a'
  );
  content = content.replaceAll(
    'The free trial is limited to 10 credits.',
    'Account required; free-credit availability varies by region.'
  );
  content = content.replaceAll(
    'and use your 10 free credits today.',
    'and check the free-credit availability for your region.'
  );
  return { ...post, content };
}

module.exports = { applyBestImageUpscalerRung3, EVIDENCE };
