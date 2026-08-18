export interface IAccountSetupResult {
  success: boolean;
  /**
   * `pending` means the server could not classify the profile yet. It is not an
   * error: the upscale route already handles a pending profile, and a later
   * setup call (sign-in, auth state change) completes it. Authentication must
   * never be blocked on it — that stranded users with a valid account on an
   * error screen.
   */
  setupStatus: 'complete' | 'pending';
}

const SETUP_RETRY_DELAYS_MS = [150, 400];

function isSetupStatus(value: unknown): value is IAccountSetupResult['setupStatus'] {
  return value === 'complete' || value === 'pending';
}

interface IAccountSetupAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  attributionAvailable: boolean;
}

const FIRST_TOUCH_UTM_STORAGE_KEY = 'miu_first_touch_utm';
const FIRST_TOUCH_UTM_COOKIE_KEY = 'miu_first_touch_utm';
const MAX_SETUP_ATTEMPTS = 3;

function readFirstTouchUtm(): Partial<IAccountSetupAttribution> | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(FIRST_TOUCH_UTM_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      return {
        utmSource: typeof parsed.utmSource === 'string' ? parsed.utmSource : undefined,
        utmMedium: typeof parsed.utmMedium === 'string' ? parsed.utmMedium : undefined,
        utmCampaign: typeof parsed.utmCampaign === 'string' ? parsed.utmCampaign : undefined,
      };
    }
  } catch {
    // Fall through to the middleware cookie/current URL. Server normalization
    // remains the source of truth for the event payload.
  }

  try {
    const cookie = document.cookie
      .split(';')
      .map(value => value.trim())
      .find(value => value.startsWith(`${FIRST_TOUCH_UTM_COOKIE_KEY}=`));
    const encoded = cookie?.slice(FIRST_TOUCH_UTM_COOKIE_KEY.length + 1);
    if (encoded) {
      const parsed = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
      return {
        utmSource: typeof parsed.utmSource === 'string' ? parsed.utmSource : undefined,
        utmMedium: typeof parsed.utmMedium === 'string' ? parsed.utmMedium : undefined,
        utmCampaign: typeof parsed.utmCampaign === 'string' ? parsed.utmCampaign : undefined,
      };
    }
  } catch {
    // A malformed or inaccessible cookie is treated as unavailable attribution.
  }

  try {
    const url = new URL(window.location.href);
    return {
      utmSource: url.searchParams.get('utm_source') || undefined,
      utmMedium: url.searchParams.get('utm_medium') || undefined,
      utmCampaign: url.searchParams.get('utm_campaign') || undefined,
    };
  } catch {
    return null;
  }
}

function getAccountSetupAttribution(): IAccountSetupAttribution {
  if (typeof window === 'undefined') {
    return { attributionAvailable: false };
  }

  const firstTouch = readFirstTouchUtm();
  return {
    ...firstTouch,
    // A browser that can inspect its first-touch/current URL state can
    // distinguish direct traffic (all null values) from unavailable capture.
    attributionAvailable: firstTouch !== null,
  };
}

export async function completeAccountSetup(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))
): Promise<IAccountSetupResult> {
  let lastError: Error | undefined;
  let lastPending: IAccountSetupResult | undefined;

  for (let attempt = 1; attempt <= MAX_SETUP_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl('/api/users/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ attribution: getAccountSetupAttribution() }),
      });

      if (!response.ok) {
        throw new Error(`Account setup returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as Partial<IAccountSetupResult>;
      if (!isSetupStatus(result.setupStatus)) {
        throw new Error('Account setup did not return a terminal decision');
      }

      if (result.setupStatus === 'complete') {
        return { success: result.success === true, setupStatus: 'complete' };
      }

      // Pending is a real answer, so stop treating it as a failure. Retry with a
      // short backoff — the profile row usually lands within a few hundred ms —
      // and hand it back rather than throwing if it never settles.
      lastPending = { success: false, setupStatus: 'pending' };
      lastError = undefined;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Account setup failed');
    }

    const delay = SETUP_RETRY_DELAYS_MS[attempt - 1];
    if (attempt < MAX_SETUP_ATTEMPTS && delay) {
      await sleep(delay);
    }
  }

  if (lastPending) return lastPending;
  throw lastError ?? new Error('Account setup failed');
}
