import { IUpscaleConfig } from '@shared/types/pixelperfect';

export const generatePrompt = (config: IUpscaleConfig): string => {
  // Use custom prompt if in custom mode and a prompt is provided
  if (config.mode === 'custom' && config.customPrompt && config.customPrompt.trim().length > 0) {
    return config.customPrompt;
  }

  // Fallback to 'both' logic if in custom mode but empty prompt, or normal mode logic
  const effectiveMode = config.mode === 'custom' ? 'both' : config.mode;

  // Refined Prompt to avoid IMAGE_RECITATION
  // We frame this as a "Generation" and "Reconstruction" task rather than just "Restoration"
  let prompt =
    'Task: Generate a high-definition version of the provided image with significantly improved quality. ';

  // Mode Selection Logic
  switch (effectiveMode) {
    case 'upscale':
      prompt += `Action: Reconstruct the image at ${config.scale}x resolution (target 2K/4K). Aggressively sharpen edges and hallucinate plausible fine details to remove blur. `;
      break;
    case 'enhance':
      prompt +=
        'Action: Refine the image clarity. Remove all JPEG compression artifacts, grain, and sensor noise. Balance the lighting and color saturation for a professional look. ';
      break;
    case 'both':
    default:
      prompt += `Action: Reconstruct the image at ${config.scale}x resolution. Simultaneously remove noise/artifacts and sharpen fine details. The output must be crisp and photorealistic. `;
      break;
  }

  // Feature Constraints
  if (config.preserveText) {
    prompt +=
      'Constraint: Text and logos MUST remain legible, straight, and spelled correctly. Sharpen the text boundaries. ';
  } else {
    prompt += 'Constraint: Prioritize visual aesthetics. ';
  }

  if (config.enhanceFace) {
    prompt +=
      "Constraint: Enhance facial features naturally (eyes, skin texture) without altering the person's identity. ";
  }

  if (config.denoise) {
    prompt += 'Constraint: Apply strong denoising to smooth out flat areas. ';
  }

  prompt += 'Output: Return ONLY the generated image.';

  return prompt;
};
