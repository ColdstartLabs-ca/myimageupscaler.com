import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  completeAccountSetup: vi.fn(),
  handlePostAuthRedirect: vi.fn(),
  analyticsTrack: vi.fn(),
}));

vi.mock('@client/utils/account-setup', () => ({
  completeAccountSetup: mocks.completeAccountSetup,
}));
vi.mock('@client/store/auth/postAuthRedirect', () => ({
  handlePostAuthRedirect: mocks.handlePostAuthRedirect,
}));
vi.mock('@client/analytics', () => ({
  analytics: {
    identify: vi.fn().mockResolvedValue(undefined),
    track: mocks.analyticsTrack,
  },
}));
vi.mock('@client/store/profileStore', () => ({
  useProfileStore: { getState: () => ({ reset: vi.fn() }) },
}));

import { createAuthStateHandler } from '@client/store/auth/authStateHandler';
import { createSignInWithEmail } from '@client/store/auth/authOperations';

function session(): Session {
  return {
    access_token: 'access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 0,
    refresh_token: 'refresh-token',
    user: {
      id: 'user-1',
      email: 'user@example.com',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-07-18T00:00:00.000Z',
    },
  };
}

function supabaseClient(authResult?: unknown): SupabaseClient {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue(authResult),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'user' }, error: null }),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe('auth account setup gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.completeAccountSetup.mockResolvedValue({ success: true, setupStatus: 'complete' });
    mocks.handlePostAuthRedirect.mockResolvedValue(undefined);
  });

  it('does not redirect a SIGNED_IN event when account setup fails', async () => {
    mocks.completeAccountSetup.mockRejectedValue(new Error('setup failed'));
    const setState = vi.fn();
    const handler = createAuthStateHandler(
      supabaseClient(),
      () => ({ isAuthenticated: false }) as never,
      setState
    );

    await handler('SIGNED_IN', session());

    expect(mocks.completeAccountSetup).toHaveBeenCalledWith('access-token');
    expect(mocks.handlePostAuthRedirect).not.toHaveBeenCalled();
  });

  it('redirects a SIGNED_IN event only after terminal account setup', async () => {
    const handler = createAuthStateHandler(
      supabaseClient(),
      () => ({ isAuthenticated: false }) as never,
      vi.fn()
    );

    await handler('SIGNED_IN', session());

    expect(mocks.completeAccountSetup.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.handlePostAuthRedirect.mock.invocationCallOrder[0]
    );
  });

  it('rejects password sign-in when terminal account setup cannot be reached', async () => {
    mocks.completeAccountSetup.mockRejectedValue(new Error('setup failed'));
    const client = supabaseClient({
      data: { session: session(), user: session().user },
      error: null,
    });
    const signIn = createSignInWithEmail(client, vi.fn());

    await expect(signIn('user@example.com', 'password')).rejects.toThrow('setup failed');

    expect(mocks.analyticsTrack).not.toHaveBeenCalledWith('login', expect.anything());
  });
});
