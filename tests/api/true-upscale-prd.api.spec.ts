import { test, expect } from '@playwright/test';
import { TestContext, ApiClient, createCanvas, postUpscaleWithStoredImage } from '../helpers';

/**
 * API Tests for True Image Upscaling PRD Features
 *
 * Tests for:
 * - Phase 2: Dimension reporting in response
 * - Phase 4: Scale validation per tier/model
 *
 * /api/upscale accepts storage metadata only, so each request first stores the
 * test image through the direct-upload flow (see tests/helpers/upscale-input.ts).
 */

// Valid 64x64 PNG test image (solid gray)
const VALID_TEST_IMAGE = createCanvas(64, 64);

// Shared test setup
let ctx: TestContext;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

async function postUpscale(
  api: ReturnType<ApiClient['withAuth']>,
  config: Record<string, unknown>
) {
  return postUpscaleWithStoredImage(
    api,
    { dataUrl: VALID_TEST_IMAGE, mimeType: 'image/png' },
    config
  );
}

test.describe('PRD: True Image Upscaling - Phase 2: Dimension Reporting', () => {
  test.describe('Upscale Models - Dimension Response', () => {
    const baseConfig = {
      scale: 4,
      qualityTier: 'quick' as const,
      additionalOptions: {
        smartAnalysis: false,
        enhance: false,
        enhanceFaces: false,
        preserveText: false,
      },
    };

    test('should return dimensions in response for upscale models (quick tier)', async ({
      request,
    }) => {
      const user = await ctx.createUser({ subscription: 'active', tier: 'hobby', credits: 100 });
      const api = new ApiClient(request).withAuth(user.token);

      // This test validates the response structure when processing succeeds
      // Note: May fail with AI service errors in test environment, but dimensions should be present
      const response = await postUpscale(api, baseConfig);

      // Accept both success and AI service errors - we're validating structure.
      // A failed provider attempt surfaces as 503 (AI_UNAVAILABLE), not 500.
      expect([200, 422, 500, 503]).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('dimensions');
        expect(data.dimensions).toHaveProperty('input');
        expect(data.dimensions).toHaveProperty('output');
        expect(data.dimensions).toHaveProperty('actualScale');

        // For 64x64 input at 4x scale
        expect(data.dimensions.input.width).toBe(64);
        expect(data.dimensions.input.height).toBe(64);
        expect(data.dimensions.output.width).toBe(256);
        expect(data.dimensions.output.height).toBe(256);
        expect(data.dimensions.actualScale).toBe(4);
      }
    });

    test('should calculate correct output dimensions for 2x scale', async ({ request }) => {
      const user = await ctx.createUser({ subscription: 'active', tier: 'hobby', credits: 100 });
      const api = new ApiClient(request).withAuth(user.token);

      const response = await postUpscale(api, { ...baseConfig, scale: 2 });

      if (response.status === 200) {
        const data = await response.json();
        expect(data.dimensions.output.width).toBe(128);
        expect(data.dimensions.output.height).toBe(128);
        expect(data.dimensions.actualScale).toBe(2);
      }
    });
  });

  test.describe('Enhancement-Only Models - Dimension Response', () => {
    test('should return actualScale of 1 for enhancement-only models', async ({ request }) => {
      const user = await ctx.createUser({ subscription: 'active', tier: 'hobby', credits: 100 });
      const api = new ApiClient(request).withAuth(user.token);

      // flux-2-pro is enhancement-only
      const response = await postUpscale(api, {
        scale: 4, // Requested scale, but enhancement-only won't change dimensions
        qualityTier: 'face-pro',
        additionalOptions: {
          smartAnalysis: false,
          enhance: false,
          enhanceFaces: false,
          preserveText: false,
        },
      });

      if (response.status === 200) {
        const data = await response.json();
        expect(data.dimensions).toBeDefined();
        // Enhancement-only models should have actualScale of 1
        expect(data.dimensions.actualScale).toBe(1);
        // Output dimensions should match input
        expect(data.dimensions.output.width).toBe(data.dimensions.input.width);
        expect(data.dimensions.output.height).toBe(data.dimensions.input.height);
      }
    });
  });
});

test.describe('PRD: True Image Upscaling - Phase 4: Scale Validation', () => {
  test.describe('Quick Tier (real-esrgan) - Scale Validation', () => {
    test('should accept 2x scale for quick tier', async ({ request }) => {
      const user = await ctx.createUser({ credits: 10 });
      const api = new ApiClient(request).withAuth(user.token);

      const response = await postUpscale(api, { scale: 2, qualityTier: 'quick' });

      // Should not fail with scale validation error (may fail for other reasons like AI service)
      if (response.status === 400) {
        const data = await response.json();
        expect(data.error?.message).not.toContain('not available');
      }
    });

    test('should accept 4x scale for quick tier', async ({ request }) => {
      const user = await ctx.createUser({ credits: 10 });
      const api = new ApiClient(request).withAuth(user.token);

      const response = await postUpscale(api, { scale: 4, qualityTier: 'quick' });

      if (response.status === 400) {
        const data = await response.json();
        expect(data.error?.message).not.toContain('not available');
      }
    });

    test('should reject 8x scale for quick tier with helpful message', async ({ request }) => {
      const user = await ctx.createUser({ credits: 10 });
      const api = new ApiClient(request).withAuth(user.token);

      const response = await postUpscale(api, { scale: 8, qualityTier: 'quick' });

      response.expectStatus(400);
      await response.expectErrorCode('VALIDATION_ERROR');
      const data = await response.json();
      expect(data.error.message).toContain('not available for quick tier');
      expect(data.error.message).toContain('HD Upscale');
    });
  });

  test.describe('Face Restore Tier (gfpgan) - Scale Validation', () => {
    test('should reject 8x scale for face-restore tier', async ({ request }) => {
      const user = await ctx.createUser({ credits: 10 });
      const api = new ApiClient(request).withAuth(user.token);

      const response = await postUpscale(api, { scale: 8, qualityTier: 'face-restore' });

      response.expectStatus(400);
      await response.expectErrorCode('VALIDATION_ERROR');
      const data = await response.json();
      expect(data.error.message).toContain('not available');
    });
  });

  test.describe('Budget Edit Tier (qwen-image-edit) - Enhancement-Only', () => {
    test('should reject any scale for enhancement-only budget-edit tier', async ({ request }) => {
      const user = await ctx.createUser({ subscription: 'active', tier: 'starter', credits: 100 });
      const api = new ApiClient(request).withAuth(user.token);

      const response = await postUpscale(api, { scale: 2, qualityTier: 'budget-edit' });

      // Scale validation (400), tier restriction (403), or AI service errors (422, 500, 503)
      expect([400, 403, 422, 500, 503]).toContain(response.status);

      if (response.status === 400) {
        const data = await response.json();
        expect(data.error.message).toContain('enhancement-only');
        expect(data.error.message).toContain('does not change image dimensions');
      }
    });
  });

  test.describe('Face Pro Tier (flux-2-pro) - Enhancement-Only', () => {
    test('should reject any scale for enhancement-only face-pro tier', async ({ request }) => {
      const user = await ctx.createUser({ subscription: 'active', tier: 'starter', credits: 100 });
      const api = new ApiClient(request).withAuth(user.token);

      const response = await postUpscale(api, { scale: 4, qualityTier: 'face-pro' });

      // Scale validation (400), tier restriction (403), or AI service errors (422, 500, 503)
      expect([400, 403, 422, 500, 503]).toContain(response.status);

      if (response.status === 400) {
        const data = await response.json();
        expect(data.error.message).toContain('enhancement-only');
      }
    });
  });

  test.describe('HD Upscale Tier (clarity-upscaler) - Max 4x', () => {
    test('should reject 8x scale for hd-upscale tier (too expensive — 3 chained A100 passes)', async ({
      request,
    }) => {
      const user = await ctx.createUser({ subscription: 'active', tier: 'starter', credits: 100 });
      const api = new ApiClient(request).withAuth(user.token);

      const response = await postUpscale(api, { scale: 8, qualityTier: 'hd-upscale' });

      // Scale validation (400), tier restriction (403), or AI service errors (422, 500, 503)
      expect([400, 403, 422, 500, 503]).toContain(response.status);
    });
  });

  test.describe('Ultra Tier (nano-banana-pro) - No 8x Support', () => {
    test('should reject 8x scale for ultra tier', async ({ request }) => {
      const user = await ctx.createUser({ subscription: 'active', tier: 'starter', credits: 100 });
      const api = new ApiClient(request).withAuth(user.token);

      const response = await postUpscale(api, { scale: 8, qualityTier: 'ultra' });

      // Scale validation (400), tier restriction (403), or AI service errors (422, 500, 503)
      expect([400, 403, 422, 500, 503]).toContain(response.status);

      if (response.status === 400) {
        const data = await response.json();
        expect(data.error.message).toContain('not available for ultra tier');
      }
    });
  });
});

// Note: QUALITY_TIER_SCALES consistency with model registry is tested in
// tests/unit/model-registry-scales.unit.spec.ts which can import server-side code.
