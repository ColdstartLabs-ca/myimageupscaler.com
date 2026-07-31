import { FUNNEL_SCHEMA_VERSION } from '@server/analytics/types';

export const FUNNEL_CHECKOUT_METADATA_KEYS = {
  schemaVersion: 'funnel_schema_version',
  funnelAttemptId: 'funnel_attempt_id',
  entrySurface: 'entry_surface',
  trigger: 'checkout_trigger',
  originatingModel: 'checkout_originating_model',
  originatingTrigger: 'checkout_originating_trigger',
  attributionChain: 'checkout_attribution_chain',
  firstTouchSource: 'first_touch_source',
  firstTouchMedium: 'first_touch_medium',
  firstTouchLandingPage: 'first_touch_landing_page',
  landingPageFamily: 'landing_page_family',
  deviceType: 'device_type',
  isPseoLanding: 'is_pseo_landing',
} as const;

const FUNNEL_ATTEMPT_ID_PATTERN = /^fa_[A-Za-z0-9_-]{8,120}$/;
const TAXONOMY_VALUE_PATTERN = /^[a-z0-9][a-z0-9_:-]{0,79}$/;

export function parseFunnelCheckoutAttribution(metadata: Record<string, string>) {
  const keys = FUNNEL_CHECKOUT_METADATA_KEYS;
  const hasFunnelMetadata = Object.values(keys).some(key => metadata[key] !== undefined);
  if (!hasFunnelMetadata) return null;

  const hasVersionedAttemptMetadata =
    metadata[keys.schemaVersion] !== undefined ||
    metadata[keys.funnelAttemptId] !== undefined ||
    metadata[keys.entrySurface] !== undefined;
  if (hasVersionedAttemptMetadata && metadata[keys.schemaVersion] !== FUNNEL_SCHEMA_VERSION) {
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
  const funnelAttemptId = metadata[keys.funnelAttemptId];
  if (funnelAttemptId && !FUNNEL_ATTEMPT_ID_PATTERN.test(funnelAttemptId)) {
    throw new Error('Invalid funnel attempt ID');
  }

  for (const key of [
    keys.entrySurface,
    keys.trigger,
    keys.originatingModel,
    keys.originatingTrigger,
  ]) {
    const value = metadata[key];
    if (value && !TAXONOMY_VALUE_PATTERN.test(value)) {
      throw new Error(`Invalid funnel taxonomy value for ${key}`);
    }
  }

  const attributionChain = metadata[keys.attributionChain];
  if (attributionChain) {
    const surfaces = attributionChain.split(',');
    if (surfaces.length > 5 || surfaces.some(surface => !TAXONOMY_VALUE_PATTERN.test(surface))) {
      throw new Error('Invalid funnel attribution chain');
    }
  }

  return Object.fromEntries(
    Object.values(keys)
      .filter(key => metadata[key] !== undefined)
      .map(key => [key, metadata[key]])
  );
}
