import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientEnv } from '@shared/config/env';

const USER_CACHE_KEY = `${clientEnv.CACHE_USER_KEY_PREFIX}_user_cache`;
const AUTH_COOKIE_NAMES = ['sb-abc-auth-token', 'sb-abc-auth-token.0', 'sb-test-auth-token'];

const { createClientMock, onAuthStateChangeMock, signInWithPasswordMock, rpcMock } = vi.hoisted(
  () => {
    const onAuthStateChange = vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
    const signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { user: null, session: null }, error: null });
    const rpc = vi.fn();
    const client = {
      auth: {
        onAuthStateChange,
        signInWithPassword,
        getSession: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        updateUser: vi.fn(),
        resetPasswordForEmail: vi.fn(),
      },
      rpc,
    };
    const createClient = vi.fn(() => client);
    return {
      createClientMock: createClient,
      onAuthStateChangeMock: onAuthStateChange,
      signInWithPasswordMock: signInWithPassword,
      rpcMock: rpc,
    };
  }
);

type UserStoreModule = typeof import('@client/store/userStore');

async function importStore(): Promise<UserStoreModule> {
  vi.resetModules();
  vi.doMock('@shared/utils/supabase/client', () => ({ createClient: createClientMock }));
  return import('@client/store/userStore');
}

function clearCookies(): void {
  for (const name of AUTH_COOKIE_NAMES) {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

async function flushDynamicImports(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

describe('userStore lazy supabase init', () => {
  beforeEach(() => {
    clearCookies();
    window.history.pushState({}, '', '/');
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  afterEach(() => {
    vi.doUnmock('@shared/utils/supabase/client');
  });

  describe('shouldInitSupabaseEagerly', () => {
    it('is false for an anonymous visitor with no cookie, cache or auth params', async () => {
      const { shouldInitSupabaseEagerly } = await importStore();
      expect(shouldInitSupabaseEagerly()).toBe(false);
    });

    it.each([
      ['plain supabase auth cookie', 'sb-abc-auth-token=x'],
      ['chunked supabase auth cookie', 'sb-abc-auth-token.0=x'],
    ])('is true with a %s', async (_label, cookie) => {
      document.cookie = cookie;
      const { shouldInitSupabaseEagerly } = await importStore();
      expect(shouldInitSupabaseEagerly()).toBe(true);
    });

    it('is true when the user cache exists', async () => {
      vi.mocked(localStorage.getItem).mockImplementation(key =>
        key === USER_CACHE_KEY ? '{"version":1}' : null
      );
      const { shouldInitSupabaseEagerly } = await importStore();
      expect(shouldInitSupabaseEagerly()).toBe(true);
    });

    it('is true when localStorage access throws', async () => {
      vi.mocked(localStorage.getItem).mockImplementation(() => {
        throw new Error('storage disabled');
      });
      const { shouldInitSupabaseEagerly } = await importStore();
      expect(shouldInitSupabaseEagerly()).toBe(false);
    });

    it.each([
      'code=1',
      'error=access_denied',
      'error_description=Bad',
      'token_hash=abc',
      'type=recovery',
    ])('is true with ?%s', async search => {
      window.history.pushState({}, '', `/?${search}`);
      const { shouldInitSupabaseEagerly } = await importStore();
      expect(shouldInitSupabaseEagerly()).toBe(true);
    });

    it.each(['access_token=x', 'refresh_token=x', 'error=invalid'])(
      'is true with #%s',
      async hash => {
        window.history.pushState({}, '', `/#${hash}`);
        const { shouldInitSupabaseEagerly } = await importStore();
        expect(shouldInitSupabaseEagerly()).toBe(true);
      }
    );

    it('is true on an auth route', async () => {
      window.history.pushState({}, '', '/en/auth/callback');
      const { shouldInitSupabaseEagerly } = await importStore();
      expect(shouldInitSupabaseEagerly()).toBe(true);
    });
  });

  it('does not create the supabase client when an anonymous visitor imports the store', async () => {
    const store = await importStore();
    await flushDynamicImports();

    expect(createClientMock).not.toHaveBeenCalled();
    expect(onAuthStateChangeMock).not.toHaveBeenCalled();
    expect(store.useUserStore.getState().isLoading).toBe(false);
    expect(store.useUserStore.getState().isAuthenticated).toBe(false);
  });

  it('creates one client and registers one listener when an auth cookie exists', async () => {
    document.cookie = 'sb-abc-auth-token=x';
    await importStore();
    await vi.waitFor(() => expect(createClientMock).toHaveBeenCalledTimes(1));

    expect(onAuthStateChangeMock).toHaveBeenCalledTimes(1);
  });

  it('creates the client once and registers the listener before signInWithPassword', async () => {
    const { useUserStore, getSupabase } = await importStore();

    await expect(useUserStore.getState().signInWithEmail('a@b.co', 'pw')).rejects.toThrow(
      'Sign in did not return an authenticated session'
    );

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(onAuthStateChangeMock).toHaveBeenCalledTimes(1);
    expect(onAuthStateChangeMock.mock.invocationCallOrder[0]).toBeLessThan(
      signInWithPasswordMock.mock.invocationCallOrder[0]
    );

    await getSupabase();
    await useUserStore.getState().signOut();

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(onAuthStateChangeMock).toHaveBeenCalledTimes(1);
  });

  it('retries after the dynamic import fails once', async () => {
    let attempts = 0;
    vi.resetModules();
    vi.doMock('@shared/utils/supabase/client', () => {
      attempts += 1;
      if (attempts === 1) throw new Error('chunk load failed');
      return { createClient: createClientMock };
    });
    const { getSupabase } = await import('@client/store/userStore');

    await expect(getSupabase()).rejects.toThrow();
    const client = await getSupabase();

    expect(client).toBeDefined();
    expect(attempts).toBe(2);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('exposes the rpc path to the lazily created client', async () => {
    const { useUserStore, getSupabase } = await importStore();
    const client = await getSupabase();

    useUserStore.setState({
      user: {
        id: 'user-1',
        email: 'a@b.co',
        provider: 'email',
        role: 'user',
        profile: null,
        subscription: null,
      },
    });
    rpcMock.mockResolvedValue({ data: { profile: null, subscription: null }, error: null });
    await useUserStore.getState().fetchUserData('user-1');

    expect(client.rpc).toBe(rpcMock);
    expect(rpcMock).toHaveBeenCalledWith('get_user_data', { target_user_id: 'user-1' });
  });
});
