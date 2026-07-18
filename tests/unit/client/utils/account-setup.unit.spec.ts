import { describe, expect, it, vi } from 'vitest';
import { completeAccountSetup } from '@client/utils/account-setup';

describe('completeAccountSetup', () => {
  it('should treat HTTP 500 as setup failure even when fetch resolves', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'Failed' }), { status: 500 }));

    await expect(completeAccountSetup('token', fetchImpl)).rejects.toThrow(
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

    await expect(completeAccountSetup('token', fetchImpl)).rejects.toThrow(
      'Account setup did not return a terminal decision'
    );
  });
});
