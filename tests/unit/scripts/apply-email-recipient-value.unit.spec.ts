import { describe, expect, it, vi } from 'vitest';

const applyRunMock = vi.hoisted(() => vi.fn());

vi.mock('@server/services/email-recipient-value.service', () => ({
  RECIPIENT_VALUE_POLICY_VERSION: 'v1',
  getEmailRecipientValueService: () => ({ applyRun: applyRunMock }),
}));

import {
  buildApplyEmailRecipientValueOutput,
  parseApplyEmailRecipientValueArgs,
  runApplyEmailRecipientValue,
} from '../../../scripts/apply-email-recipient-value';

const validArgs = [
  '--write',
  '--action',
  'apply',
  '--run-id',
  'run-1',
  '--policy-version',
  'v1',
  '--expected-count',
  '10',
];

describe('apply-email-recipient-value CLI', () => {
  it('should refuse apply without write flag', () => {
    expect(() => parseApplyEmailRecipientValueArgs(validArgs.slice(1))).toThrow(/Refusing/);
    expect(applyRunMock).not.toHaveBeenCalled();
  });

  it('should require the exact policy, action, run, and expected count guards', () => {
    expect(parseApplyEmailRecipientValueArgs(validArgs)).toEqual({
      action: 'apply',
      write: true,
      runId: 'run-1',
      policyVersion: 'v1',
      expectedCount: 10,
    });
    expect(() => parseApplyEmailRecipientValueArgs([...validArgs.slice(0, -1), '9'])).not.toThrow();
    expect(() =>
      parseApplyEmailRecipientValueArgs(
        validArgs.filter(arg => arg !== '--expected-count' && arg !== '10')
      )
    ).toThrow(/expected-count/);
  });

  it('should refuse an apply when the persisted expected count differs before mutation', async () => {
    applyRunMock.mockRejectedValueOnce(new Error('expected count differs'));

    await expect(
      runApplyEmailRecipientValue(parseApplyEmailRecipientValueArgs(validArgs))
    ).rejects.toThrow(/expected count differs/);
    expect(applyRunMock).toHaveBeenCalledOnce();
  });

  it('should return aggregate counts only', () => {
    expect(
      buildApplyEmailRecipientValueOutput({
        runId: 'run-1',
        action: 'apply',
        mode: 'applied',
        changedCount: 4,
        cancelledCount: 2,
        heldCount: 1,
        keptCount: 1,
      })
    ).toEqual({
      run_id: 'run-1',
      action: 'apply',
      mode: 'applied',
      changed_count: 4,
      cancelled_count: 2,
      held_count: 1,
      kept_count: 1,
    });
  });
});
