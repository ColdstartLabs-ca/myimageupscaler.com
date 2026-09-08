import { describe, expect, it, vi } from 'vitest';
import { analyzeDeferredImage, createExecutionPreparer, resolveDeferredPlan } from './prepare';
import type { IExecutorExecution, IExecutorRpc } from './advance';
import type { IExecutorDatabase } from './index';

function execution(overrides: Partial<IExecutorExecution> = {}): IExecutorExecution {
  return {
    job_id: '11111111-1111-4111-8111-111111111111',
    user_id: '33333333-3333-4333-8333-333333333333',
    input_storage_path: '33333333-3333-4333-8333-333333333333/input.png',
    input_mime_type: 'image/png',
    input_width: 512,
    input_height: 512,
    scale: 2,
    quality_tier: 'auto',
    provider: 'deferred',
    billing_model_id: 'real-esrgan',
    resolved_model_id: 'real-esrgan',
    credits_reserved: 25,
    deadline_at: new Date(Date.now() + 60_000).toISOString(),
    config: {
      qualityTier: 'auto',
      scale: 2,
      additionalOptions: {},
      executionPlan: {
        deferredAnalysis: true,
        userTier: 'pro',
        isPaidUser: true,
        allowedModelIds: ['real-esrgan', 'gfpgan', 'clarity-upscaler'],
        reservedMaximumCredits: 25,
      },
    },
    ...overrides,
  } as IExecutorExecution;
}
describe('deferred execution planning', () => {
  it('uses an eligible Auto recommendation and lowers the authorized maximum', () => {
    const plan = resolveDeferredPlan(execution(), {
      recommendedModel: 'gfpgan',
      enhancementPrompt: 'Restore faces naturally.',
    });
    expect(plan.modelId).toBe('gfpgan');
    expect(plan.charge).toBeLessThan(25);
    expect(plan.config.enhancementPrompt).toBe('Restore faces naturally.');
  });
  it('preserves requested 4x when analysis recommends an incompatible model', () => {
    const row = execution();
    row.scale = 4;
    (row.config as Record<string, unknown>).scale = 4;
    const plan = resolveDeferredPlan(row, { recommendedModel: 'nano-banana' });
    expect(plan.modelId).toBe('real-esrgan');
    expect(plan.config.scale).toBe(4);
  });
  it('keeps paid oversized Quick fallback and bills the original Quick model', () => {
    const row = execution({ input_width: 2048, input_height: 2048 });
    const plan = resolveDeferredPlan(row, { recommendedModel: 'real-esrgan' });
    expect(plan.modelId).toBe('clarity-upscaler');
    expect(plan.charge).toBe(1);
  });
  it('keeps explicit smart-analysis model and custom instructions immutable', () => {
    const row = execution({
      quality_tier: 'face-restore',
      resolved_model_id: 'gfpgan',
      billing_model_id: 'gfpgan',
      credits_reserved: 3,
    });
    (row.config as Record<string, unknown>).qualityTier = 'face-restore';
    (row.config as Record<string, unknown>).additionalOptions = {
      smartAnalysis: true,
      customInstructions: 'Keep freckles.',
    };
    const plan = resolveDeferredPlan(row, {
      recommendedModel: 'clarity-upscaler',
      enhancementPrompt: 'Remove freckles.',
    });
    expect(plan.modelId).toBe('gfpgan');
    expect(plan.config.additionalOptions.customInstructions).toBe('Keep freckles.');
  });
  it('rejects a final charge above the approved reservation', () => {
    expect(() =>
      resolveDeferredPlan(execution({ credits_reserved: 1 }), {
        recommendedModel: 'clarity-upscaler',
      })
    ).toThrow('reservation');
  });
  it('bounds analysis output and safely falls back when unavailable', async () => {
    const transport = vi.fn(async () => new Response('x'.repeat(70_000)));
    await expect(
      analyzeDeferredImage(execution(), 'https://storage.test/signed', {
        fetch: transport,
        apiKey: 'fixture',
      })
    ).resolves.toEqual({});
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('persists lower charge and config before returning the immutable plan', async () => {
    const row = execution();
    const database = {
      rpc: vi.fn(async () => ({ data: true, error: null })),
    } as unknown as IExecutorDatabase;
    const rpc = {
      getExecution: vi.fn(async () => ({ ...row, provider: 'replicate' })),
    } as unknown as IExecutorRpc;
    await createExecutionPreparer({
      database,
      rpc,
      inputResolver: { resolve: async () => 'https://storage.test/input' },
      analyze: async () => ({ recommendedModel: 'real-esrgan' }),
    })(row);
    expect(database.rpc).toHaveBeenCalledWith(
      'resolve_upscale_execution_plan',
      expect.objectContaining({
        p_job_id: row.job_id,
        p_model_id: 'real-esrgan',
        p_charge: 1,
        p_config: expect.objectContaining({ scale: 2, qualityTier: 'quick' }),
      })
    );
  });
});
