import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAnalytics } from '@client/utils/loadAnalytics';

const PENDING_KEY = 'miu_pending_signup_conversion';
const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 20;
// Auth flows hard-redirect right after setup, which destroys a hit still queued in
// gtag. The redirect target delivers it instead. Without a redirect, this timer does.
const SEND_DELAY_MS = 2000;
const AUTH_PAGE_PATTERN = /\/auth\//;
// The conversion belongs to the signup that set it, not to a later visit to this tab.
const MAX_PENDING_AGE_MS = 10 * 60 * 1000;
// getSession waits for the auth lock, and setup can run inside an auth callback that holds it.
const SESSION_LOOKUP_TIMEOUT_MS = 150;

interface ISignupConversionAnalytics {
  isEnabled(): boolean;
  getConsent(): string;
  track(name: 'signup_completed', properties: { method: string }): void;
}

interface IPendingSignup {
  method: string;
  userId: string;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let authClient: Promise<SupabaseClient> | null = null;
let knownUserId: string | null | undefined;
// Counts each time a known account leaves this page. A setup that started before cannot mark.
let authEpoch = 0;

function noteAuthIdentity(userId: string | null): void {
  if (userId === knownUserId) return;
  if (knownUserId) authEpoch += 1;
  knownUserId = userId;

  try {
    const pending = readPending();
    if (pending && pending.userId !== userId) window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // No storage means nothing is pending.
  }
}

/** Loaded only for a setup or a pending conversion, so anonymous visitors do not pay for it. */
function watchAuth(): Promise<SupabaseClient> {
  authClient ??= import('@shared/utils/supabase/client')
    .then(({ createClient }) => {
      const client = createClient();
      client.auth.onAuthStateChange((_event, session) =>
        noteAuthIdentity(session?.user.id ?? null)
      );
      return client;
    })
    .catch(error => {
      authClient = null;
      throw error;
    });
  return authClient;
}

/** Returns null when signed out, and undefined when auth gave no answer. */
function resolveCurrentUserId(): Promise<string | null | undefined> {
  const lookup = watchAuth()
    .then(client => client.auth.getSession())
    .then(({ data, error }) => (error ? undefined : (data.session?.user.id ?? null)))
    .catch(() => undefined);
  const timeout = new Promise<undefined>(resolve => {
    setTimeout(() => resolve(undefined), SESSION_LOOKUP_TIMEOUT_MS);
  });
  return Promise.race([lookup, timeout]);
}

/** Taken before a setup request. A later auth change cancels that request's conversion. */
export function openSignupFence(): number {
  void watchAuth().catch(() => {});
  return authEpoch;
}

/**
 * Setup finishes before analytics starts and before the lazy-loaded gtag exists,
 * so the conversion waits here. The owner stays in this entry and never reaches
 * analytics. A reload or the next page delivers it, and each flush checks the owner.
 */
export async function markSignupConversion(
  method = 'unknown',
  userId: string,
  fence: number
): Promise<void> {
  const currentUserId = await resolveCurrentUserId();
  if (fence !== authEpoch) return;
  // No answer is not a mismatch: the flush checks this owner again before any send.
  if (currentUserId !== undefined && currentUserId !== userId) return;

  try {
    window.sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ method, userId, expiresAt: Date.now() + MAX_PENDING_AGE_MS })
    );
  } catch {
    return; // No storage means no safe way to send only once.
  }

  setTimeout(() => {
    void loadAnalytics()
      .then(analytics => flushSignupConversion(analytics))
      .catch(() => {});
  }, SEND_DELAY_MS);
}

/** Fails closed: an expired or malformed entry is removed and never sent. */
function readPending(): IPendingSignup | null {
  const raw = window.sessionStorage.getItem(PENDING_KEY);
  if (raw === null) return null;

  try {
    const { method, userId, expiresAt } = JSON.parse(raw);
    if (
      typeof method === 'string' &&
      typeof userId === 'string' &&
      typeof expiresAt === 'number' &&
      Date.now() < expiresAt
    ) {
      return { method, userId };
    }
  } catch {
    // Handled below.
  }

  window.sessionStorage.removeItem(PENDING_KEY);
  return null;
}

function retryLater(analytics: ISignupConversionAnalytics, retriesLeft: number): void {
  if (retriesLeft <= 0 || retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushSignupConversion(analytics, retriesLeft - 1);
  }, RETRY_DELAY_MS);
}

export async function flushSignupConversion(
  analytics: ISignupConversionAnalytics,
  retriesLeft = MAX_RETRIES
): Promise<void> {
  try {
    const pending = readPending();
    if (!pending) return;

    if (analytics.getConsent() === 'denied') {
      window.sessionStorage.removeItem(PENDING_KEY);
      return;
    }

    const mustWait =
      !analytics.isEnabled() || !window.gtag || AUTH_PAGE_PATTERN.test(window.location.pathname);
    if (mustWait) {
      void watchAuth().catch(() => {});
      retryLater(analytics, retriesLeft);
      return;
    }

    const currentUserId = await resolveCurrentUserId();
    if (currentUserId === undefined) {
      retryLater(analytics, retriesLeft);
      return;
    }

    // The auth watcher removes this entry if the account changed during the lookup.
    const latest = readPending();
    if (latest?.userId !== pending.userId) return;

    if (currentUserId !== pending.userId) {
      window.sessionStorage.removeItem(PENDING_KEY);
      return;
    }

    window.sessionStorage.removeItem(PENDING_KEY);
    analytics.track('signup_completed', { method: pending.method });
  } catch {
    // Analytics must never break the page that carries it.
  }
}
