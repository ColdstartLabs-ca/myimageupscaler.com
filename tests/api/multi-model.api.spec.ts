import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';
import type { IModelInfo } from '../../shared/types/coreflow.types';

test.describe('API: Multi-Model Architecture', () => {
  let ctx: TestContext;
  let api: ApiClient;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.beforeEach(async ({ request }) => {
    api = new ApiClient(request);
  });

  test.describe('Analyze Image Endpoint', () => {
    test('should require authentication', async () => {
      const response = await api.post('/api/analyze-image', {
        imageData: 'dGVzdA==',
        mimeType: 'image/jpeg',
      });

      response.expectStatus(401);
      await response.expectErrorCode('UNAUTHORIZED');
    });

    test('should validate required fields', async () => {
      const user = await ctx.createUser({ credits: 10 });

      const response = await api.withAuth(user.token).post('/api/analyze-image', {
        mimeType: 'image/jpeg',
      });

      response.expectStatus(400);
      await response.expectErrorCode('VALIDATION_ERROR');
    });

    test('should analyze valid image and return results', async () => {
      const user = await ctx.createUser({
        subscription: 'active',
        tier: 'pro',
        credits: 10,
      });

      // Use valid base64 test data (uniform pattern detected by mock analysis)
      const mockImageData = Buffer.alloc(1024, 'A').toString('base64');

      const response = await api.withAuth(user.token).post('/api/analyze-image', {
        imageData: mockImageData,
        mimeType: 'image/jpeg',
      });

      response.expectStatus(200);
      const data = await response.json();

      expect(data).toHaveProperty('analysis');
      expect(data).toHaveProperty('recommendation');

      const analysis = data.analysis;
      expect(analysis).toHaveProperty('damageLevel');
      expect(analysis).toHaveProperty('faceCount');
      expect(analysis).toHaveProperty('textCoverage');
      expect(analysis).toHaveProperty('noiseLevel');
      expect(analysis).toHaveProperty('contentType');
      expect(analysis).toHaveProperty('resolution');

      expect(analysis.damageLevel).toBeGreaterThanOrEqual(0);
      expect(analysis.damageLevel).toBeLessThanOrEqual(1);
    });
  });

  test.describe('Credit Estimate Endpoint', () => {
    test('should require authentication', async () => {
      const response = await api.post('/api/credit-estimate', {
        config: {
          mode: 'upscale',
          scale: 2,
        },
      });

      response.expectStatus(401);
      await response.expectErrorCode('UNAUTHORIZED');
    });

    test('should validate required config field', async () => {
      const user = await ctx.createUser({ credits: 10 });

      const response = await api.withAuth(user.token).post('/api/credit-estimate', {});

      response.expectStatus(400);
      await response.expectErrorCode('VALIDATION_ERROR');
    });

    test('should provide estimate for basic upscale', async () => {
      const user = await ctx.createUser({ credits: 10 });

      const response = await api.withAuth(user.token).post('/api/credit-estimate', {
        config: {
          mode: 'upscale',
          scale: 2,
          qualityLevel: 'standard',
          preserveText: false,
          enhanceFaces: false,
          denoise: false,
          autoModelSelection: true,
        },
      });

      response.expectStatus(200);
      const data = await response.json();

      expect(data).toHaveProperty('breakdown');
      expect(data).toHaveProperty('modelToBe');
      expect(data).toHaveProperty('estimatedProcessingTime');
      expect(data.breakdown.totalCredits).toBeGreaterThan(0);
    });

    test('should handle tier restrictions', async () => {
      const freeUser = await ctx.createUser({
        subscription: 'free',
        tier: 'free',
        credits: 50,
      });

      const config = {
        mode: 'upscale' as const,
        scale: 2 as const,
        qualityLevel: 'standard' as const,
        preserveText: false,
        enhanceFaces: false,
        denoise: false,
        autoModelSelection: false,
        selectedModel: 'nano-banana-pro',
      };

      const freeResponse = await api.withAuth(freeUser.token).post('/api/credit-estimate', {
        config,
      });

      freeResponse.expectStatus(403);
      await freeResponse.expectErrorCode('TIER_RESTRICTED');
    });
  });

  test.describe('Models Endpoint', () => {
    test('should require authentication', async () => {
      const response = await api.get('/api/models');

      response.expectStatus(401);
      await response.expectErrorCode('UNAUTHORIZED');
    });

    test('should return available models for user tier', async () => {
      const user = await ctx.createUser({
        subscription: 'free',
        tier: 'free',
        credits: 10,
      });

      const response = await api.withAuth(user.token).get('/api/models');

      response.expectStatus(200);
      const data = await response.json();

      expect(data).toHaveProperty('models');
      expect(data).toHaveProperty('defaultModel');
      expect(Array.isArray(data.models)).toBe(true);
      expect(data.models.length).toBeGreaterThan(0);

      const availableModels = data.models.filter((m: IModelInfo) => m.available);
      const availableModelIds = availableModels.map((m: IModelInfo) => m.id);

      expect(availableModelIds).toContain('real-esrgan');
      expect(availableModelIds).not.toContain('nano-banana-pro');
    });

    test('should include correct model metadata', async () => {
      const user = await ctx.createUser({
        subscription: 'active',
        tier: 'pro',
        credits: 500,
      });

      const response = await api.withAuth(user.token).get('/api/models');

      response.expectStatus(200);
      const data = await response.json();

      data.models.forEach((model: IModelInfo) => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('displayName');
        expect(model).toHaveProperty('description');
        expect(model).toHaveProperty('creditCost');
        expect(model).toHaveProperty('capabilities');
        expect(model).toHaveProperty('available');

        expect(typeof model.creditCost).toBe('number');
        expect(model.creditCost).toBeGreaterThan(0);
      });
    });

    test('should correctly enforce tier restrictions', async () => {
      const freeUser = await ctx.createUser({
        subscription: 'free',
        tier: 'free',
        credits: 10,
      });

      const freeResponse = await api.withAuth(freeUser.token).get('/api/models');
      freeResponse.expectStatus(200);
      const freeData = await freeResponse.json();

      const nanoBananaProModel = freeData.models.find(
        (m: IModelInfo) => m.id === 'nano-banana-pro'
      );
      expect(nanoBananaProModel).toBeDefined();
      expect(nanoBananaProModel.available).toBe(false);
      expect(nanoBananaProModel.requiresTier).toBe('hobby');
    });
  });
});
