/**
 * Pricing Bandit Service Tests
 *
 * Tests Thompson Sampling arm selection, Beta distribution sampling,
 * conversion recording, and fallback behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sampleBeta, selectBanditArm, recordBanditConversion } from '@/lib/pricing-bandit';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdate = vi.fn();
const mockFrom = vi.fn();

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── sampleBeta ───────────────────────────────────────────────────────────────

describe('sampleBeta', () => {
  it('returns value between 0 and 1', () => {
    for (let i = 0; i < 100; i++) {
      const sample = sampleBeta(1, 1);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });

  it('Beta(1,1) is approximately uniform — mean near 0.5', () => {
    const N = 2000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleBeta(1, 1);
    const mean = sum / N;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('Beta(10,1) is skewed high — mean near 10/11 ≈ 0.91', () => {
    const N = 2000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleBeta(10, 1);
    const mean = sum / N;
    expect(mean).toBeGreaterThan(0.85);
    expect(mean).toBeLessThan(0.97);
  });

  it('Beta(1,10) is skewed low — mean near 1/11 ≈ 0.09', () => {
    const N = 2000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleBeta(1, 10);
    const mean = sum / N;
    expect(mean).toBeGreaterThan(0.03);
    expect(mean).toBeLessThan(0.16);
  });

  it('high-conversion arm (50/100) scores above low-conversion arm (5/100) most of the time', () => {
    let highWins = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      // 50 conversions out of 100 impressions
      const highArm = sampleBeta(51, 51);
      // 5 conversions out of 100 impressions
      const lowArm = sampleBeta(6, 96);
      if (highArm > lowArm) highWins++;
    }
    // High-conversion arm should win most of the time (>90%)
    expect(highWins / N).toBeGreaterThan(0.9);
  });
});

// ─── selectBanditArm ─────────────────────────────────────────────────────────

describe('selectBanditArm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for standard region', async () => {
    const result = await selectBanditArm('standard');
    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null when DB query fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        }),
      }),
    });

    const result = await selectBanditArm('south_asia');
    expect(result).toBeNull();
  });

  it('returns null when no active arms exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const result = await selectBanditArm('south_asia');
    expect(result).toBeNull();
  });

  it('returns a valid IBanditResult when arms exist', async () => {
    const arms = [
      {
        id: 1,
        region: 'south_asia',
        discount_percent: 50,
        impressions: 0,
        conversions: 0,
        revenue_cents: 0,
      },
      {
        id: 2,
        region: 'south_asia',
        discount_percent: 65,
        impressions: 0,
        conversions: 0,
        revenue_cents: 0,
      },
    ];

    mockUpdate.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: arms, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const result = await selectBanditArm('south_asia');
    expect(result).not.toBeNull();
    expect(result!.isBanditArm).toBe(true);
    expect([1, 2]).toContain(result!.armId);
    expect([50, 65]).toContain(result!.discountPercent);
  });

  it('selected armId matches arm discountPercent', async () => {
    const arms = [
      {
        id: 10,
        region: 'latam',
        discount_percent: 35,
        impressions: 10,
        conversions: 5,
        revenue_cents: 5000,
      },
      {
        id: 11,
        region: 'latam',
        discount_percent: 55,
        impressions: 10,
        conversions: 1,
        revenue_cents: 800,
      },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: arms, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    // Run many times: selected arm's discountPercent must match its id
    for (let i = 0; i < 20; i++) {
      const result = await selectBanditArm('latam');
      expect(result).not.toBeNull();
      if (result!.armId === 10) expect(result!.discountPercent).toBe(35);
      if (result!.armId === 11) expect(result!.discountPercent).toBe(55);
    }
  });

  it('strongly favors high-revenue arm after sufficient data', async () => {
    // Arm 1: 50% discount, 40 conversions / 100 impressions, high revenue
    // Arm 2: 80% discount, 2 conversions / 100 impressions, low revenue
    const arms = [
      {
        id: 20,
        region: 'africa',
        discount_percent: 50,
        impressions: 100,
        conversions: 40,
        revenue_cents: 200000,
      },
      {
        id: 21,
        region: 'africa',
        discount_percent: 80,
        impressions: 100,
        conversions: 2,
        revenue_cents: 2000,
      },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: arms, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    let arm20Wins = 0;
    const N = 50;
    for (let i = 0; i < N; i++) {
      const result = await selectBanditArm('africa');
      if (result!.armId === 20) arm20Wins++;
    }
    // High-revenue arm should win the vast majority of the time
    expect(arm20Wins / N).toBeGreaterThan(0.8);
  });
});

// ─── recordBanditConversion ───────────────────────────────────────────────────

describe('recordBanditConversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments conversions and revenue_cents', async () => {
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const mockUpdateFn = vi.fn().mockReturnValue({ eq: mockUpdateEq });
    const mockSelectFn = vi
      .fn()
      .mockReturnValue({
        eq: vi
          .fn()
          .mockReturnValue({
            single: vi
              .fn()
              .mockResolvedValue({ data: { conversions: 3, revenue_cents: 1500 }, error: null }),
          }),
      });

    mockFrom.mockReturnValue({
      select: mockSelectFn,
      update: mockUpdateFn,
    });

    await recordBanditConversion(5, 900);

    // Should have called update with incremented values
    expect(mockUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversions: 4,
        revenue_cents: 2400,
      })
    );
  });

  it('handles DB fetch error gracefully without throwing', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        }),
      }),
    });

    // Should not throw
    await expect(recordBanditConversion(1, 500)).resolves.toBeUndefined();
  });

  it('handles DB update error gracefully without throwing', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: { conversions: 1, revenue_cents: 500 }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: new Error('Update failed') }),
      }),
    });

    // Should not throw
    await expect(recordBanditConversion(1, 500)).resolves.toBeUndefined();
  });
});
