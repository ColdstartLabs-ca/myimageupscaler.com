/**
 * Model descriptions for the LLM prompt
 * Maps each model to its description for the vision model
 */
export const MODEL_DESCRIPTIONS = {
  'real-esrgan': {
    credits: 1,
    description:
      'Fast general upscaler. Best for clean images that just need higher resolution. No face enhancement.',
    canUpscale: true,
  },
  gfpgan: {
    credits: 2,
    description:
      'Face restoration + upscaling. Best for portraits, old family photos, any image with faces that need enhancement.',
    canUpscale: true,
  },
  'nano-banana': {
    credits: 2,
    description:
      'Text/logo preserving upscaler. Best for documents, screenshots, marketing materials, images with text.',
    canUpscale: true,
  },
  'clarity-upscaler': {
    credits: 4,
    description:
      'Premium face restoration + upscaling. Higher quality than gfpgan for portraits and photos with people.',
    canUpscale: true,
  },
  'nano-banana-pro': {
    credits: 8,
    description:
      'Premium all-purpose upscaler. Highest quality, supports 4K/8K output. Best for professional work requiring maximum detail.',
    canUpscale: true,
  },
  'flux-2-pro': {
    credits: 5,
    description:
      'Premium face enhancement (NO upscaling). Use when faces need restoration but resolution is already adequate.',
    canUpscale: false,
  },
  'qwen-image-edit': {
    credits: 3,
    description:
      'AI enhancement (NO upscaling). Good for noise reduction and general quality improvement without resolution increase.',
    canUpscale: false,
  },
  seedream: {
    credits: 3,
    description:
      'AI enhancement (NO upscaling). Strong spatial understanding. Best for general photo enhancement, denoising, artifact removal.',
    canUpscale: false,
  },
  'realesrgan-anime': {
    credits: 2,
    description:
      'Anime/illustration upscaler. ONLY use for anime, manga, cartoons, digital illustrations, pixel art.',
    canUpscale: true,
  },
} as const;

/**
 * Maps issue types to enhancement prompt phrases
 */
export const ISSUE_TYPE_PROMPTS = {
  blur: 'sharpen and restore detail',
  noise: 'reduce noise while preserving detail',
  damage: 'repair damaged areas',
  faces: 'restore facial features',
  compression: 'remove compression artifacts',
} as const;

export const DEFAULT_ENHANCEMENT_PROMPT = 'Upscale and enhance image quality';

/**
 * Prompt template sections
 */
export const PROMPT_TEMPLATES = {
  preamble:
    'You are an expert image quality analyst. Analyze this image to recommend the best restoration approach.',

  upscalingHeader: 'UPSCALING MODELS (increase resolution):',
  enhancementHeader: 'ENHANCEMENT-ONLY MODELS (improve quality, same resolution):',

  rules: `ANALYSIS RULES:
1. Detect content type: Is this a photo, portrait (faces), document/text, anime/illustration, vintage photo, or product shot?
2. Identify quality issues: blur, noise, compression artifacts, physical damage, low resolution
3. Match the best model:
   - Faces/portraits → use face restoration models (gfpgan, clarity-upscaler)
   - Text/documents → use text-preserving model (nano-banana)
   - Anime/illustrations → use realesrgan-anime (ONLY for animated/drawn content)
   - Clean image needing bigger size → use real-esrgan (cheapest, fast)
   - Noisy/compressed but resolution OK → use enhancement-only models (seedream, qwen-image-edit)
   - Premium quality needed → use higher-credit models
4. IMPORTANT: Don't over-process. If an image is clean and just needs upscaling, recommend the basic upscaler.
5. Balance quality vs cost: recommend cheaper models when they'll produce similar results.`,

  responseFormat: `Respond with ONLY valid JSON:
{
  "issues": [
    {"type": "blur", "severity": "medium", "description": "Soft focus throughout image"},
    {"type": "noise", "severity": "low", "description": "Minor grain visible in shadows"}
  ],
  "contentType": "photo|portrait|document|vintage|product|artwork|anime",
  "recommendedModel": "model-id-here",
  "reasoning": "One sentence explaining why this model is best for this specific image",
  "confidence": 0.85,
  "alternatives": ["other-model-id"],
  "enhancementPrompt": "Detailed enhancement instructions"
}`,

  issueTypes: `ISSUE TYPES (use one type per issue, create multiple issues if needed):
- blur: Image lacks sharpness, soft focus
- noise: Visible grain, sensor noise, film grain
- compression: JPEG artifacts, blocking, banding
- damage: Scratches, tears, stains, physical damage
- low_resolution: Image is small/pixelated, needs upscaling
- faces: Contains faces that would benefit from restoration
- text: Contains text/logos that must be preserved`,

  guidelines: `enhancementPrompt GUIDELINES:
- Be specific about what to fix based on the actual image content
- Mention specific areas if relevant: "Remove artifacts in upper left, restore faded colors"
- Keep natural: "Enhance while preserving natural textures" not "make perfect"`,

  // Enhancement-only mode (when user has already selected a tier)
  enhancementOnlyRules: `ANALYSIS RULES (Enhancement Only Mode):
1. Detect content type: Is this a photo, portrait (faces), document/text, anime/illustration, vintage photo, or product shot?
2. Identify quality issues: blur, noise, compression artifacts, physical damage, low resolution
3. DO NOT recommend a model - the user has already selected one.
4. Focus on what enhancements would help this specific image.
5. Provide detailed enhancement instructions based on the actual issues detected.`,

  enhancementOnlyResponseFormat: `Respond with ONLY valid JSON:
{
  "issues": [
    {"type": "blur", "severity": "medium", "description": "Soft focus throughout image"},
    {"type": "noise", "severity": "low", "description": "Minor grain visible in shadows"}
  ],
  "contentType": "photo|portrait|document|vintage|product|artwork|anime",
  "confidence": 0.85,
  "enhancementPrompt": "Detailed enhancement instructions for this specific image"
}

NOTE: Do NOT include recommendedModel, reasoning, or alternatives fields - the user has already selected their model.`,
} as const;
