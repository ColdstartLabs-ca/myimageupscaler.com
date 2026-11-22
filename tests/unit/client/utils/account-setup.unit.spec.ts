import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeAccountSetup } from '@client/utils/account-setup';

vi.mock('@shared/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-a' } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

const PENDING_KEY = 'miu_pending_signup_conversion';

const setupResponse = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('completeAccountSetup sign_up conversion marker', () => {
  it('marks the conversion only when the server reports a created account', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      setupResponse({
        success: true,
        setupStatus: 'complete',
        accountCreated: true,
        signupMethod: 'google',
        signupUserId: 'user-a',
      })
    );

    await expect(completeAccountSetup('token', fetchImpl)).resolves.toEqual({
      success: true,
      setupStatus: 'complete',
    });
    const pending = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) as string);
    expect(pending.method).toBe('google');
    expect(pending.userId).toBe('user-a');
    expect(Object.keys(pending).sort()).toEqual(['expiresAt', 'method', 'userId']);
  });

  it('does not mark a returning login', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        setupResponse({ success: true, setupStatus: 'complete', alreadySetup: true })
      );

    await completeAccountSetup('token', fetchImpl);
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('does not mark a failed setup', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(setupResponse({ error: 'Failed' }, 500));

    await expect(completeAccountSetup('token', fetchImpl, async () => {})).rejects.toThrow();
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('does not mark a pending setup', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(setupResponse({ success: false, setupStatus: 'pending' }, 202));

    await completeAccountSetup('token', fetchImpl, async () => {});
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

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
