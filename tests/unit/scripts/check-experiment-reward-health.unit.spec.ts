import { describe, expect, it } from 'vitest';
import {
  summarizeExperimentRewardHealth,
  toPaidExperimentCheckout,
  type IExperimentRewardHealthRow,
} from '@/scripts/check-experiment-reward-health';

function healthyRows(): IExperimentRewardHealthRow[] {
  return Array.from({ length: 7 }, (_, day) => ({
    report_day: `2026-07-${String(day + 1).padStart(2, '0')}`,
    paid_checkouts_with_known_assignment: 20,
    attributed_paid_checkouts: 19,
    attribution_rate: '0.9500',
    duplicate_reward_count: 0,
    healthy: true,
  }));
}

describe('check-experiment-reward-health script helpers', () => {
  it('should retain complete experiment metadata from paid checkout sessions', () => {
    expect(
      toPaidExperimentCheckout({
        id: 'cs_paid',
        created: 1_788_000_000,
        status: 'complete',
        payment_status: 'paid',
        metadata: {
          exp_key: 'purchase_modal_default_selection',
          exp_ctx: 'global',
          exp_arm_id: '42',
          exp_assign_key: 'assignment-1',
        },
      })
    ).toMatchObject({
      purchase_id: 'cs_paid',
      experiment_key: 'purchase_modal_default_selection',
      context_key: 'global',
      arm_id: 42,
      assignment_key: 'assignment-1',
    });
  });

  it('should exclude unpaid or incomplete attribution from the known-assignment denominator', () => {
    expect(
      toPaidExperimentCheckout({
        id: 'cs_unpaid',
        created: 1_788_000_000,
        status: 'complete',
        payment_status: 'unpaid',
        metadata: {},
      })
    ).toBeNull();
    expect(
      toPaidExperimentCheckout({
        id: 'cs_missing_arm',
        created: 1_788_000_000,
        status: 'complete',
        payment_status: 'paid',
        metadata: {
          exp_key: 'purchase_modal_default_selection',
          exp_ctx: 'global',
          exp_assign_key: 'assignment-1',
        },
      })
    ).toBeNull();
  });

  it('should pass only after seven daily gates pass', () => {
    expect(summarizeExperimentRewardHealth(healthyRows())).toEqual({
      healthy: true,
      reason: 'seven consecutive UTC days passed the rollout gate',
    });
  });

  it('should fail with missing evidence or any unhealthy day', () => {
    expect(summarizeExperimentRewardHealth(healthyRows().slice(0, 6)).healthy).toBe(false);
    const rows = healthyRows();
    rows[3] = { ...rows[3], duplicate_reward_count: 1, healthy: false };
    expect(summarizeExperimentRewardHealth(rows)).toEqual({
      healthy: false,
      reason: '1 day(s) missed the 95% attribution / zero-duplicate gate',
    });
  });
});
