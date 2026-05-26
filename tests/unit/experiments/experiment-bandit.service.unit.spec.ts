import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignExperimentArm, recordExperimentReward } from '@lib/experiments';

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
    await recordExperimentReward({
      experimentKey: 'purchase_modal_default_selection',
      contextKey: 'global',
      armId: 10,
      rewardType: 'purchase_confirmed',
      revenueCents: 1499,
    });

    expect(rewards).toHaveLength(1);
    expect(arms[0].rewards).toBe(1);
    expect(arms[0].revenue_cents).toBe(1499);
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
