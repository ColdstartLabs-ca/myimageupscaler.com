export type TAnalyticsDevice = 'desktop' | 'mobile' | 'tablet' | 'unknown';

interface IOrganicFunnelDimensionInput {
  entryPage?: string | null;
  firstTouchLandingPage?: string | null;
  userAgent?: string | null;
  mode?: unknown;
}

export interface IOrganicFunnelDimensions {
  landing_page: string;
  device: TAnalyticsDevice;
  mode: string;
}

function normalizeLandingPage(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://myimageupscaler.com');
    return url.pathname || '/';
  } catch {
    return value.split('?')[0] || '/';
  }
}

function detectDevice(userAgent: string | null | undefined): TAnalyticsDevice {
  if (!userAgent) return 'unknown';
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function normalizeMode(mode: unknown): string {
  if (typeof mode !== 'string' || !mode.trim()) return 'unknown';
  return mode.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 64);
}

export function buildOrganicFunnelDimensions({
  entryPage,
  firstTouchLandingPage,
  userAgent,
  mode,
}: IOrganicFunnelDimensionInput): IOrganicFunnelDimensions {
  return {
    landing_page: normalizeLandingPage(firstTouchLandingPage) ?? normalizeLandingPage(entryPage) ?? '/',
    device: detectDevice(userAgent),
    mode: normalizeMode(mode),
  };
}
