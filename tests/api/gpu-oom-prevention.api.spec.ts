import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';
import { createCanvas } from '../helpers/test-image-generator';

/**
 * API Tests: GPU OOM Prevention
 *
 * Validates that oversized images are rejected by the authenticated upscale
 * route before reaching Replicate, preventing GPU OOM errors and wasted credits.
 *
 * Tests the fixes from PR #38:
 * 1. JPEG decoder read window fix (750B → 32KB) for phone photos with large EXIF
 * 2. Per-processing-model pixel limit validation on authenticated route
 * 3. IMAGE_TOO_LARGE error code with actionable message
 */

// Small valid 64x64 PNG (within all model limits)
const SMALL_TEST_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAKElEQVR4nO3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAIC3AUFoAAFj6x6iAAAAAElFTkSuQmCC';

const UPSCALE_CONFIG = {
  scale: 2,
  qualityTier: 'quick' as const, // Uses a scale-preserving tiled fallback when available
  additionalOptions: {
    smartAnalysis: false,
    enhance: false,
    enhanceFaces: false,
    preserveText: false,
  },
};

let ctx: TestContext;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test.describe('GPU OOM Prevention: Authenticated Route', () => {
  test('should reject PNG exceeding the Quick 2x processing limit', async ({ request }) => {
    const user = await ctx.createUser({ credits: 100 });
    const api = new ApiClient(request).withAuth(user.token);

    const oversizedImage = createCanvas(2100, 2000);

    const response = await api.post('/api/upscale', {
      imageData: oversizedImage,
      mimeType: 'image/png',
      config: UPSCALE_CONFIG,
    });

    response.expectStatus(422);
    const body = await response.json();
    expect(body.error.code).toBe('IMAGE_TOO_LARGE');
    expect(body.error.message).toContain('original image dimensions');
    expect(body.error.message).toContain('smaller original');
  });

  test('should reject 3000x4000 JPEG (12MP phone photo scenario)', async ({ request }) => {
    const user = await ctx.createUser({ credits: 100 });
    const api = new ApiClient(request).withAuth(user.token);

    // 3000x4000 = 12MP — the exact scenario from the bug report
    const phonePhoto = createCanvas(3000, 4000, 'jpeg');

    const response = await api.post('/api/upscale', {
      imageData: phonePhoto,
      mimeType: 'image/jpeg',
      config: UPSCALE_CONFIG,
    });

    response.expectStatus(422);
    const body = await response.json();
    expect(body.error.code).toBe('IMAGE_TOO_LARGE');
    expect(body.error.message).toContain('3000');
    expect(body.error.message).toContain('4000');
  });

  test('should include pixel dimensions in error metadata', async ({ request }) => {
    const user = await ctx.createUser({ credits: 100 });
    const api = new ApiClient(request).withAuth(user.token);

    const oversizedImage = createCanvas(2100, 2000);

    const response = await api.post('/api/upscale', {
      imageData: oversizedImage,
      mimeType: 'image/png',
      config: UPSCALE_CONFIG,
    });

    response.expectStatus(422);
    const body = await response.json();
    expect(body.error.details).toBeDefined();
    expect(body.error.details.width).toBe(2100);
    expect(body.error.details.height).toBe(2000);
    expect(body.error.details.pixels).toBe(4_200_000);
    expect(body.error.details.maxPixels).toBe(2_096_704);
  });

  test('should accept the former 1.5MP boundary via the scale-preserving fallback', async ({
    request,
  }) => {
    const user = await ctx.createUser({ credits: 100 });
    const api = new ApiClient(request).withAuth(user.token);

    const justUnderImage = createCanvas(1300, 1300);

    const response = await api.post('/api/upscale', {
      imageData: justUnderImage,
      mimeType: 'image/png',
      config: UPSCALE_CONFIG,
    });

    // Should NOT be rejected for dimensions — may fail for other reasons
    // (processing, rate limiting) but NOT IMAGE_TOO_LARGE
    if (response.status === 422) {
      const body = await response.json();
      expect(body.error.code).not.toBe('IMAGE_TOO_LARGE');
    }
  });

  test('should not deduct credits when image is rejected for size', async ({ request }) => {
    const user = await ctx.createUser({ credits: 50 });
    const api = new ApiClient(request).withAuth(user.token);

    const oversizedImage = createCanvas(3000, 4000);

    const response = await api.post('/api/upscale', {
      imageData: oversizedImage,
      mimeType: 'image/png',
      config: UPSCALE_CONFIG,
    });

    response.expectStatus(422);

    // Credits should be unchanged — a follow-up request should not get 402
    const response2 = await api.post('/api/upscale', {
      imageData: SMALL_TEST_IMAGE,
      mimeType: 'image/png',
      config: UPSCALE_CONFIG,
    });

    expect(response2.status).not.toBe(402);
  });
});
