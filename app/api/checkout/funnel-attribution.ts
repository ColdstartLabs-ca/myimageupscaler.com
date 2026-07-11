import { FUNNEL_SCHEMA_VERSION } from '@server/analytics/types';

export const FUNNEL_CHECKOUT_METADATA_KEYS = {
  schemaVersion: 'funnel_schema_version',
  firstTouchSource: 'first_touch_source',
  firstTouchMedium: 'first_touch_medium',
  firstTouchLandingPage: 'first_touch_landing_page',
  landingPageFamily: 'landing_page_family',
  deviceType: 'device_type',
  isPseoLanding: 'is_pseo_landing',
} as const;

export function parseFunnelCheckoutAttribution(metadata: Record<string, string>) {
  const keys = FUNNEL_CHECKOUT_METADATA_KEYS;
  const hasFunnelMetadata = Object.values(keys).some(key => metadata[key] !== undefined);
  if (!hasFunnelMetadata) return null;

  if (metadata[keys.schemaVersion] !== FUNNEL_SCHEMA_VERSION) {
    throw new Error('Invalid funnel schema version');
  }

  for (const key of Object.values(keys)) {
    const value = metadata[key];
    if (value !== undefined && value.length > 500) {
      throw new Error('Funnel attribution value is too long');
    }
  }

  const deviceType = metadata[keys.deviceType];
  if (deviceType && !['mobile', 'tablet', 'desktop'].includes(deviceType)) {
    throw new Error('Invalid funnel device type');
  }
  const isPseoLanding = metadata[keys.isPseoLanding];
  if (isPseoLanding && !['true', 'false'].includes(isPseoLanding)) {
    throw new Error('Invalid funnel pSEO classification');
  }

  return Object.fromEntries(
    Object.values(keys)
      .filter(key => metadata[key] !== undefined)
      .map(key => [key, metadata[key]])
  );
}
