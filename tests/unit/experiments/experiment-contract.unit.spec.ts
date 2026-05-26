import { describe, expect, it } from 'vitest';
import { EXPERIMENT_CHECKOUT_METADATA_KEYS } from '@shared/types/experiments.types';
import type { IExperimentAssignment } from '@shared/types/experiments.types';

describe('experiment platform contract', () => {
  it('assignment response matches contract', () => {
    const assignment: IExperimentAssignment = {
      experimentKey: 'purchase_modal_default_selection',
      contextKey: 'global',
      armId: 123,
      armKey: 'compact_credit_picker',
      armConfig: { visiblePacks: ['small', 'medium'] },
      assignmentKey: 'session:abc',
      surface: 'purchase_modal',
    };

    expect(Object.keys(assignment).sort()).toEqual([
      'armConfig',
      'armId',
      'armKey',
      'assignmentKey',
      'contextKey',
      'experimentKey',
      'surface',
    ]);
  });

  it('checkout metadata keys stay compact', () => {
    expect(Object.values(EXPERIMENT_CHECKOUT_METADATA_KEYS)).toEqual([
      'exp_key',
      'exp_ctx',
      'exp_arm_id',
      'exp_arm_key',
      'exp_assign_key',
    ]);
    for (const key of Object.values(EXPERIMENT_CHECKOUT_METADATA_KEYS)) {
      expect(key.length).toBeLessThanOrEqual(14);
    }
  });
});
