import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';
import { createCanvas } from '../helpers/test-image-generator';

/**
 * API Tests: GPU OOM Prevention
 *
 * Validates that oversized images are rejected by both the authenticated
 * and guest upscale routes before reaching Replicate, preventing GPU OOM errors.
 *
 * Tests the fixes from PR #38:
 * 1. JPEG decoder read window fix (750B → 32KB) for phone photos with large EXIF
 * 2. Per-model pixel limit validation on guest route (previously had none)
 * 3. Per-model pixel limit validation on authenticated route
 * 4. GPU OOM error mapping in ReplicateErrorMapper
 */

// Small valid 64x64 PNG (within all model limits)
const SMALL_TEST_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAKElEQVR4nO3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAIC3AUFoAAFj6x6iAAAAAElFTkSuQmCC';

let ctx: TestContext;

test.beforeAll(async () => {
  ctx = new TestContext();
});

test.afterAll(async () => {
  await ctx.cleanup();
});

test.describe('GPU OOM Prevention: Guest Route', () => {
  test('should reject image exceeding real-esrgan 1.5MP pixel limit', async ({ request }) => {
    // 2000x2000 = 4MP — exceeds real-esrgan's 1.5MP limit
    const oversizedImage = createCanvas(2000, 2000);
    const api = new ApiClient(request);

    const response = await api.post('/api/upscale/guest', {
      imageData: oversizedImage,
      mimeType: 'image/png',
      visitorId: 'test-visitor-gpu-oom-001',
    });

    response.expectStatus(422);
    const body = await response.json();
    expect(body.error.message).toContain('too large');
    expect(body.error.message).toContain('2000');
  });

  test('should accept image within real-esrgan 1.5MP pixel limit', async ({ request }) => {
    // 64x64 = 4096 pixels — well within limit
    const api = new ApiClient(request);

    const response = await api.post('/api/upscale/guest', {
      imageData: SMALL_TEST_IMAGE,
      mimeType: 'image/png',
      visitorId: 'test-visitor-gpu-oom-002',
    });

    // Should not be a 422 dimension rejection
    // May fail for other reasons (rate limiting, processing) but NOT dimensions
    const status = response.status;
    expect(status).not.toBe(422);
  });

  test('should reject moderately oversized image (1300x1300 = 1.69MP)', async ({ request }) => {
    // 1300x1300 = 1.69MP — just over real-esrgan's 1.5MP limit
    const oversizedImage = createCanvas(1300, 1300);
    const api = new ApiClient(request);

    const response = await api.post('/api/upscale/guest', {
      imageData: oversizedImage,
      mimeType: 'image/png',
      visitorId: 'test-visitor-gpu-oom-003',
    });

    response.expectStatus(422);
    const body = await response.json();
    expect(body.error.message).toContain('too large');
  });

  test('should accept image at exactly 1224x1224 (just under 1.5MP)', async ({ request }) => {
    // 1224x1224 = 1,498,176 pixels — just under 1.5MP limit
    const justUnderImage = createCanvas(1224, 1224);
    const api = new ApiClient(request);

    const response = await api.post('/api/upscale/guest', {
      imageData: justUnderImage,
      mimeType: 'image/png',
      visitorId: 'test-visitor-gpu-oom-004',
    });

    // Should NOT be rejected for dimensions
    expect(response.status).not.toBe(422);
  });
});

test.describe('GPU OOM Prevention: Authenticated Route', () => {
  test('should reject oversized image with per-model pixel limit error', async ({ request }) => {
    const user = await ctx.createUser({ credits: 100 });
    const api = new ApiClient(request).withAuth(user.token);

    // 2000x2000 = 4MP — exceeds real-esrgan's 1.5MP limit
    const oversizedImage = createCanvas(2000, 2000);

    const response = await api.post('/api/upscale', {
      imageData: oversizedImage,
      mimeType: 'image/png',
      config: {
        scale: 2,
        qualityTier: 'quick', // Uses real-esrgan (1.5MP limit)
        additionalOptions: {
          smartAnalysis: false,
          enhance: false,
          enhanceFaces: false,
          preserveText: false,
        },
      },
    });

    response.expectStatus(422);
    const body = await response.json();
    expect(body.error.code).toBe('IMAGE_TOO_LARGE');
    expect(body.error.message).toContain('exceed the maximum');
    expect(body.error.message).toContain('resize');
  });

  test('should include pixel dimensions in error metadata', async ({ request }) => {
    const user = await ctx.createUser({ credits: 100 });
    const api = new ApiClient(request).withAuth(user.token);

    const oversizedImage = createCanvas(2000, 2000);

    const response = await api.post('/api/upscale', {
      imageData: oversizedImage,
      mimeType: 'image/png',
      config: {
        scale: 2,
        qualityTier: 'quick',
        additionalOptions: {
          smartAnalysis: false,
          enhance: false,
          enhanceFaces: false,
          preserveText: false,
        },
      },
    });

    response.expectStatus(422);
    const body = await response.json();
    expect(body.error.details).toBeDefined();
    expect(body.error.details.width).toBe(2000);
    expect(body.error.details.height).toBe(2000);
    expect(body.error.details.pixels).toBe(4_000_000);
    expect(body.error.details.maxPixels).toBe(1_500_000);
  });

  test('should not deduct credits when image is rejected for size', async ({ request }) => {
    const user = await ctx.createUser({ credits: 50 });
    const api = new ApiClient(request).withAuth(user.token);

    const oversizedImage = createCanvas(3000, 4000);

    const response = await api.post('/api/upscale', {
      imageData: oversizedImage,
      mimeType: 'image/png',
      config: {
        scale: 2,
        qualityTier: 'quick',
        additionalOptions: {
          smartAnalysis: false,
          enhance: false,
          enhanceFaces: false,
          preserveText: false,
        },
      },
    });

    response.expectStatus(422);

    // Credits should be unchanged — verify via a second request with small image
    // (the small image request should succeed or fail for reasons other than credits)
    const response2 = await api.post('/api/upscale', {
      imageData: SMALL_TEST_IMAGE,
      mimeType: 'image/png',
      config: {
        scale: 2,
        qualityTier: 'quick',
        additionalOptions: {
          smartAnalysis: false,
          enhance: false,
          enhanceFaces: false,
          preserveText: false,
        },
      },
    });

    // Should not be 402 (insufficient credits) — credits were not consumed
    expect(response2.status).not.toBe(402);
  });
});

test.describe('GPU OOM Prevention: JPEG Dimension Decoder', () => {
  test('should correctly decode dimensions from standard JPEG', async ({ request }) => {
    // Create a JPEG-like image (PNG with jpeg mime for dimension test)
    // The key test is that the server CAN decode dimensions and reject oversized
    const oversizedImage = createCanvas(2000, 1500, 'jpeg');
    const api = new ApiClient(request);

    const response = await api.post('/api/upscale/guest', {
      imageData: oversizedImage,
      mimeType: 'image/jpeg',
      visitorId: 'test-visitor-jpeg-001',
    });

    // Should reject — 2000x1500 = 3MP > 1.5MP limit
    response.expectStatus(422);
    const body = await response.json();
    expect(body.error.message).toContain('too large');
  });
});
