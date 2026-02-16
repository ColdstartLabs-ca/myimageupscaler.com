import { describe, it, expect } from 'vitest';
import { buildPrompt, PromptBuilder } from '@server/services/replicate/utils/prompt.builder';
import { DEFAULT_ENHANCEMENT_SETTINGS } from '@shared/types/coreflow.types';

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    enhance: false,
    enhanceFaces: false,
    preserveText: false,
    enhancementSettings: DEFAULT_ENHANCEMENT_SETTINGS,
    scale: 2,
    ...overrides,
  };
}

describe('PromptBuilder — tier customPrompt priority', () => {
  const builder = new PromptBuilder();

  it('should use tier customPrompt when no user instructions provided', () => {
    const tierPrompt = 'Fix the lighting in this image.';
    const ctx = makeContext({ tierPrompt });

    const result = builder.build('seedream', ctx);

    expect(result).toContain('Fix the lighting');
  });

  it('should prefer user customInstructions over tier customPrompt', () => {
    const ctx = makeContext({
      customPrompt: 'Make it black and white',
      tierPrompt: 'Fix the lighting in this image.',
    });

    const result = builder.build('seedream', ctx);

    expect(result).toBe('Make it black and white');
    expect(result).not.toContain('Fix the lighting');
  });

  it('should fall back to model default when tier has no customPrompt', () => {
    const ctx = makeContext(); // no tierPrompt, no customPrompt

    const result = builder.build('seedream', ctx);

    // seedream default prompt
    expect(result).toContain('Improve this image quality');
  });

  it('should NOT append enhancement modifiers when tierPromptOverride is true', () => {
    const tierPrompt = 'Fix the lighting in this image.';
    const ctx = makeContext({
      tierPrompt,
      tierPromptOverride: true,
      enhanceFaces: true,
      preserveText: true,
    });

    const result = builder.build('seedream', ctx);

    expect(result).toBe(tierPrompt);
    expect(result).not.toContain('Enhance facial features');
    expect(result).not.toContain('Preserve');
  });

  it('should merge enhancement modifiers with tier customPrompt when genericPromptOverride is false', () => {
    const tierPrompt = 'Restore this old photo.';
    const ctx = makeContext({
      tierPrompt,
      // tierPromptOverride not set (defaults to false)
      enhanceFaces: true,
      preserveText: true,
    });

    const result = builder.build('seedream', ctx);

    // Tier prompt used as base, generic modifiers appended
    expect(result).toContain('Restore this old photo.');
    expect(result).toContain('Enhance facial features');
    expect(result).toContain('Preserve');
  });

  it('should work via the convenience buildPrompt function', () => {
    const ctx = makeContext({ tierPrompt: 'Custom tier prompt.' });
    const result = buildPrompt('seedream', ctx);

    expect(result).toContain('Custom tier prompt.');
  });

  it('should let basePrompt option override tier prompt', () => {
    const ctx = makeContext({ tierPrompt: 'Tier prompt.' });
    const result = builder.build('seedream', ctx, {
      basePrompt: 'Explicit base override.',
    });

    expect(result).toContain('Explicit base override.');
    expect(result).not.toContain('Tier prompt.');
  });
});
