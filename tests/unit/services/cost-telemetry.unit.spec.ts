import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: () => ({ insert: mocks.insert }),
  },
}));

import { recordProcessingCostTelemetry } from '@server/services/cost-telemetry.service';

describe('processing cost telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
  });

  it('should record model, resolution and provider cost for each run', async () => {
    await recordProcessingCostTelemetry({
      userId: 'user-1',
      jobId: 'job-1',
      outputImagePath: 'https://example.com/output.png',
      attribution: {
        modelId: 'nano-banana-pro',
        qualityTier: 'ultra',
        scale: 2,
        effectiveResolution: '4K',
        providerCostUsd: 0.3,
        creditsCharged: 25,
        pricingModel: 'per-resolution',
      },
    });

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        status: 'completed',
        model_id: 'nano-banana-pro',
        quality_tier: 'ultra',
        scale: 2,
        effective_resolution: '4K',
        provider_cost_usd: 0.3,
        credits_charged: 25,
        credits_used: 25,
        settings: {
          provider_job_id: 'job-1',
          pricing_model: 'per-resolution',
        },
      })
    );
  });

  it('should not fail the run when telemetry insert throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.insert.mockRejectedValue(new Error('telemetry unavailable'));

    await expect(
      recordProcessingCostTelemetry({
        userId: 'user-1',
        jobId: 'job-2',
        attribution: {
          modelId: 'real-esrgan',
          qualityTier: 'quick',
          scale: 2,
          providerCostUsd: 0.0017,
          creditsCharged: 1,
          pricingModel: 'flat',
        },
      })
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to record processing cost telemetry:',
      expect.any(Error)
    );

    consoleError.mockRestore();
  });
});
