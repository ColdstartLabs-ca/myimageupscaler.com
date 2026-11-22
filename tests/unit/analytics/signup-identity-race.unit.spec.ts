import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PENDING_KEY = 'miu_pending_signup_conversion';

type TUserId = string | null;
type TAuthListener = (event: string, session: { user: { id: string } } | null) => void;
type TWindowWithGtag = Window & { gtag?: (...args: unknown[]) => void };

const auth = vi.hoisted(() => ({
  current: 'user-a' as string | null,
  listeners: [] as Array<(event: string, session: { user: { id: string } } | null) => void>,
  lookupGate: null as Promise<void> | null,
  lookupError: false,
}));

const sessionFor = (userId: TUserId) => (userId ? { user: { id: userId } } : null);

vi.mock('@shared/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => {
        if (auth.lookupGate) await auth.lookupGate;
        if (auth.lookupError) return { data: { session: null }, error: new Error('auth failed') };
        return { data: { session: sessionFor(auth.current) }, error: null };
      },
      onAuthStateChange: (listener: TAuthListener) => {
        auth.listeners.push(listener);
        // Like the real client, the first event waits until auth has finished starting.
        void Promise.resolve(auth.lookupGate).then(() =>
          listener('INITIAL_SESSION', sessionFor(auth.current))
        );
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  }),
}));

const { mockLoadAnalytics } = vi.hoisted(() => ({ mockLoadAnalytics: vi.fn() }));
vi.mock('@client/utils/loadAnalytics', () => ({ loadAnalytics: mockLoadAnalytics }));

function emitAuth(event: string, userId: TUserId): void {
  auth.current = userId;
  auth.listeners.forEach(listener => listener(event, sessionFor(userId)));
}

function makeAnalytics(enabled = true) {
  return {
    isEnabled: vi.fn(() => enabled),
    getConsent: vi.fn(() => 'granted'),
    track: vi.fn(),
  };
}

function setupResponse(owner: string | undefined = 'user-a') {
  return {
    ok: true,
    json: async () => ({
      success: true,
      setupStatus: 'complete',
      accountCreated: true,
      signupMethod: 'google',
      ...(owner ? { signupUserId: owner } : {}),
    }),
  } as unknown as Response;
}

/** A fresh module graph is what a redirect or a reload gives the next page. */
async function loadPage() {
  vi.resetModules();
  auth.listeners = [];
  const [{ completeAccountSetup }, { flushSignupConversion }] = await Promise.all([
    import('@client/utils/account-setup'),
    import('@client/analytics/signup-conversion'),
  ]);
  return { completeAccountSetup, flushSignupConversion };
}

const pendingMarker = () => window.sessionStorage.getItem(PENDING_KEY);

describe('a pending signup belongs to the account that won it', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    (window as TWindowWithGtag).gtag = vi.fn();
    auth.current = 'user-a';
    auth.listeners = [];
    auth.lookupGate = null;
    auth.lookupError = false;
    mockLoadAnalytics.mockReset();
    mockLoadAnalytics.mockResolvedValue(makeAnalytics(false));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as TWindowWithGtag).gtag;
  });

  it('A then B without SIGNED_OUT: A never reports under B', async () => {
    const page = await loadPage();
    await page.completeAccountSetup(
      'token-a',
      vi.fn().mockResolvedValue(setupResponse()) as unknown as typeof fetch
    );

    emitAuth('SIGNED_IN', 'user-b');
    const analytics = makeAnalytics();
    await page.flushSignupConversion(analytics);
    await vi.advanceTimersByTimeAsync(600);

    expect(analytics.track).not.toHaveBeenCalled();
    expect(pendingMarker()).toBeNull();
  });

  it('A then B in another tab: the next page checks the session and drops A', async () => {
    const first = await loadPage();
    await first.completeAccountSetup(
      'token-a',
      vi.fn().mockResolvedValue(setupResponse()) as unknown as typeof fetch
    );

    auth.current = 'user-b';
    const next = await loadPage();
    const analytics = makeAnalytics();
    await next.flushSignupConversion(analytics);
    await vi.advanceTimersByTimeAsync(600);

    expect(analytics.track).not.toHaveBeenCalled();
    expect(pendingMarker()).toBeNull();
  });

  it('late A response after logout does not recreate the marker', async () => {
    const page = await loadPage();
    let respond: (response: Response) => void = () => {};
    const inFlight = page.completeAccountSetup(
      'token-a',
      vi.fn(() => new Promise<Response>(resolve => (respond = resolve))) as unknown as typeof fetch
    );
    await vi.advanceTimersByTimeAsync(0);

    emitAuth('SIGNED_OUT', null);
    respond(setupResponse());
    await vi.advanceTimersByTimeAsync(600);
    await inFlight;

    expect(pendingMarker()).toBeNull();
  });

  it('late A response after a switch to B does not create a marker', async () => {
    const page = await loadPage();
    let respond: (response: Response) => void = () => {};
    const inFlight = page.completeAccountSetup(
      'token-a',
      vi.fn(() => new Promise<Response>(resolve => (respond = resolve))) as unknown as typeof fetch
    );
    await vi.advanceTimersByTimeAsync(0);

    emitAuth('SIGNED_IN', 'user-b');
    respond(setupResponse());
    await vi.advanceTimersByTimeAsync(600);
    await inFlight;

    expect(pendingMarker()).toBeNull();
  });

  it('late A response after A leaves and returns stays cancelled, so ambiguity fails closed', async () => {
    const page = await loadPage();
    let respond: (response: Response) => void = () => {};
    const inFlight = page.completeAccountSetup(
      'token-a',
      vi.fn(() => new Promise<Response>(resolve => (respond = resolve))) as unknown as typeof fetch
    );
    await vi.advanceTimersByTimeAsync(0);

    emitAuth('SIGNED_OUT', null);
    emitAuth('SIGNED_IN', 'user-a');
    respond(setupResponse());
    await vi.advanceTimersByTimeAsync(600);
    await inFlight;

    expect(pendingMarker()).toBeNull();
  });

  it('unresolved auth bootstrap defers, then a mismatch discards the conversion', async () => {
    const first = await loadPage();
    await first.completeAccountSetup(
      'token-a',
      vi.fn().mockResolvedValue(setupResponse()) as unknown as typeof fetch
    );

    let finishBootstrap: () => void = () => {};
    auth.lookupGate = new Promise(resolve => (finishBootstrap = resolve));
    auth.current = 'user-b';
    const next = await loadPage();
    const analytics = makeAnalytics();
    const flushing = next.flushSignupConversion(analytics);
    await vi.advanceTimersByTimeAsync(600);

    expect(analytics.track).not.toHaveBeenCalled();
    expect(pendingMarker()).not.toBeNull();

    auth.lookupGate = null;
    finishBootstrap();
    await vi.advanceTimersByTimeAsync(600);
    await flushing;

    expect(analytics.track).not.toHaveBeenCalled();
    expect(pendingMarker()).toBeNull();
  });

  it('an auth lookup error defers, then the same account still reports once', async () => {
    const first = await loadPage();
    await first.completeAccountSetup(
      'token-a',
      vi.fn().mockResolvedValue(setupResponse()) as unknown as typeof fetch
    );

    auth.lookupError = true;
    const next = await loadPage();
    const analytics = makeAnalytics();
    await next.flushSignupConversion(analytics);
    expect(analytics.track).not.toHaveBeenCalled();
    expect(pendingMarker()).not.toBeNull();

    auth.lookupError = false;
    await vi.advanceTimersByTimeAsync(600);

    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(pendingMarker()).toBeNull();
  });

  it('a resolved signed-out session discards the conversion', async () => {
    const first = await loadPage();
    await first.completeAccountSetup(
      'token-a',
      vi.fn().mockResolvedValue(setupResponse()) as unknown as typeof fetch
    );

    auth.current = null;
    const next = await loadPage();
    const analytics = makeAnalytics();
    await next.flushSignupConversion(analytics);
    await vi.advanceTimersByTimeAsync(600);

    expect(analytics.track).not.toHaveBeenCalled();
    expect(pendingMarker()).toBeNull();
  });

  it('identity change during validation stops the send', async () => {
    const first = await loadPage();
    await first.completeAccountSetup(
      'token-a',
      vi.fn().mockResolvedValue(setupResponse()) as unknown as typeof fetch
    );

    const next = await loadPage();
    let finishLookup: () => void = () => {};
    auth.lookupGate = new Promise(resolve => (finishLookup = resolve));
    const analytics = makeAnalytics();
    const flushing = next.flushSignupConversion(analytics);
    await vi.advanceTimersByTimeAsync(0);

    // The lookup already holds user-a, so only the auth event can stop this send.
    auth.listeners.forEach(listener => listener('SIGNED_IN', sessionFor('user-b')));
    auth.lookupGate = null;
    finishLookup();
    await vi.advanceTimersByTimeAsync(600);
    await flushing;

    expect(analytics.track).not.toHaveBeenCalled();
    expect(pendingMarker()).toBeNull();
  });

  it('a response that does not name the owner marks nothing', async () => {
    const page = await loadPage();
    await page.completeAccountSetup(
      'token-a',
      vi.fn().mockResolvedValue(setupResponse('')) as unknown as typeof fetch
    );

    expect(pendingMarker()).toBeNull();
  });

  it('control: the same account keeps its conversion across a redirect and reports once, with no identity', async () => {
    const first = await loadPage();
    await first.completeAccountSetup(
      'token-a',
      vi.fn().mockResolvedValue(setupResponse()) as unknown as typeof fetch
    );
    expect(pendingMarker()).not.toBeNull();

    const next = await loadPage();
    const analytics = makeAnalytics();
    await next.flushSignupConversion(analytics);
    await next.flushSignupConversion(analytics);
    await vi.advanceTimersByTimeAsync(600);

    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith('signup_completed', { method: 'google' });
    expect(pendingMarker()).toBeNull();
  });

  it('logout on a cold page with a blocked lookup can leave a marker, and it never sends', async () => {
    let finishLookup: () => void = () => {};
    auth.lookupGate = new Promise(resolve => (finishLookup = resolve));
    const page = await loadPage();
    let respond: (response: Response) => void = () => {};
    const inFlight = page.completeAccountSetup(
      'token-a',
      vi.fn(() => new Promise<Response>(resolve => (respond = resolve))) as unknown as typeof fetch
    );
    await vi.advanceTimersByTimeAsync(0);

    auth.current = null;
    respond(setupResponse());
    await vi.advanceTimersByTimeAsync(200);
    await inFlight;

    auth.lookupGate = null;
    finishLookup();
    const analytics = makeAnalytics();
    await page.flushSignupConversion(analytics);
    await vi.advanceTimersByTimeAsync(600);

    expect(analytics.track).not.toHaveBeenCalled();
    expect(pendingMarker()).toBeNull();
  });

  it('an anonymous page view does not load the auth client', async () => {
    const page = await loadPage();
    await page.flushSignupConversion(makeAnalytics());
    await vi.advanceTimersByTimeAsync(600);

    expect(auth.listeners).toHaveLength(0);
  });

  it('control: login is not held when auth never answers', async () => {
    auth.lookupGate = new Promise(() => {});
    const page = await loadPage();
    const setup = page.completeAccountSetup(
      'token-a',
      vi.fn().mockResolvedValue(setupResponse()) as unknown as typeof fetch
    );
    // Setup can run inside an auth callback that holds the lock this lookup waits for.
    await vi.advanceTimersByTimeAsync(200);

    await expect(setup).resolves.toEqual({ success: true, setupStatus: 'complete' });
  });
});
