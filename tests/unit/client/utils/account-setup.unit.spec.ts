import { describe, expect, it, vi } from 'vitest';
import { completeAccountSetup } from '@client/utils/account-setup';

describe('completeAccountSetup', () => {
  it('should treat HTTP 500 as setup failure even when fetch resolves', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'Failed' }), { status: 500 }));

    await expect(completeAccountSetup('token', fetchImpl, async () => {})).rejects.toThrow(
      'Account setup returned HTTP 500'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('should return only after a terminal setup decision', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, setupStatus: 'complete' }), { status: 200 })
      );

    await expect(completeAccountSetup('token', fetchImpl)).resolves.toEqual({
      success: true,
      setupStatus: 'complete',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('should not accept a non-terminal successful response', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ success: true }), { status: 200 })
      );

    await expect(completeAccountSetup('token', fetchImpl, async () => {})).rejects.toThrow(
      'Account setup did not return a terminal decision'
    );
  });

  it('should return pending instead of throwing when setup never classifies', async () => {
    // A 202 pending response used to exhaust the retries and throw, which every
    // auth call site treated as fatal — the user was left on an error screen
    // holding a valid account.
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, setupStatus: 'pending', retryable: true }), {
        status: 202,
      })
    );

    await expect(completeAccountSetup('token', fetchImpl, async () => {})).resolves.toEqual({
      success: false,
      setupStatus: 'pending',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('should return complete when a retry settles after a pending response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, setupStatus: 'pending' }), { status: 202 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, setupStatus: 'complete' }), { status: 200 })
      );

    await expect(completeAccountSetup('token', fetchImpl, async () => {})).resolves.toEqual({
      success: true,
      setupStatus: 'complete',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('should back off between retries rather than firing them instantly', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: false, setupStatus: 'pending' }), { status: 202 })
      );

    await completeAccountSetup('token', fetchImpl, sleep);

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([150, 400]);
  });

  it('should still throw when every attempt is a hard failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(completeAccountSetup('token', fetchImpl, async () => {})).rejects.toThrow(
      'network down'
    );
  });
});
