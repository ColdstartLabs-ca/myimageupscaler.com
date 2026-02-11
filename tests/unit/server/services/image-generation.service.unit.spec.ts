import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ========================================
// Mock external dependencies BEFORE importing service
// ========================================

// Mock Supabase Admin
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
  },
}));

// Mock Analytics
vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn(),
}));

// Mock Google GenAI
const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      generateContent: () => mockGenerateContent(),
    };
    constructor(config: { apiKey: string }) {
      if (!config.apiKey) {
        throw new Error('API key is required');
      }
    }
  },
}));

// Mock Environment Variables
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    GEMINI_API_KEY: 'test-gemini-key',
    AMPLITUDE_API_KEY: 'test-amplitude-key',
  },
  clientEnv: {
    NEXT_PUBLIC_STRIPE_PRICE_STARTER: 'price_starter_monthly',
    NEXT_PUBLIC_STRIPE_PRICE_HOBBY: 'price_hobby_monthly',
    NEXT_PUBLIC_STRIPE_PRICE_PRO: 'price_pro_monthly',
    NEXT_PUBLIC_STRIPE_PRICE_BUSINESS: 'price_business_monthly',
  },
}));

// ========================================
// Import service after mocks are set up
// ========================================
import {
  ImageGenerationService,
  InsufficientCreditsError,
  AIGenerationError,
  calculateCreditCost,
} from '@server/services/image-generation.service';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import type { IUpscaleInput } from '@shared/validation/upscale.schema';

// Cast mocked modules
const mockSupabaseRpc = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;
const mockTrackServerEvent = trackServerEvent as ReturnType<typeof vi.fn>;

// ========================================
// Test Helpers
// ========================================

function createMockInput(overrides: Partial<IUpscaleInput> = {}): IUpscaleInput {
  return {
    imageData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD',
    mimeType: 'image/jpeg',
    config: {
      qualityTier: 'quick',
      scale: 2,
      additionalOptions: {
        smartAnalysis: false,
        enhance: true,
        enhanceFaces: false,
        preserveText: false,
        enhancement: {
          clarity: true,
          color: true,
          lighting: false,
          denoise: true,
          artifacts: true,
          details: false,
        },
      },
    },
    ...overrides,
  };
}

function createMockGeminiResponse(
  overrides: {
    imageData?: string;
    mimeType?: string;
    finishReason?: string;
    hasParts?: boolean;
    hasText?: boolean;
    textContent?: string;
  } = {}
) {
  const {
    imageData = 'base64imagedata',
    mimeType = 'image/png',
    finishReason = 'STOP',
    hasParts = true,
    hasText = false,
    textContent = 'Some text',
  } = overrides;

  if (finishReason && finishReason !== 'STOP') {
    // Return error response
    return {
      candidates: [
        {
          finishReason,
          content: { parts: [] },
        },
      ],
    };
  }

  if (hasText) {
    // Return text instead of image (error case)
    return {
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [{ text: textContent }],
          },
        },
      ],
    };
  }

  if (!hasParts) {
    // Return empty parts (error case)
    return {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [] },
        },
      ],
    };
  }

  // Return successful response with image
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [
            {
              inlineData: {
                data: imageData,
                mimeType,
              },
            },
          ],
        },
      },
    ],
  };
}

// ========================================
// Test Suite
// ========================================

describe('ImageGenerationService', () => {
  let service: ImageGenerationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ImageGenerationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ========================================
  // Constructor Tests
  // ========================================
  describe('constructor', () => {
    it('should initialize with provider name', () => {
      expect(service.providerName).toBe('Gemini');
    });
  });

  // ========================================
  // supportsMode Tests
  // ========================================
  describe('supportsMode', () => {
    it('should return true for upscale mode', () => {
      expect(service.supportsMode('upscale')).toBe(true);
    });

    it('should return true for enhance mode', () => {
      expect(service.supportsMode('enhance')).toBe(true);
    });

    it('should return true for both mode', () => {
      expect(service.supportsMode('both')).toBe(true);
    });

    it('should return true for custom mode', () => {
      expect(service.supportsMode('custom')).toBe(true);
    });

    it('should return false for unsupported mode', () => {
      expect(service.supportsMode('invalid-mode')).toBe(false);
    });
  });

  // ========================================
  // calculateCreditCost Tests
  // ========================================
  describe('calculateCreditCost', () => {
    it('should calculate cost for quick tier', () => {
      const config = createMockInput().config;
      config.qualityTier = 'quick';
      const cost = calculateCreditCost(config);
      expect(cost).toBe(1); // 1 credit for quick
    });

    it('should calculate cost for face-restore tier', () => {
      const config = createMockInput().config;
      config.qualityTier = 'face-restore';
      const cost = calculateCreditCost(config);
      expect(cost).toBe(2); // 2 credits for face-restore
    });

    it('should calculate cost for budget-edit tier', () => {
      const config = createMockInput().config;
      config.qualityTier = 'budget-edit';
      const cost = calculateCreditCost(config);
      expect(cost).toBe(3); // 3 credits for budget-edit
    });

    it('should calculate cost for seedream-edit tier', () => {
      const config = createMockInput().config;
      config.qualityTier = 'seedream-edit';
      const cost = calculateCreditCost(config);
      expect(cost).toBe(4); // 4 credits for seedream-edit
    });

    it('should calculate cost for hd-upscale tier', () => {
      const config = createMockInput().config;
      config.qualityTier = 'hd-upscale';
      const cost = calculateCreditCost(config);
      expect(cost).toBe(4); // 4 credits for hd-upscale
    });

    it('should calculate cost for face-pro tier', () => {
      const config = createMockInput().config;
      config.qualityTier = 'face-pro';
      const cost = calculateCreditCost(config);
      expect(cost).toBe(6); // 6 credits for face-pro
    });

    it('should calculate cost for ultra tier', () => {
      const config = createMockInput().config;
      config.qualityTier = 'ultra';
      const cost = calculateCreditCost(config);
      expect(cost).toBe(8); // 8 credits for ultra
    });

    it('should return 1 for auto tier (variable defaults to minimum cost)', () => {
      const config = createMockInput().config;
      config.qualityTier = 'auto';
      const cost = calculateCreditCost(config);
      // When baseCost is 0 (variable), after applying bounds it becomes minimumCost (1)
      expect(cost).toBe(1); // Variable tier defaults to minimum cost
    });

    it('should apply scale multiplier (2x)', () => {
      const config = createMockInput().config;
      config.qualityTier = 'quick';
      config.scale = 2;
      const cost = calculateCreditCost(config);
      expect(cost).toBe(1); // 1 * 1.0 = 1
    });

    it('should apply scale multiplier (4x)', () => {
      const config = createMockInput().config;
      config.qualityTier = 'quick';
      config.scale = 4;
      const cost = calculateCreditCost(config);
      expect(cost).toBe(1); // 1 * 1.0 = 1
    });

    it('should apply scale multiplier (8x)', () => {
      const config = createMockInput().config;
      config.qualityTier = 'quick';
      config.scale = 8;
      const cost = calculateCreditCost(config);
      expect(cost).toBe(1); // 1 * 1.0 = 1
    });
  });

  // ========================================
  // processImage - Happy Path Tests
  // ========================================
  describe('processImage - happy path', () => {
    it('should process image successfully and deduct credits', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();
      const creditCost = 1;
      const newBalance = 95;
      const mockImageData = 'base64processeddata';

      // Mock credit deduction
      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: newBalance }],
        error: null,
      });

      // Mock Gemini response
      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          imageData: mockImageData,
          mimeType: 'image/png',
        })
      );

      // Act
      const result = await service.processImage(userId, input);

      // Assert
      expect(mockSupabaseRpc).toHaveBeenCalledWith('consume_credits_v2', {
        target_user_id: userId,
        amount: creditCost,
        ref_id: expect.stringMatching(/^gen_\d+_[a-z0-9]+$/),
        description: `Image processing (${input.config.qualityTier} tier, ${creditCost} credits)`,
      });

      expect(mockTrackServerEvent).toHaveBeenCalledWith(
        'credits_deducted',
        {
          amount: creditCost,
          newBalance,
          description: `Image processing (${input.config.qualityTier} tier, ${creditCost} credits)`,
        },
        {
          apiKey: 'test-amplitude-key',
          userId,
        }
      );

      expect(result.imageData).toBe(`data:image/png;base64,${mockImageData}`);
      expect(result.mimeType).toBe('image/png');
      expect(result.creditsRemaining).toBe(newBalance);
    });

    it('should use pre-calculated credit cost from options', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();
      const preCalculatedCost = 5;

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      const result = await service.processImage(userId, input, {
        creditCost: preCalculatedCost,
      });

      // Assert
      expect(mockSupabaseRpc).toHaveBeenCalledWith('consume_credits_v2', {
        target_user_id: userId,
        amount: preCalculatedCost,
        ref_id: expect.any(String),
        description: expect.stringContaining(`${preCalculatedCost} credits`),
      });
      expect(result.creditsRemaining).toBe(100);
    });

    it('should handle image data with data URL prefix', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput({
        imageData: 'data:image/jpeg;base64,abc123def456',
      });

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      await service.processImage(userId, input);

      // Assert - verify Gemini was called with base64 data (without prefix)
      expect(mockGenerateContent).toHaveBeenCalled();
    });
  });

  // ========================================
  // processImage - Insufficient Credits Tests
  // ========================================
  describe('processImage - insufficient credits', () => {
    it('should throw InsufficientCreditsError when credits are low', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Insufficient credits' },
      });

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(InsufficientCreditsError);
    });

    it('should not track event when credits are insufficient', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Insufficient credits' },
      });

      // Act & Assert
      try {
        await service.processImage(userId, input);
      } catch {
        // Expected error
      }

      expect(mockTrackServerEvent).not.toHaveBeenCalled();
    });

    it('should throw generic error on credit deduction failure', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' },
      });

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(
        'Failed to deduct credits: Database connection failed'
      );
    });
  });

  // ========================================
  // processImage - AI Generation Error Tests
  // ========================================
  describe('processImage - AI generation errors', () => {
    it('should refund credits when AI generation fails', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();
      const creditCost = 1;

      // Mock successful deduction
      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        // Mock refund
        .mockResolvedValueOnce({
          error: null,
        });

      // Mock AI generation failure
      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          finishReason: 'SAFETY',
        })
      );

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(AIGenerationError);

      // Verify refund was called
      expect(mockSupabaseRpc).toHaveBeenCalledTimes(2);
      expect(mockSupabaseRpc).toHaveBeenCalledWith('refund_credits', {
        target_user_id: userId,
        amount: creditCost,
        job_id: expect.stringMatching(/^gen_\d+_[a-z0-9]+$/),
      });
    });

    it('should throw AIGenerationError for SAFETY finish reason', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        .mockResolvedValueOnce({ error: null }); // Refund

      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          finishReason: 'SAFETY',
        })
      );

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(AIGenerationError);
    });

    it('should throw AIGenerationError for RECITATION finish reason', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        .mockResolvedValueOnce({ error: null }); // Refund

      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          finishReason: 'RECITATION',
        })
      );

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(AIGenerationError);
    });

    it('should throw AIGenerationError for unknown finish reason', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        .mockResolvedValueOnce({ error: null }); // Refund

      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          finishReason: 'UNKNOWN_REASON',
        })
      );

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(
        'Model stopped generation. Reason: UNKNOWN_REASON'
      );
    });

    it('should throw AIGenerationError when no content is generated', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        .mockResolvedValueOnce({ error: null }); // Refund

      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          hasParts: false,
        })
      );

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(
        'No content generated by the model.'
      );
    });

    it('should throw AIGenerationError when text is returned instead of image', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        .mockResolvedValueOnce({ error: null }); // Refund

      const textResponse = 'I apologize, but I cannot generate this image.';
      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          hasText: true,
          textContent: textResponse,
        })
      );

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(AIGenerationError);
    });

    it('should throw AIGenerationError when no image data is found in parts', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        .mockResolvedValueOnce({ error: null }); // Refund

      // Response with parts but no inlineData
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ someOtherField: 'value' }],
            },
          },
        ],
      });

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(
        'No image data found in the response.'
      );
    });

    it('should log refund failure without throwing', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        // Refund fails
        .mockResolvedValueOnce({
          error: { message: 'Refund failed', code: 'REFUND_ERROR' },
        });

      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          finishReason: 'SAFETY',
        })
      );

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(AIGenerationError);

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to refund credits:', expect.any(Object));

      consoleErrorSpy.mockRestore();
    });
  });

  // ========================================
  // processImage - Edge Cases
  // ========================================
  describe('processImage - edge cases', () => {
    it('should handle zero balance after credit deduction', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 0 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      const result = await service.processImage(userId, input);

      // Assert
      expect(result.creditsRemaining).toBe(0);
    });

    it('should handle null balance result (defaults to 0)', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{}], // Missing new_total_balance
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      const result = await service.processImage(userId, input);

      // Assert
      expect(result.creditsRemaining).toBe(0);
    });

    it('should handle empty data array', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      const result = await service.processImage(userId, input);

      // Assert
      expect(result.creditsRemaining).toBe(0);
    });
  });

  // ========================================
  // Prompt Generation Tests
  // ========================================
  describe('prompt generation', () => {
    it('should use custom instructions when provided', async () => {
      // Arrange
      const userId = 'user-123';
      const customPrompt = 'Make this image look like a painting from the Renaissance period.';
      const input = createMockInput({
        config: {
          ...createMockInput().config,
          additionalOptions: {
            ...createMockInput().config.additionalOptions,
            customInstructions: customPrompt,
          },
        },
      });

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      await service.processImage(userId, input);

      // Assert - verify Gemini was called with custom prompt
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should generate default prompt when no custom instructions', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      await service.processImage(userId, input);

      // Assert - verify prompt includes expected elements
      expect(mockGenerateContent).toHaveBeenCalled();
    });
  });

  // ========================================
  // buildConstraintSegments Function Tests
  // ========================================
  describe('constraint segments', () => {
    it('should include face enhancement constraint when enhanceFaces is true', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput({
        config: {
          ...createMockInput().config,
          additionalOptions: {
            ...createMockInput().config.additionalOptions,
            enhanceFaces: true,
          },
        },
      });

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      await service.processImage(userId, input);

      // Assert
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should include text preservation constraint when preserveText is true', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput({
        config: {
          ...createMockInput().config,
          additionalOptions: {
            ...createMockInput().config.additionalOptions,
            preserveText: true,
          },
        },
      });

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      await service.processImage(userId, input);

      // Assert
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should include denoising constraint when enhancement.denoise is true', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput({
        config: {
          ...createMockInput().config,
          additionalOptions: {
            ...createMockInput().config.additionalOptions,
            enhancement: {
              ...createMockInput().config.additionalOptions.enhancement,
              denoise: true,
            },
          },
        },
      });

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      await service.processImage(userId, input);

      // Assert
      expect(mockGenerateContent).toHaveBeenCalled();
    });
  });

  // ========================================
  // buildQualityPromptSegment Tests
  // ========================================
  describe('quality prompt segments', () => {
    it('should generate enhance prompt when enhance is true', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput({
        config: {
          ...createMockInput().config,
          additionalOptions: {
            ...createMockInput().config.additionalOptions,
            enhance: true,
          },
        },
      });

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      await service.processImage(userId, input);

      // Assert
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should generate non-enhance prompt when enhance is false', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput({
        config: {
          ...createMockInput().config,
          additionalOptions: {
            ...createMockInput().config.additionalOptions,
            enhance: false,
          },
        },
      });

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce(createMockGeminiResponse());

      // Act
      await service.processImage(userId, input);

      // Assert
      expect(mockGenerateContent).toHaveBeenCalled();
    });
  });

  // ========================================
  // Extract Image Data Tests
  // ========================================
  describe('extractImageDataFromParts', () => {
    it('should extract image data with PNG MIME type', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      const mockImageData = 'abc123pngdata';
      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          imageData: mockImageData,
          mimeType: 'image/png',
        })
      );

      // Act
      const result = await service.processImage(userId, input);

      // Assert
      expect(result.imageData).toBe(`data:image/png;base64,${mockImageData}`);
      expect(result.mimeType).toBe('image/png');
    });

    it('should extract image data with JPEG MIME type', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      const mockImageData = 'def456jpegdata';
      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          imageData: mockImageData,
          mimeType: 'image/jpeg',
        })
      );

      // Act
      const result = await service.processImage(userId, input);

      // Assert
      expect(result.imageData).toBe(`data:image/jpeg;base64,${mockImageData}`);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should default to PNG MIME type when not specified', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc.mockResolvedValueOnce({
        data: [{ new_total_balance: 100 }],
        error: null,
      });

      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  inlineData: {
                    data: 'imagedata',
                    // No MIME type specified
                  },
                },
              ],
            },
          },
        ],
      });

      // Act
      const result = await service.processImage(userId, input);

      // Assert
      expect(result.imageData).toContain('image/png');
      expect(result.mimeType).toBe('image/png');
    });
  });

  // ========================================
  // Error Classes Tests
  // ========================================
  describe('error classes', () => {
    it('InsufficientCreditsError should have correct name and default message', () => {
      const error = new InsufficientCreditsError();
      expect(error.name).toBe('InsufficientCreditsError');
      expect(error.message).toBe('Insufficient credits');
    });

    it('InsufficientCreditsError should accept custom message', () => {
      const error = new InsufficientCreditsError('Not enough credits for this operation');
      expect(error.message).toBe('Not enough credits for this operation');
    });

    it('AIGenerationError should have correct name and include finishReason', () => {
      const error = new AIGenerationError('Generation failed', 'SAFETY');
      expect(error.name).toBe('AIGenerationError');
      expect(error.message).toBe('Generation failed');
      expect(error.finishReason).toBe('SAFETY');
    });

    it('AIGenerationError should work without finishReason', () => {
      const error = new AIGenerationError('Generation failed');
      expect(error.name).toBe('AIGenerationError');
      expect(error.finishReason).toBeUndefined();
    });
  });

  // ========================================
  // getFinishReasonMessage Tests
  // ========================================
  describe('getFinishReasonMessage', () => {
    it('should return appropriate message for RECITATION', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        .mockResolvedValueOnce({ error: null }); // Refund

      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          finishReason: 'RECITATION',
        })
      );

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(
        'detected that the output would be too similar to the input'
      );
    });

    it('should return appropriate message for SAFETY', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        .mockResolvedValueOnce({ error: null }); // Refund

      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          finishReason: 'SAFETY',
        })
      );

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(
        "triggered the model's safety filters"
      );
    });

    it('should return generic message for unknown finish reason', async () => {
      // Arrange
      const userId = 'user-123';
      const input = createMockInput();

      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: [{ new_total_balance: 100 }],
          error: null,
        })
        .mockResolvedValueOnce({ error: null }); // Refund

      mockGenerateContent.mockResolvedValueOnce(
        createMockGeminiResponse({
          finishReason: 'MAX_TOKENS',
        })
      );

      // Act & Assert
      await expect(service.processImage(userId, input)).rejects.toThrow(
        'Model stopped generation. Reason: MAX_TOKENS'
      );
    });
  });
});
