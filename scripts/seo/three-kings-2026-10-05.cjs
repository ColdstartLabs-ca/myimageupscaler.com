'use strict';

const OPENING =
  '**Quick answer:** YouTube thumbnails usually look blurry or low quality because the source is below 1280×720, text was rasterized before resizing, the export was heavily compressed, or YouTube recompressed the upload. Fix the source first, use 2560×1440 when possible, keep text and logos crisp, and upscale only genuinely low-resolution images before export.';
const HEADING = '### Prove where the thumbnail loses clarity';
const EVIDENCE = `${HEADING}

**Original → export → YouTube:** compare the same face, text edge, or logo in all three versions at the same displayed size. This is a diagnostic check you can reproduce, not a claim that an upscaler guarantees sharper uploads.

| Where the detail disappears | Evidence to check | Next action |
| :--- | :--- | :--- |
| Original photo or video frame | Inspect the source at 100% zoom: is the face already smeared or the text unreadable? | Recapture or rebuild before enlarging. |
| Exported file only | Compare the export with the layered design at equal size; check blocky edges and resized text. | Re-export from the original and add fresh text after resizing the background. |
| YouTube display only | Compare the uploaded file with the thumbnail shown on your channel and a second device. | Check the displayed size and allow time for the new thumbnail to appear before blaming the source. |

**Pixel proof:** 640×360 enlarged 4× is 2560×1440; it is still below 3840×2160. Changing only DPI metadata does not add pixels. A larger canvas can meet a size target, but it cannot prove that missing face or text detail was recovered.

For standard video thumbnails, [YouTube's current upload guidance](https://support.google.com/youtube/answer/72431?hl=en) recommends **3840×2160**, a **16:9** aspect ratio, and JPG or PNG. The video-thumbnail upload limit is **2 MB on mobile** and **50 MB on desktop**. Check the file dimensions and the limit for the device you actually upload from.

**Decision rule:** upscale a sharp but undersized background, then add text at the final canvas size. If the source is already blurred, rebuild it; do not treat generated facial detail or a bigger file as proof of fidelity.

`;

const BODY_CORRECTIONS = [
  [
    'YouTube recommends uploading thumbnails at 1280x720 pixels in JPG, PNG, or GIF format, with a file size limit of 2MB. Sounds straightforward. But several things can go wrong between your design software and what viewers actually see.',
    'Use the current YouTube requirements in the evidence block above, rather than treating 1280x720 and a universal 2MB cap as the latest recommendation. Several things can go wrong between your design software and what viewers actually see.',
  ],
  [
    '**Screenshot grabs** — Screenshots from phones or compressed video frames often land at 72 DPI, well below what looks sharp on retina displays.',
    '**Screenshot grabs** — A small or compressed frame can lack usable pixels. Check pixel dimensions and visible detail, not its DPI metadata.',
  ],
  ['- Always export at exactly 1280x720 (16:9 ratio)', '- Use a 16:9 canvas and the current recommended dimensions in the evidence block above'],
  ['- If you are over the 2MB limit, try lightly compressed JPG at 80% quality', '- If the export exceeds the limit for your upload device, try a high-quality JPG and inspect text edges again'],
  ["YouTube's recommended size is 1280x720 pixels.", 'YouTube currently recommends the dimensions listed in the evidence block above.'],
  ["You need to meet YouTube's 1280x720 minimum and your image falls short", 'Your sharp source image is smaller than your intended thumbnail canvas'],
  ['YouTube accepts any resolution above 1280x720, so the larger file uploads without issue.', 'Check the upload-device file-size limit as well as dimensions before uploading.'],
  ['The output is an informed reconstruction, not a guess.', 'The output is a model prediction, not evidence that the original missing detail has been recovered.'],
  ['Our [free image upscaler](/free) handles all common thumbnail file types at no cost.', 'Our [image upscaler](/free) accepts supported image formats after signup; free-credit availability varies by region.'],
  ['no account required', 'account required; free-credit availability varies by region'],
];

function applyYoutubeThumbnailRung3(post) {
  if (post.content.includes(HEADING)) throw new Error('evidence module already exists');
  const count = post.content.split(OPENING).length - 1;
  if (count !== 1) throw new Error(`opening anchor count must be 1, got ${count}`);
  const answer = '**Quick answer:** If your YouTube thumbnail looks blurry or low quality, first compare the original image, exported file, and YouTube display at the same size. Re-export when the design is sharp but the file is soft; recapture when the source is already blurred. Upscale only a sharp, undersized background, then add text at the final size. A larger upload does not guarantee a sharper result.';
  let content = post.content.replace(OPENING, answer + '\n\n' + EVIDENCE.trim());
  for (const [previous, replacement] of BODY_CORRECTIONS) {
    content = content.replaceAll(previous, replacement);
  }
  return { ...post, content };
}

module.exports = { applyYoutubeThumbnailRung3, EVIDENCE };
