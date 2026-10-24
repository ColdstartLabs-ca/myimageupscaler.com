'use strict';

const BEST_IMAGE_UPSCALER_PRIOR_SEO_DESCRIPTION =
  'Compare 12 image upscaling tools for 2026, including free web apps and pro software. See output limits, pricing tradeoffs, and the best fit for your workflow.';

const BEST_AI_UPSCALER_ANCHOR =
  'This comparison ranks each AI upscaler by output quality, artifacts, free limits, speed, privacy, and best use case so you can choose the right tool before uploading an image.\n\n';

const BEST_AI_UPSCALER_EVIDENCE = `### What the 12-tool comparison checks

This ranking uses four real image jobs — portraits, artwork, product photos, and scanned family pictures — instead of treating every upscaler as interchangeable.

| Evidence check | What to inspect before choosing |
| :--- | :--- |
| Detail fidelity | Do faces, text, edges, and product shapes stay faithful to the source? |
| Artifacts | Look for plastic skin, invented texture, halos, warped letters, and oversharpened edges. |
| Workflow limits | Compare free output limits, processing speed, privacy, batch support, and installation requirements. |
| Best-fit use case | Restoration tools should preserve the source; creative tools may intentionally generate new detail. |

**Decision rule:** choose the tool that preserves the details your image already has. Treat extra invented texture as a creative effect, not proof of better restoration.

`;

const TOPAZ_VIDEO_ANCHOR =
  'Topaz is still the serious option for controlled restoration, stabilization, frame interpolation, and high-quality video enhancement, but it is not always the fastest or cheapest path for a one-off clip.\n\n';

const TOPAZ_VIDEO_EVIDENCE = `### Direct answer: Topaz Video vs Topaz Video Pro

Topaz Video and Topaz Video Pro are license tiers of the same core application, not two unrelated upscalers. Choose **Personal** for a single-user workflow with standard video models and limited commercial use. Choose **Pro** when a team needs pro-only model access, seat management, full commercial licensing, more included cloud credits, or multi-GPU rendering. Check the current [Topaz Video plan comparison](https://www.topazlabs.com/video-pro) before buying because plan details can change.

| Search term | What it means now |
| :--- | :--- |
| Topaz Video AI / Topaz Video | The current desktop video enhancement application. |
| Topaz Video Pro | The Pro license tier with team, licensing, model-access, and rendering advantages. |
| Video Enhance AI | The legacy product name that Topaz renamed and rebuilt as Topaz Video AI in 2022. |

**Practical rule:** output quality is not automatically better just because the license says Pro. Buy Pro for its workflow, licensing, model-access, and hardware features; compare footage with the same model and settings when judging image quality.

`;

function insertOnce(content, anchor, addition, label) {
  if (content.includes(addition.trim())) {
    throw new Error(`${label} evidence module already exists`);
  }
  const occurrences = content.split(anchor).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label} anchor count must be 1, got ${occurrences}`);
  }
  return content.replace(anchor, anchor + addition);
}

function applyBestAiUpscalerRung3(post) {
  return {
    ...post,
    content: insertOnce(
      post.content,
      BEST_AI_UPSCALER_ANCHOR,
      BEST_AI_UPSCALER_EVIDENCE,
      'best-ai-upscaler'
    ),
  };
}

function applyTopazVideoUpscalerRung3(post) {
  return {
    ...post,
    content: insertOnce(
      post.content,
      TOPAZ_VIDEO_ANCHOR,
      TOPAZ_VIDEO_EVIDENCE,
      'topaz-video-upscaler'
    ),
  };
}

function revertBestImageUpscalerRung2(post) {
  return {
    ...post,
    seo_description: BEST_IMAGE_UPSCALER_PRIOR_SEO_DESCRIPTION,
  };
}

module.exports = {
  BEST_IMAGE_UPSCALER_PRIOR_SEO_DESCRIPTION,
  BEST_AI_UPSCALER_EVIDENCE,
  TOPAZ_VIDEO_EVIDENCE,
  applyBestAiUpscalerRung3,
  applyTopazVideoUpscalerRung3,
  revertBestImageUpscalerRung2,
};
