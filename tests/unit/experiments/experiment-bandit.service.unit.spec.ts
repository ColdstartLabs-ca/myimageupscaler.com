import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assignExperimentArm,
  recordExperimentReward,
  validateExperimentCheckoutAttribution,
} from '@lib/experiments';

interface IArmRow {
  id: number;
  experiment_key: string;
  context_key: string;
  arm_key: string;
  arm_config: Record<string, unknown>;
  impressions: number;
  rewards: number;
  revenue_cents: number;
  is_active: boolean;
}

interface IAssignmentRow {
  experiment_key: string;
  context_key: string;
  arm_id: number;
  assignment_key: string;
  surface: string;
}

const arms: IArmRow[] = [];
const assignments: IAssignmentRow[] = [];
const rewards: unknown[] = [];

async function recordRewardRpc(params: Record<string, unknown>) {
  const assignment = assignments.find(
    row =>
      row.experiment_key === params.p_experiment_key &&
      row.context_key === params.p_context_key &&
      row.assignment_key === params.p_assignment_key
  );
  if (!assignment) return { data: 'missing_assignment', error: null };
  const arm = arms.find(
    row =>
      row.id === params.p_arm_id &&
      row.experiment_key === params.p_experiment_key &&
      row.context_key === params.p_context_key
  );
  if (!arm || assignment.arm_id !== params.p_arm_id) {
    return { data: 'invalid_arm', error: null };
  }
  const duplicate = rewards.some(
    reward =>
      (reward as Record<string, unknown>).purchaseId === params.p_purchase_id &&
      (reward as Record<string, unknown>).experimentKey === params.p_experiment_key
  );
  if (duplicate) return { data: 'duplicate', error: null };
  rewards.push({
    purchaseId: params.p_purchase_id,
    experimentKey: params.p_experiment_key,
  });
  arm.rewards += Number(params.p_reward_value);
  arm.revenue_cents += Number(params.p_revenue_cents);
  return { data: 'recorded', error: null };
}

class QueryBuilder {
  private filters: Record<string, unknown> = {};
  private operation: 'select' | 'insert' | 'update' | null = null;
  private payload: Record<string, unknown> | null = null;

  constructor(private table: string) {}

  select(): this {
    this.operation = 'select';
    return this;
  }

  eq(key: string, value: unknown): this {
    this.filters[key] = value;
    return this;
  }

  insert(payload: Record<string, unknown>): Promise<{ error: Error | null }> {
    if (this.table === 'experiment_assignments') {
      const duplicate = assignments.some(
        row =>
          row.experiment_key === payload.experiment_key &&
          row.context_key === payload.context_key &&
          row.assignment_key === payload.assignment_key
      );
      if (duplicate) return Promise.resolve({ error: new Error('duplicate') });
      assignments.push(payload as unknown as IAssignmentRow);
    }
    if (this.table === 'experiment_rewards') {
      rewards.push(payload);
    }
    return Promise.resolve({ error: null });
  }

  update(payload: Record<string, unknown>): this {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  maybeSingle(): Promise<{ data: unknown; error: null }> {
    if (this.table === 'experiment_assignments') {
      return Promise.resolve({ data: this.filterRows(assignments)[0] ?? null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  single(): Promise<{ data: unknown; error: Error | null }> {
    const rows = this.table === 'experiment_arms' ? this.filterRows(arms) : [];
    return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : new Error('missing') });
  }

  then(resolve: (value: { data?: unknown; error: Error | null }) => void): void {
    if (this.operation === 'update' && this.table === 'experiment_arms' && this.payload) {
      const row = arms.find(arm => arm.id === this.filters.id);
      if (row) Object.assign(row, this.payload);
      resolve({ error: null });
      return;
    }

    if (this.operation === 'select' && this.table === 'experiment_arms') {
      resolve({ data: this.filterRows(arms), error: null });
      return;
    }

    resolve({ data: [], error: null });
  }

  private filterRows<T extends Record<string, unknown>>(rows: T[]): T[] {
    return rows.filter(row =>
      Object.entries(this.filters).every(([key, value]) => row[key] === value)
    );
  }
}

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => new QueryBuilder(table),
    rpc: (_name: string, params: Record<string, unknown>) => recordRewardRpc(params),
  },
}));

describe('experiment bandit service', () => {
  beforeEach(() => {
    arms.splice(0, arms.length);
    assignments.splice(0, assignments.length);
    rewards.splice(0, rewards.length);
    arms.push(
      {
        id: 10,
        experiment_key: 'purchase_modal_default_selection',
        context_key: 'global',
        arm_key: 'control',
        arm_config: { description: 'control' },
        impressions: 0,
        rewards: 0,
        revenue_cents: 0,
        is_active: true,
      },
      {
        id: 11,
        experiment_key: 'purchase_modal_default_selection',
        context_key: 'global',
        arm_key: 'compact',
        arm_config: { layout: 'compact' },
        impressions: 0,
        rewards: 0,
        revenue_cents: 0,
        is_active: true,
      }
    );
  });

  it('selects an active arm and records assignment', async () => {
    const assignment = await assignExperimentArm({
      experimentKey: 'purchase_modal_default_selection',
      contextKey: 'global',
      assignmentKey: 'session:abc',
      assignmentScope: 'session',
      surface: 'purchase_modal',
    });

    expect(assignment).not.toBeNull();
    expect([10, 11]).toContain(assignment?.armId);
    expect(assignments).toHaveLength(1);
    expect(arms.reduce((sum, arm) => sum + arm.impressions, 0)).toBe(1);
  });

  it('reuses stable assignment key', async () => {
    const first = await assignExperimentArm({
      experimentKey: 'purchase_modal_default_selection',
      contextKey: 'global',
      assignmentKey: 'session:stable',
      assignmentScope: 'session',
      surface: 'purchase_modal',
    });
    const second = await assignExperimentArm({
      experimentKey: 'purchase_modal_default_selection',
      contextKey: 'global',
      assignmentKey: 'session:stable',
      assignmentScope: 'session',
      surface: 'purchase_modal',
    });

    expect(second?.armId).toBe(first?.armId);
    expect(assignments).toHaveLength(1);
    expect(arms.reduce((sum, arm) => sum + arm.impressions, 0)).toBe(1);
  });

  it('records revenue reward', async () => {
    assignments.push({
      experiment_key: 'purchase_modal_default_selection',
      context_key: 'global',
      arm_id: 10,
      assignment_key: 'session:abc',
      surface: 'purchase_modal',
    });

    await expect(
      recordExperimentReward({
        experimentKey: 'purchase_modal_default_selection',
        contextKey: 'global',
        armId: 10,
        assignmentKey: 'session:abc',
        purchaseId: 'cs_test_123',
        rewardType: 'purchase_confirmed',
        revenueCents: 1499,
      })
    ).resolves.toBe('recorded');

    expect(rewards).toHaveLength(1);
    expect(arms[0].rewards).toBe(1);
    expect(arms[0].revenue_cents).toBe(1499);
  });

  it('should ignore duplicate Stripe purchase reward', async () => {
    assignments.push({
      experiment_key: 'purchase_modal_default_selection',
      context_key: 'global',
      arm_id: 10,
      assignment_key: 'session:abc',
      surface: 'purchase_modal',
    });
    const request = {
      experimentKey: 'purchase_modal_default_selection',
      contextKey: 'global',
      armId: 10,
      assignmentKey: 'session:abc',
      purchaseId: 'cs_test_duplicate',
      rewardType: 'purchase_confirmed',
      revenueCents: 1499,
    };

    await expect(recordExperimentReward(request)).resolves.toBe('recorded');
    await expect(recordExperimentReward(request)).resolves.toBe('duplicate');

    expect(rewards).toHaveLength(1);
    expect(arms[0].rewards).toBe(1);
    expect(arms[0].revenue_cents).toBe(1499);
  });

  it('should report missing assignment without recording reward', async () => {
    await expect(
      recordExperimentReward({
        experimentKey: 'purchase_modal_default_selection',
        contextKey: 'global',
        armId: 10,
        assignmentKey: 'session:missing',
        purchaseId: 'cs_test_missing',
        rewardType: 'purchase_confirmed',
        revenueCents: 1499,
      })
    ).resolves.toBe('missing_assignment');

    expect(rewards).toHaveLength(0);
    expect(arms[0].rewards).toBe(0);
  });

  it('should report invalid arm without recording reward', async () => {
    assignments.push({
      experiment_key: 'purchase_modal_default_selection',
      context_key: 'global',
      arm_id: 10,
      assignment_key: 'session:abc',
      surface: 'purchase_modal',
    });

    await expect(
      recordExperimentReward({
        experimentKey: 'purchase_modal_default_selection',
        contextKey: 'global',
        armId: 11,
        assignmentKey: 'session:abc',
        purchaseId: 'cs_test_invalid',
        rewardType: 'purchase_confirmed',
        revenueCents: 1499,
      })
    ).resolves.toBe('invalid_arm');

    expect(rewards).toHaveLength(0);
    expect(arms.every(arm => arm.rewards === 0)).toBe(true);
  });

  it('should validate a complete assignment for checkout metadata', async () => {
    assignments.push({
      experiment_key: 'purchase_modal_default_selection',
      context_key: 'global',
      arm_id: 10,
      assignment_key: 'session:abc',
      surface: 'purchase_modal',
    });

    await expect(
      validateExperimentCheckoutAttribution({
        experimentKey: 'purchase_modal_default_selection',
        contextKey: 'global',
        armId: 10,
        armKey: 'control',
        assignmentKey: 'session:abc',
      })
    ).resolves.toEqual({
      valid: true,
      attribution: {
        experimentKey: 'purchase_modal_default_selection',
        contextKey: 'global',
        armId: 10,
        armKey: 'control',
        assignmentKey: 'session:abc',
      },
    });
  });

  it('should reject checkout attribution when the arm does not match assignment', async () => {
    assignments.push({
      experiment_key: 'purchase_modal_default_selection',
      context_key: 'global',
      arm_id: 10,
      assignment_key: 'session:abc',
      surface: 'purchase_modal',
    });

    await expect(
      validateExperimentCheckoutAttribution({
        experimentKey: 'purchase_modal_default_selection',
        contextKey: 'global',
        armId: 11,
        armKey: 'compact',
        assignmentKey: 'session:abc',
      })
    ).resolves.toEqual({ valid: false, reason: 'assignment_mismatch' });
  });

  it('returns null when no active arms exist', async () => {
    arms.splice(0, arms.length);

    const assignment = await assignExperimentArm({
      experimentKey: 'missing',
      assignmentKey: 'session:none',
      assignmentScope: 'session',
      surface: 'purchase_modal',
    });

    expect(assignment).toBeNull();
  });
});
