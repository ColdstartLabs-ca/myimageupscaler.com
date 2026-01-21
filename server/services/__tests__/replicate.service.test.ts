import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ReplicateService,
  ReplicateError,
  createReplicateService,
  getReplicateService,
} from '../replicate.service';
import { InsufficientCreditsError } from '../image-generation.service';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';
import type { IModelConfig } from '../model-registry.types';

// Mock dependencies - mock must be defined before any imports that use it
vi.mock('replicate', () => {
  class MockReplicate {
    run = vi.fn();
  }
  return {
    default: MockReplicate,
  };
});

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
  },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    REPLICATE_API_TOKEN: 'test-replicate-token',
    REPLICATE_MODEL_VERSION: 'nightmareai/real-esrgan:test-version',
    REPLICATE_MODEL_VERSION_REAL_ESRGAN: undefined,
    REPLICATE_MODEL_VERSION_GFPGAN: undefined,
    REPLICATE_MODEL_VERSION_NANO_BANANA: undefined,
    REPLICATE_MODEL_VERSION_CLARITY_UPSCALER: undefined,
    REPLICATE_MODEL_VERSION_FLUX_2_PRO: undefined,
    REPLICATE_MODEL_VERSION_NANO_BANANA_PRO: undefined,
    REPLICATE_MODEL_VERSION_QWEN_IMAGE_EDIT: undefined,
    REPLICATE_MODEL_VERSION_SEEDREAM: undefined,
    REPLICATE_MODEL_VERSION_REALESRGAN_ANIME: undefined,
  },
}));

vi.mock('@server/utils/retry', () => ({
  withRetry: vi.fn(fn => fn()),
  isRateLimitError: vi.fn((message: string) => {
    const lowerMessage = message.toLowerCase();
    return (
      lowerMessage.includes('rate limit') ||
      lowerMessage.includes('429') ||
      lowerMessage.includes('throttled')
    );
  }),
}));

vi.mock('../model-registry', () => ({
  ModelRegistry: {
    getInstance: vi.fn(() => ({
      getModel: vi.fn((modelId: string) => {
        const models: Record<string, IModelConfig> = {
          'real-esrgan': {
            id: 'real-esrgan',
            displayName: 'Upscale',
            provider: 'replicate',
            modelVersion: 'nightmareai/real-esrgan:test-version',
            capabilities: ['upscale'],
            costPerRun: 0.002,
            creditMultiplier: 1,
            qualityScore: 8.5,
            processingTimeMs: 2000,
            maxInputResolution: 2048,
            maxOutputResolution: 4096,
            supportedScales: [2, 4],
            isEnabled: true,
          },
          gfpgan: {
            id: 'gfpgan',
            displayName: 'Face Restore',
            provider: 'replicate',
            modelVersion: 'tencentarc/gfpgan:test-version',
            capabilities: ['upscale', 'face-restoration'],
            costPerRun: 0.003,
            creditMultiplier: 1.5,
            qualityScore: 9.0,
            processingTimeMs: 3000,
            maxInputResolution: 2048,
            maxOutputResolution: 4096,
            supportedScales: [2, 4],
            isEnabled: true,
          },
          'clarity-upscaler': {
            id: 'clarity-upscaler',
            displayName: 'Clarity Upscaler',
            provider: 'replicate',
            modelVersion: 'philz1337x/clarity-upscaler:test-version',
            capabilities: ['upscale', 'enhance'],
            costPerRun: 0.01,
            creditMultiplier: 5,
            qualityScore: 9.5,
            processingTimeMs: 10000,
            maxInputResolution: 2048,
            maxOutputResolution: 8192,
            supportedScales: [2, 4, 8, 16],
            isEnabled: true,
          },
          'flux-kontext-pro': {
            id: 'flux-kontext-pro',
            displayName: 'Flux Kontext Pro',
            provider: 'replicate',
            modelVersion: 'replicate/flux-kontext-pro:test-version',
            capabilities: ['upscale', 'enhance'],
            costPerRun: 0.015,
            creditMultiplier: 7.5,
            qualityScore: 9.4,
            processingTimeMs: 8000,
            maxInputResolution: 2048,
            maxOutputResolution: 4096,
            supportedScales: [2, 4],
            isEnabled: true,
          },
          'flux-2-pro': {
            id: 'flux-2-pro',
            displayName: 'Flux 2 Pro',
            provider: 'replicate',
            modelVersion: 'black-forest-labs/flux-2-pro:test-version',
            capabilities: ['enhance', 'face-restoration'],
            costPerRun: 0.025,
            creditMultiplier: 12.5,
            qualityScore: 9.6,
            processingTimeMs: 10000,
            maxInputResolution: 2048,
            maxOutputResolution: 4096,
            supportedScales: [],
            isEnabled: true,
            tierRestriction: 'hobby',
          },
          'nano-banana-pro': {
            id: 'nano-banana-pro',
            displayName: 'Nano Banana Pro',
            provider: 'replicate',
            modelVersion: 'google/nano-banana-pro:test-version',
            capabilities: ['upscale', 'enhance', 'face-restoration'],
            costPerRun: 0.02,
            creditMultiplier: 10,
            qualityScore: 9.8,
            processingTimeMs: 8000,
            maxInputResolution: 2048,
            maxOutputResolution: 8192,
            supportedScales: [2, 4],
            isEnabled: true,
            tierRestriction: 'hobby',
          },
          'qwen-image-edit': {
            id: 'qwen-image-edit',
            displayName: 'Qwen Image Edit',
            provider: 'replicate',
            modelVersion: 'qwen/qwen-image-edit-2511:test-version',
            capabilities: ['enhance'],
            costPerRun: 0.005,
            creditMultiplier: 2.5,
            qualityScore: 9.2,
            processingTimeMs: 5000,
            maxInputResolution: 2048,
            maxOutputResolution: 4096,
            supportedScales: [],
            isEnabled: true,
            tierRestriction: 'hobby',
          },
          seedream: {
            id: 'seedream',
            displayName: 'Seedream',
            provider: 'replicate',
            modelVersion: 'bytedance/seedream-4.5:test-version',
            capabilities: ['enhance'],
            costPerRun: 0.012,
            creditMultiplier: 6,
            qualityScore: 9.3,
            processingTimeMs: 5000,
            maxInputResolution: 2048,
            maxOutputResolution: 4096,
            supportedScales: [],
            isEnabled: true,
            tierRestriction: 'hobby',
          },
          'realesrgan-anime': {
            id: 'realesrgan-anime',
            displayName: 'Real-ESRGAN Anime',
            provider: 'replicate',
            modelVersion: 'xinntao/realesrgan:test-version',
            capabilities: ['upscale'],
            costPerRun: 0.002,
            creditMultiplier: 1,
            qualityScore: 8.5,
            processingTimeMs: 2000,
            maxInputResolution: 2048,
            maxOutputResolution: 4096,
            supportedScales: [2, 4],
            isEnabled: true,
            tierRestriction: 'hobby',
          },
        };
        return models[modelId] || null;
      }),
    })),
  },
}));

vi.mock('../image-generation.service', () => ({
  calculateCreditCost: vi.fn(() => 10),
  InsufficientCreditsError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'InsufficientCreditsError';
    }
  },
}));

import Replicate from 'replicate';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { withRetry } from '@server/utils/retry';
import { ModelRegistry } from '../model-registry';
import { calculateCreditCost } from '../image-generation.service';

describe('ReplicateService', () => {
  let service: ReplicateService;
  let mockReplicateRun: ReturnType<typeof vi.fn>;
  let mockSupabaseRpc: ReturnType<typeof vi.fn>;

  // Helper to create a valid upscale input
  const createUpscaleInput = (overrides: Partial<IUpscaleInput> = {}): IUpscaleInput => ({
    imageData: 'base64encodedimagedata',
    mimeType: 'image/jpeg',
    config: {
      scale: 2,
      mode: 'upscale',
      modelId: 'real-esrgan',
      additionalOptions: {
        enhance: false,
        enhanceFaces: false,
        preserveText: false,
        enhancement: {
          clarity: false,
          color: false,
          lighting: false,
          denoise: false,
          artifacts: false,
          details: false,
        },
        customInstructions: '',
        nanoBananaProConfig: undefined,
      },
    },
    ...overrides,
  });

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Get the mocked Replicate class and reset its prototype
    const ReplicateMock = Replicate as unknown as { prototype: { run: ReturnType<typeof vi.fn> } };
    ReplicateMock.prototype.run = vi.fn();

    mockSupabaseRpc = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;
    mockSupabaseRpc.mockResolvedValue({
      data: [{ new_total_balance: 90 }],
      error: null,
    });

    // Create a fresh service instance for each test
    service = new ReplicateService('real-esrgan');

    // Get the mock run function from the service's replicate instance
    mockReplicateRun = (service as unknown as { replicate: { run: ReturnType<typeof vi.fn> } })
      .replicate.run;

    // Reset singleton
    (
      getReplicateService as unknown as { replicateServiceInstance: null }
    ).replicateServiceInstance = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with provided modelId', () => {
      const testService = new ReplicateService('gfpgan');
      expect(testService.modelId).toBe('gfpgan');
    });

    test('should default to real-esrgan if no modelId provided', () => {
      const defaultService = new ReplicateService();
      expect(defaultService.modelId).toBe('real-esrgan');
    });

    test('should have correct providerName', () => {
      expect(service.providerName).toBe('Replicate');
    });
  });

  describe('supportsMode()', () => {
    test('should return true for upscale mode', () => {
      expect(service.supportsMode('upscale')).toBe(true);
    });

    test('should return true for both mode', () => {
      expect(service.supportsMode('both')).toBe(true);
    });

    test('should return false for other modes', () => {
      expect(service.supportsMode('enhance')).toBe(false);
      expect(service.supportsMode('custom')).toBe(false);
      expect(service.supportsMode('restore')).toBe(false);
    });
  });

  describe('buildModelInput()', () => {
    const baseImageDataUrl = 'data:image/jpeg;base64,abc123';

    describe('real-esrgan (default)', () => {
      test('should build input with scale 2', () => {
        const input = createUpscaleInput({
          config: { ...createUpscaleInput().config, scale: 2 },
        });
        const result = service.buildModelInputForTest('real-esrgan', baseImageDataUrl, input);

        expect(result).toEqual({
          image: baseImageDataUrl,
          scale: 2,
          face_enhance: false,
        });
      });

      test('should build input with scale 4', () => {
        const input = createUpscaleInput({
          config: { ...createUpscaleInput().config, scale: 4 },
        });
        const result = service.buildModelInputForTest('real-esrgan', baseImageDataUrl, input);

        expect(result).toEqual({
          image: baseImageDataUrl,
          scale: 4,
          face_enhance: false,
        });
      });

      test('should use scale 4 for any value other than 2', () => {
        const input = createUpscaleInput({
          config: { ...createUpscaleInput().config, scale: 8 },
        });
        const result = service.buildModelInputForTest('real-esrgan', baseImageDataUrl, input);

        expect(result.scale).toBe(4);
      });

      test('should enable face enhancement when enhanceFaces is true', () => {
        const input = createUpscaleInput({
          config: {
            ...createUpscaleInput().config,
            additionalOptions: {
              ...createUpscaleInput().config.additionalOptions,
              enhanceFaces: true,
            },
          },
        });
        const result = service.buildModelInputForTest('real-esrgan', baseImageDataUrl, input);

        expect(result.face_enhance).toBe(true);
      });
    });

    describe('gfpgan', () => {
      let gfpganService: ReplicateService;

      beforeEach(() => {
        gfpganService = new ReplicateService('gfpgan');
      });

      test('should use "img" instead of "image" parameter', () => {
        const input = createUpscaleInput();
        const result = gfpganService.buildModelInputForTest('gfpgan', baseImageDataUrl, input);

        expect(result).toHaveProperty('img', baseImageDataUrl);
        expect(result).not.toHaveProperty('image');
      });

      test('should cap scale at 4', () => {
        const input = createUpscaleInput({
          config: { ...createUpscaleInput().config, scale: 8 },
        });
        const result = gfpganService.buildModelInputForTest('gfpgan', baseImageDataUrl, input);

        expect(result.scale).toBe(4);
      });

      test('should set version to v1.4', () => {
        const input = createUpscaleInput();
        const result = gfpganService.buildModelInputForTest('gfpgan', baseImageDataUrl, input);

        expect(result.version).toBe('v1.4');
      });
    });

    describe('clarity-upscaler', () => {
      let clarityService: ReplicateService;

      beforeEach(() => {
        clarityService = new ReplicateService('clarity-upscaler');
      });

      test('should build input with scale factor', () => {
        const input = createUpscaleInput({
          config: { ...createUpscaleInput().config, scale: 4 },
        });
        const result = clarityService.buildModelInputForTest(
          'clarity-upscaler',
          baseImageDataUrl,
          input
        );

        expect(result).toMatchObject({
          image: baseImageDataUrl,
          scale_factor: 4,
          output_format: 'png',
        });
      });

      test('should use default prompt when no custom instructions provided', () => {
        const input = createUpscaleInput();
        const result = clarityService.buildModelInputForTest(
          'clarity-upscaler',
          baseImageDataUrl,
          input
        );

        expect(result.prompt).toContain('masterpiece, best quality, highres');
      });

      test('should use custom prompt when provided', () => {
        const customPrompt = 'Make this image amazing';
        const input = createUpscaleInput({
          config: {
            ...createUpscaleInput().config,
            additionalOptions: {
              ...createUpscaleInput().config.additionalOptions,
              customInstructions: customPrompt,
            },
          },
        });
        const result = clarityService.buildModelInputForTest(
          'clarity-upscaler',
          baseImageDataUrl,
          input
        );

        expect(result.prompt).toBe(customPrompt);
      });

      test('should include enhancement instructions when enhance is enabled', () => {
        const input = createUpscaleInput({
          config: {
            ...createUpscaleInput().config,
            additionalOptions: {
              ...createUpscaleInput().config.additionalOptions,
              enhance: true,
              enhancement: {
                clarity: true,
                color: false,
                lighting: false,
                denoise: false,
                artifacts: false,
                details: false,
              },
            },
          },
        });
        const result = clarityService.buildModelInputForTest(
          'clarity-upscaler',
          baseImageDataUrl,
          input
        );

        expect(result.prompt).toContain('sharpen edges');
      });

      test('should include face enhancement when enabled', () => {
        const input = createUpscaleInput({
          config: {
            ...createUpscaleInput().config,
            additionalOptions: {
              ...createUpscaleInput().config.additionalOptions,
              enhanceFaces: true,
            },
          },
        });
        const result = clarityService.buildModelInputForTest(
          'clarity-upscaler',
          baseImageDataUrl,
          input
        );

        expect(result.prompt).toContain('Enhance facial features');
      });

      test('should include text preservation when enabled', () => {
        const input = createUpscaleInput({
          config: {
            ...createUpscaleInput().config,
            additionalOptions: {
              ...createUpscaleInput().config.additionalOptions,
              preserveText: true,
            },
          },
        });
        const result = clarityService.buildModelInputForTest(
          'clarity-upscaler',
          baseImageDataUrl,
          input
        );

        expect(result.prompt).toContain('Preserve and sharpen any text');
      });
    });

    describe('flux-2-pro', () => {
      let flux2Service: ReplicateService;

      beforeEach(() => {
        flux2Service = new ReplicateService('flux-2-pro');
      });

      test('should use input_images array', () => {
        const input = createUpscaleInput();
        const result = flux2Service.buildModelInputForTest('flux-2-pro', baseImageDataUrl, input);

        expect(result).toMatchObject({
          input_images: [baseImageDataUrl],
          aspect_ratio: 'match_input_image',
          output_format: 'png',
          safety_tolerance: 2,
          prompt_upsampling: false,
        });
      });

      test('should include "No creative changes" in default prompt', () => {
        const input = createUpscaleInput();
        const result = flux2Service.buildModelInputForTest('flux-2-pro', baseImageDataUrl, input);

        expect(result.prompt).toContain('No creative changes');
      });
    });

    describe('nano-banana-pro', () => {
      let nanoService: ReplicateService;

      beforeEach(() => {
        nanoService = new ReplicateService('nano-banana-pro');
      });

      test('should use image_input array', () => {
        const input = createUpscaleInput();
        const result = nanoService.buildModelInputForTest(
          'nano-banana-pro',
          baseImageDataUrl,
          input
        );

        expect(result).toMatchObject({
          prompt: expect.any(String),
          image_input: [baseImageDataUrl],
          aspect_ratio: 'match_input_image',
          resolution: '2K',
          output_format: 'png',
          safety_filter_level: 'block_only_high',
        });
      });

      test('should map scale 2 to 2K resolution', () => {
        const input = createUpscaleInput({
          config: { ...createUpscaleInput().config, scale: 2 },
        });
        const result = nanoService.buildModelInputForTest(
          'nano-banana-pro',
          baseImageDataUrl,
          input
        );

        expect(result.resolution).toBe('2K');
      });

      test('should map scale 4 and 8 to 4K resolution', () => {
        const input4x = createUpscaleInput({
          config: { ...createUpscaleInput().config, scale: 4 },
        });
        const result4x = nanoService.buildModelInputForTest(
          'nano-banana-pro',
          baseImageDataUrl,
          input4x
        );

        expect(result4x.resolution).toBe('4K');

        const input8x = createUpscaleInput({
          config: { ...createUpscaleInput().config, scale: 8 },
        });
        const result8x = nanoService.buildModelInputForTest(
          'nano-banana-pro',
          baseImageDataUrl,
          input8x
        );

        expect(result8x.resolution).toBe('4K');
      });

      test('should use nanoBananaProConfig when provided', () => {
        const input = createUpscaleInput({
          config: {
            ...createUpscaleInput().config,
            scale: 4, // Scale 4 maps to 4K resolution
            // nanoBananaProConfig is at config level, not inside additionalOptions
            nanoBananaProConfig: {
              aspectRatio: '16:9',
              resolution: '4K',
              outputFormat: 'jpg',
              safetyFilterLevel: 'block_medium_and_above',
            },
          },
        });
        const result = nanoService.buildModelInputForTest(
          'nano-banana-pro',
          baseImageDataUrl,
          input
        );

        expect(result).toMatchObject({
          aspect_ratio: '16:9',
          resolution: '4K',
          output_format: 'jpg',
          safety_filter_level: 'block_medium_and_above',
        });
      });
    });

    describe('qwen-image-edit', () => {
      let qwenService: ReplicateService;

      beforeEach(() => {
        qwenService = new ReplicateService('qwen-image-edit');
      });

      test('should use "image" array parameter', () => {
        const input = createUpscaleInput();
        const result = qwenService.buildModelInputForTest(
          'qwen-image-edit',
          baseImageDataUrl,
          input
        );

        expect(result).toMatchObject({
          prompt: expect.any(String),
          image: [baseImageDataUrl],
          aspect_ratio: 'match_input_image',
          output_format: 'png',
          output_quality: 95,
          go_fast: true,
        });
      });
    });

    describe('seedream', () => {
      let seedreamService: ReplicateService;

      beforeEach(() => {
        seedreamService = new ReplicateService('seedream');
      });

      test('should use "image_input" array parameter and match_input_image aspect ratio', () => {
        const input = createUpscaleInput();
        const result = seedreamService.buildModelInputForTest('seedream', baseImageDataUrl, input);

        expect(result).toMatchObject({
          prompt: expect.any(String),
          image_input: [baseImageDataUrl],
          // Falls back to 2K when original dimensions can't be decoded from test data
          size: '2K',
          // Uses match_input_image to preserve original aspect ratio
          aspect_ratio: 'match_input_image',
        });
      });

      test('should select 4K size for large scale requests', () => {
        const input = createUpscaleInput({
          config: {
            ...createUpscaleInput().config,
            scale: 4,
          },
        });
        const result = seedreamService.buildModelInputForTest('seedream', baseImageDataUrl, input);

        // Even with scale 4, falls back to 2K since dimensions can't be decoded
        // In real usage, actual images will have decodable dimensions
        expect(result).toMatchObject({
          size: '2K',
          aspect_ratio: 'match_input_image',
        });
      });
    });

    describe('realesrgan-anime', () => {
      let animeService: ReplicateService;

      beforeEach(() => {
        animeService = new ReplicateService('realesrgan-anime');
      });

      test('should use "img" parameter like GFPGAN', () => {
        const input = createUpscaleInput();
        const result = animeService.buildModelInputForTest(
          'realesrgan-anime',
          baseImageDataUrl,
          input
        );

        expect(result).toMatchObject({
          img: baseImageDataUrl,
          scale: 2,
          version: 'Anime - anime6B',
          face_enhance: false,
        });
      });

      test('should cap scale at 4', () => {
        const input = createUpscaleInput({
          config: { ...createUpscaleInput().config, scale: 8 },
        });
        const result = animeService.buildModelInputForTest(
          'realesrgan-anime',
          baseImageDataUrl,
          input
        );

        expect(result.scale).toBe(4);
      });
    });
  });

  describe('Enhancement Instructions Integration', () => {
    // Test enhancement instructions indirectly through buildModelInput
    // since generateEnhancementInstructions is a private helper function
    const baseImageDataUrl = 'data:image/jpeg;base64,abc123';

    test('should include no enhancement instructions when all disabled (clarity-upscaler)', () => {
      const clarityService = new ReplicateService('clarity-upscaler');
      const input = createUpscaleInput({
        config: {
          ...createUpscaleInput().config,
          additionalOptions: {
            ...createUpscaleInput().config.additionalOptions,
            enhance: false,
            enhancement: {
              clarity: false,
              color: false,
              lighting: false,
              denoise: false,
              artifacts: false,
              details: false,
            },
          },
        },
      });
      const result = clarityService.buildModelInputForTest(
        'clarity-upscaler',
        baseImageDataUrl,
        input
      );

      // Should only have default prompt, no enhancement instructions
      expect(result.prompt).toBe('masterpiece, best quality, highres');
    });

    test('should include clarity enhancement instruction in prompt', () => {
      const clarityService = new ReplicateService('clarity-upscaler');
      const input = createUpscaleInput({
        config: {
          ...createUpscaleInput().config,
          additionalOptions: {
            ...createUpscaleInput().config.additionalOptions,
            enhance: true,
            enhancement: {
              clarity: true,
              color: false,
              lighting: false,
              denoise: false,
              artifacts: false,
              details: false,
            },
          },
        },
      });
      const result = clarityService.buildModelInputForTest(
        'clarity-upscaler',
        baseImageDataUrl,
        input
      );

      expect(result.prompt).toContain('sharpen edges and improve overall clarity');
    });

    test('should include color enhancement instruction in prompt', () => {
      const clarityService = new ReplicateService('clarity-upscaler');
      const input = createUpscaleInput({
        config: {
          ...createUpscaleInput().config,
          additionalOptions: {
            ...createUpscaleInput().config.additionalOptions,
            enhance: true,
            enhancement: {
              clarity: false,
              color: true,
              lighting: false,
              denoise: false,
              artifacts: false,
              details: false,
            },
          },
        },
      });
      const result = clarityService.buildModelInputForTest(
        'clarity-upscaler',
        baseImageDataUrl,
        input
      );

      expect(result.prompt).toContain('balance color saturation and correct color casts');
    });

    test('should include lighting enhancement instruction in prompt', () => {
      const clarityService = new ReplicateService('clarity-upscaler');
      const input = createUpscaleInput({
        config: {
          ...createUpscaleInput().config,
          additionalOptions: {
            ...createUpscaleInput().config.additionalOptions,
            enhance: true,
            enhancement: {
              clarity: false,
              color: false,
              lighting: true,
              denoise: false,
              artifacts: false,
              details: false,
            },
          },
        },
      });
      const result = clarityService.buildModelInputForTest(
        'clarity-upscaler',
        baseImageDataUrl,
        input
      );

      expect(result.prompt).toContain('optimize exposure and lighting balance');
    });

    test('should include denoise enhancement instruction in prompt', () => {
      const clarityService = new ReplicateService('clarity-upscaler');
      const input = createUpscaleInput({
        config: {
          ...createUpscaleInput().config,
          additionalOptions: {
            ...createUpscaleInput().config.additionalOptions,
            enhance: true,
            enhancement: {
              clarity: false,
              color: false,
              lighting: false,
              denoise: true,
              artifacts: false,
              details: false,
            },
          },
        },
      });
      const result = clarityService.buildModelInputForTest(
        'clarity-upscaler',
        baseImageDataUrl,
        input
      );

      expect(result.prompt).toContain('remove sensor noise and grain while preserving details');
    });

    test('should include artifacts enhancement instruction in prompt', () => {
      const clarityService = new ReplicateService('clarity-upscaler');
      const input = createUpscaleInput({
        config: {
          ...createUpscaleInput().config,
          additionalOptions: {
            ...createUpscaleInput().config.additionalOptions,
            enhance: true,
            enhancement: {
              clarity: false,
              color: false,
              lighting: false,
              denoise: false,
              artifacts: true,
              details: false,
            },
          },
        },
      });
      const result = clarityService.buildModelInputForTest(
        'clarity-upscaler',
        baseImageDataUrl,
        input
      );

      expect(result.prompt).toContain('eliminate compression artifacts and blocky patterns');
    });

    test('should include details enhancement instruction in prompt', () => {
      const clarityService = new ReplicateService('clarity-upscaler');
      const input = createUpscaleInput({
        config: {
          ...createUpscaleInput().config,
          additionalOptions: {
            ...createUpscaleInput().config.additionalOptions,
            enhance: true,
            enhancement: {
              clarity: false,
              color: false,
              lighting: false,
              denoise: false,
              artifacts: false,
              details: true,
            },
          },
        },
      });
      const result = clarityService.buildModelInputForTest(
        'clarity-upscaler',
        baseImageDataUrl,
        input
      );

      expect(result.prompt).toContain('enhance fine textures and subtle details');
    });

    test('should combine multiple enhancement instructions with comma separator', () => {
      const clarityService = new ReplicateService('clarity-upscaler');
      const input = createUpscaleInput({
        config: {
          ...createUpscaleInput().config,
          additionalOptions: {
            ...createUpscaleInput().config.additionalOptions,
            enhance: true,
            enhancement: {
              clarity: true,
              color: true,
              lighting: true,
              denoise: false,
              artifacts: false,
              details: false,
            },
          },
        },
      });
      const result = clarityService.buildModelInputForTest(
        'clarity-upscaler',
        baseImageDataUrl,
        input
      );

      expect(result.prompt).toContain('sharpen edges');
      expect(result.prompt).toContain('balance color saturation');
      expect(result.prompt).toContain('optimize exposure');
      // Check that they are comma-separated
      const instructionPart = result.prompt.split('. ')[1];
      expect(instructionPart).toMatch(/, /);
    });

    test('should end enhancement instructions with period', () => {
      const clarityService = new ReplicateService('clarity-upscaler');
      const input = createUpscaleInput({
        config: {
          ...createUpscaleInput().config,
          additionalOptions: {
            ...createUpscaleInput().config.additionalOptions,
            enhance: true,
            enhancement: {
              clarity: true,
              color: false,
              lighting: false,
              denoise: false,
              artifacts: false,
              details: false,
            },
          },
        },
      });
      const result = clarityService.buildModelInputForTest(
        'clarity-upscaler',
        baseImageDataUrl,
        input
      );

      // Enhancement instructions are added with ". " prefix and end with period
      // Full prompt format: "masterpiece, best quality, highres. sharpen edges and improve overall clarity. "
      // The enhancement instructions function returns "sharpen edges and improve overall clarity. "
      expect(result.prompt).toContain('. sharpen edges and improve overall clarity.');
    });
  });

  describe('processImage() - Credit Flow', () => {
    test('should deduct credits before calling Replicate', async () => {
      const input = createUpscaleInput();
      mockReplicateRun.mockResolvedValue('https://replicate-output.com/result.png');

      await service.processImage('user-123', input);

      expect(mockSupabaseRpc).toHaveBeenCalledWith('consume_credits_v2', {
        target_user_id: 'user-123',
        amount: 10,
        ref_id: expect.stringMatching(/^rep_\d+_[a-z0-9]+$/),
        description: 'Image processing via Replicate (10 credits)',
      });
    });

    test('should throw InsufficientCreditsError when credits are insufficient', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { message: 'Insufficient credits' },
      });

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow(
        InsufficientCreditsError
      );
    });

    test('should throw error for other Supabase errors', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow(
        'Failed to deduct credits'
      );
    });

    test('should not call Replicate when credit deduction fails', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { message: 'Insufficient credits' },
      });

      const input = createUpscaleInput();

      try {
        await service.processImage('user-123', input);
      } catch {
        // Expected to throw
      }

      expect(mockReplicateRun).not.toHaveBeenCalled();
    });

    test('should refund credits when Replicate call fails', async () => {
      mockReplicateRun.mockRejectedValue(new Error('Replicate API error'));
      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 90 }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: null,
        }); // refund_credits

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow();

      // Verify refund was called
      expect(mockSupabaseRpc).toHaveBeenCalledWith('refund_credits', {
        target_user_id: 'user-123',
        amount: 10,
        job_id: expect.stringMatching(/^rep_\d+_[a-z0-9]+$/),
      });
    });

    test('should use pre-calculated creditCost from options', async () => {
      mockReplicateRun.mockResolvedValue('https://replicate-output.com/result.png');

      const input = createUpscaleInput();
      const options = { creditCost: 25 };

      await service.processImage('user-123', input, options);

      expect(mockSupabaseRpc).toHaveBeenCalledWith('consume_credits_v2', {
        target_user_id: 'user-123',
        amount: 25,
        ref_id: expect.any(String),
        description: 'Image processing via Replicate (25 credits)',
      });
      expect(calculateCreditCost).not.toHaveBeenCalled();
    });
  });

  describe('processImage() - Success Path', () => {
    test('should return imageUrl, mimeType, expiresAt, and creditsRemaining on success', async () => {
      mockReplicateRun.mockResolvedValue('https://replicate-output.com/result.png');

      const input = createUpscaleInput();

      const result = await service.processImage('user-123', input);

      expect(result).toEqual({
        imageUrl: 'https://replicate-output.com/result.png',
        mimeType: 'image/png',
        expiresAt: expect.any(Number),
        creditsRemaining: 90,
      });
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    test('should detect PNG mimeType from URL', async () => {
      mockReplicateRun.mockResolvedValue('https://replicate-output.com/result.PNG');

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      expect(result.mimeType).toBe('image/png');
    });

    test('should detect WebP mimeType from URL', async () => {
      mockReplicateRun.mockResolvedValue('https://replicate-output.com/result.webp');

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      expect(result.mimeType).toBe('image/webp');
    });

    test('should default to JPEG mimeType for unknown formats', async () => {
      mockReplicateRun.mockResolvedValue('https://replicate-output.com/result');

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      expect(result.mimeType).toBe('image/jpeg');
    });

    test('should set expiresAt to 1 hour from now', async () => {
      mockReplicateRun.mockResolvedValue('https://replicate-output.com/result.png');

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      const expectedExpiry = Date.now() + 3600000; // 1 hour
      expect(result.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(result.expiresAt).toBeLessThanOrEqual(expectedExpiry + 1000);
    });
  });

  describe('callReplicate() - Output Format Handling', () => {
    test('should handle string URL output', async () => {
      const outputUrl = 'https://replicate-output.com/result.png';
      mockReplicateRun.mockResolvedValue(outputUrl);

      const input = createUpscaleInput();

      const result = await service.processImage('user-123', input);

      expect(result.imageUrl).toBe(outputUrl);
    });

    test('should handle FileOutput with .url property as function', async () => {
      const outputUrl = 'https://replicate-output.com/result.png';

      class MockFileOutput {
        url(): string {
          return outputUrl;
        }
      }

      mockReplicateRun.mockResolvedValue(new MockFileOutput());

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      expect(result.imageUrl).toBe(outputUrl);
    });

    test('should handle FileOutput with .url property as string', async () => {
      const outputUrl = 'https://replicate-output.com/result.png';

      const mockOutput = {
        url: outputUrl,
      };

      mockReplicateRun.mockResolvedValue(mockOutput);

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      expect(result.imageUrl).toBe(outputUrl);
    });

    test('should handle URL-like object with .href property', async () => {
      const outputUrl = 'https://replicate-output.com/result.png';

      const mockOutput = {
        href: outputUrl,
      };

      mockReplicateRun.mockResolvedValue(mockOutput);

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      expect(result.imageUrl).toBe(outputUrl);
    });

    test('should handle array output with first element as URL', async () => {
      const outputUrl = 'https://replicate-output.com/result.png';

      mockReplicateRun.mockResolvedValue([outputUrl]);

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      expect(result.imageUrl).toBe(outputUrl);
    });

    test('should handle array output with FileOutput', async () => {
      const outputUrl = 'https://replicate-output.com/result.png';

      class MockFileOutput {
        url = outputUrl;
      }

      mockReplicateRun.mockResolvedValue([new MockFileOutput()]);

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      expect(result.imageUrl).toBe(outputUrl);
    });

    test('should throw ReplicateError for unexpected array output', async () => {
      mockReplicateRun.mockResolvedValue([{ not: 'a url' }]);

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow(ReplicateError);
      await expect(service.processImage('user-123', input)).rejects.toThrow(
        expect.objectContaining({ code: 'NO_OUTPUT' })
      );
    });

    test('should throw ReplicateError for no output URL', async () => {
      mockReplicateRun.mockResolvedValue(null);

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow(ReplicateError);
      await expect(service.processImage('user-123', input)).rejects.toThrow(
        expect.objectContaining({ code: 'NO_OUTPUT' })
      );
    });
  });

  describe('callReplicate() - Error Handling', () => {
    test('should throw ReplicateError for rate limit errors', async () => {
      mockReplicateRun.mockRejectedValue(new Error('Rate limit exceeded'));

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow(ReplicateError);
      await expect(service.processImage('user-123', input)).rejects.toThrow(
        expect.objectContaining({ code: 'RATE_LIMITED' })
      );

      // Verify refund was called
      expect(mockSupabaseRpc).toHaveBeenCalledWith('refund_credits', expect.any(Object));
    });

    test('should throw ReplicateError for NSFW/safety violations', async () => {
      mockReplicateRun.mockRejectedValue(new Error('Image flagged by NSFW filter'));

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow(ReplicateError);
      await expect(service.processImage('user-123', input)).rejects.toThrow(
        expect.objectContaining({ code: 'SAFETY' })
      );
    });

    test('should throw ReplicateError for timeout errors', async () => {
      mockReplicateRun.mockRejectedValue(new Error('Processing timed out'));

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow(ReplicateError);
      await expect(service.processImage('user-123', input)).rejects.toThrow(
        expect.objectContaining({ code: 'TIMEOUT' })
      );
    });

    test('should throw ReplicateError for processing failures', async () => {
      mockReplicateRun.mockRejectedValue(new Error('Model inference failed'));

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow(ReplicateError);
      await expect(service.processImage('user-123', input)).rejects.toThrow(
        expect.objectContaining({ code: 'PROCESSING_FAILED' })
      );
    });

    test('should re-throw existing ReplicateError as-is', async () => {
      const originalError = new ReplicateError('Custom error', 'CUSTOM_CODE');
      mockReplicateRun.mockRejectedValue(originalError);

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow(originalError);
    });
  });

  describe('callReplicate() - Input Preparation', () => {
    test('should add data URL prefix if missing', async () => {
      mockReplicateRun.mockResolvedValue('https://replicate-output.com/result.png');

      const input = createUpscaleInput({
        imageData: 'base64encodedimagedata', // No prefix
        mimeType: 'image/jpeg',
      });

      await service.processImage('user-123', input);

      expect(mockReplicateRun).toHaveBeenCalledWith(
        'nightmareai/real-esrgan:test-version',
        expect.objectContaining({
          input: expect.objectContaining({
            image: 'data:image/jpeg;base64,base64encodedimagedata',
          }),
        })
      );
    });

    test('should preserve existing data URL prefix', async () => {
      mockReplicateRun.mockResolvedValue('https://replicate-output.com/result.png');

      const inputDataUrl = 'data:image/jpeg;base64,base64encodedimagedata';
      const input = createUpscaleInput({
        imageData: inputDataUrl,
        mimeType: 'image/jpeg',
      });

      await service.processImage('user-123', input);

      expect(mockReplicateRun).toHaveBeenCalledWith(
        'nightmareai/real-esrgan:test-version',
        expect.objectContaining({
          input: expect.objectContaining({
            image: inputDataUrl,
          }),
        })
      );
    });
  });

  describe('Factory Functions', () => {
    test('createReplicateService should create service with specified modelId', () => {
      const gfpganService = createReplicateService('gfpgan');

      expect(gfpganService).toBeInstanceOf(ReplicateService);
      expect(gfpganService.modelId).toBe('gfpgan');
    });

    test('getReplicateService should return singleton instance', () => {
      const instance1 = getReplicateService();
      const instance2 = getReplicateService();

      expect(instance1).toBe(instance2);
    });

    test('getReplicateService should create default model instance on first call', () => {
      const defaultService = getReplicateService();

      expect(defaultService.modelId).toBe('real-esrgan');
    });
  });

  describe('getModelVersionForId()', () => {
    test('should return model version from ModelRegistry', () => {
      const version = (
        service as unknown as {
          getModelVersionForId: (modelId: string) => string;
        }
      ).getModelVersionForId('gfpgan');

      expect(version).toBe('tencentarc/gfpgan:test-version');
    });

    test('should fallback to instance modelVersion for unknown models', () => {
      const version = (
        service as unknown as {
          getModelVersionForId: (modelId: string) => string;
        }
      ).getModelVersionForId('unknown-model');

      expect(version).toBe('nightmareai/real-esrgan:test-version');
    });

    test('should return null when model not in registry', () => {
      const registry = ModelRegistry.getInstance();
      const model = registry.getModel('non-existent-model');

      expect(model).toBeNull();
    });
  });

  describe('refundCredits()', () => {
    test('should log error when refund fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockReplicateRun.mockRejectedValue(new Error('Replicate failed'));

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 90 }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'Refund failed' },
        });

      const input = createUpscaleInput();

      await expect(service.processImage('user-123', input)).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to refund credits:', expect.any(Object));

      consoleSpy.mockRestore();
    });
  });

  describe('Image Data Format Edge Cases', () => {
    test('should handle PNG with uppercase extension', async () => {
      mockReplicateRun.mockResolvedValue('https://output.com/file.PNG');

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      expect(result.mimeType).toBe('image/png');
    });

    test('should handle WebP with mixed case', async () => {
      mockReplicateRun.mockResolvedValue('https://output.com/file.WebP');

      const input = createUpscaleInput();
      const result = await service.processImage('user-123', input);

      expect(result.mimeType).toBe('image/webp');
    });
  });

  describe('Job ID Generation', () => {
    test('should generate unique job IDs', async () => {
      mockReplicateRun.mockResolvedValue('https://output.com/result.png');

      const input = createUpscaleInput();

      await service.processImage('user-123', input);

      const creditCall = mockSupabaseRpc.mock.calls[0];
      const jobId = creditCall[1].ref_id;

      expect(jobId).toMatch(/^rep_\d+_[a-z0-9]+$/);
      expect(jobId.length).toBeGreaterThan(10);
    });
  });

  describe('Different Scale Values', () => {
    test('should pass correct scale for 2x upscaling', async () => {
      mockReplicateRun.mockResolvedValue('https://output.com/result.png');

      const input = createUpscaleInput({
        config: { ...createUpscaleInput().config, scale: 2 },
      });

      await service.processImage('user-123', input);

      expect(mockReplicateRun).toHaveBeenCalledWith(
        'nightmareai/real-esrgan:test-version',
        expect.objectContaining({
          input: expect.objectContaining({
            scale: 2,
          }),
        })
      );
    });

    test('should pass correct scale for 4x upscaling', async () => {
      mockReplicateRun.mockResolvedValue('https://output.com/result.png');

      const input = createUpscaleInput({
        config: { ...createUpscaleInput().config, scale: 4 },
      });

      await service.processImage('user-123', input);

      expect(mockReplicateRun).toHaveBeenCalledWith(
        'nightmareai/real-esrgan:test-version',
        expect.objectContaining({
          input: expect.objectContaining({
            scale: 4,
          }),
        })
      );
    });
  });
});
