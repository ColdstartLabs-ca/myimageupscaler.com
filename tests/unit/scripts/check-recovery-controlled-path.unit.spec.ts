import { describe, expect, it } from 'vitest';
import {
  assertControlledPathArgs,
  buildControlledQueuePayload,
  parseControlledPathArgs,
} from '@/scripts/check-recovery-controlled-path';

describe('check-recovery-controlled-path script helpers', () => {
  it('should require explicit write mode and a controlled user id', () => {
    expect(() => assertControlledPathArgs(parseControlledPathArgs([]))).toThrow(
      'Refusing to mutate data'
    );
    expect(() => assertControlledPathArgs(parseControlledPathArgs(['--write']))).toThrow(
      '--user-id is required'
    );
    expect(() =>
      assertControlledPathArgs(parseControlledPathArgs(['--write', '--user-id', 'user_123']))
    ).not.toThrow();
  });

  it('should parse safety flags and user context', () => {
    expect(
      parseControlledPathArgs([
        '--write',
        '--user-id=user_123',
        '--email',
        'test@example.com',
        '--allow-existing',
        '--keep-rows',
      ])
    ).toEqual({
      write: true,
      keepRows: true,
      allowExisting: true,
      userId: 'user_123',
      email: 'test@example.com',
    });
  });

  it('should build a tagged pending queue row without sending email', () => {
    const payload = buildControlledQueuePayload({
      runId: 'run_123',
      userId: 'user_123',
      email: 'test@example.com',
    });

    expect(payload).toMatchObject({
      campaign_key: 'checkout-abandoned-24h',
      user_id: 'user_123',
      recipient_email: 'test@example.com',
      status: 'pending',
      metadata: {
        verifier: 'controlled_self_verify',
        verifier_run_id: 'run_123',
        audience_key: 'checkout_abandoner',
      },
      template_data: {
        recoveryAudience: 'checkout_abandoner',
      },
    });
  });
});
