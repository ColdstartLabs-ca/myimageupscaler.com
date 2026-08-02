import { describe, expect, it } from 'vitest';
import {
  normalizeAccountCreatedProperties,
  normalizeCoreEventProperties,
  normalizeErrorType,
  normalizeFileSizeBucket,
  normalizeMimeFamily,
  normalizeProcessingFailedProperties,
  normalizeReason,
} from '@server/analytics/core-event-contract';

describe('core event contract', () => {
  it('normalizes attributed, direct, and unavailable signup attribution', () => {
    expect(
      normalizeAccountCreatedProperties({
        method: 'email',
        pricingRegion: 'South Asia',
        utmSource: 'Google Ads',
        utmMedium: 'CPC',
        utmCampaign: 'Spring 2026',
        attributionAvailable: true,
        landingPage: 'https://private.example/signup?email=secret@example.com',
      })
    ).toEqual({
      method: 'email',
      pricingRegion: 'south_asia',
      utmSource: 'google_ads',
      utmMedium: 'cpc',
      utmCampaign: 'spring_2026',
      attributionAvailable: true,
    });

    expect(normalizeAccountCreatedProperties({ attributionAvailable: true })).toEqual({
      method: 'unknown',
      pricingRegion: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      attributionAvailable: true,
    });

    expect(normalizeAccountCreatedProperties({})).toEqual({
      method: 'unknown',
      pricingRegion: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      attributionAvailable: false,
    });
  });

  it('normalizes image MIME and size context without raw file data', () => {
    expect(
      normalizeCoreEventProperties('image_upscaled', {
        qualityTier: 'quick',
        scaleFactor: 4,
        inputDimensions: { width: 640, height: 480 },
        outputDimensions: { width: 2560, height: 1920 },
        fileType: 'image/jpeg; charset=binary',
        fileSizeBytes: 6 * 1024 * 1024,
        durationMs: 1234.4,
        fileName: 'do-not-send.jpg',
        imageUrl: 'https://private.example/image.jpg',
        imageData: 'data:image/jpeg;base64,secret',
      })
    ).toEqual({
      qualityTier: 'quick',
      scaleFactor: 4,
      inputWidth: 640,
      inputHeight: 480,
      outputWidth: 2560,
      outputHeight: 1920,
      fileType: 'jpeg',
      fileSizeBucket: '5-10MB',
      durationMs: 1234,
    });

    expect(normalizeMimeFamily('image/svg+xml')).toBe('other');
    expect(normalizeFileSizeBucket(26 * 1024 * 1024)).toBe('25MB+');
    expect(normalizeFileSizeBucket('9000000')).toBe('unknown');
  });

  it('maps bounded failure taxonomies and strips raw error context', () => {
    expect(normalizeErrorType('replicate_IMAGE_TOO_LARGE')).toBe('image_too_large');
    expect(normalizeReason('ai_generation_SAFETY')).toBe('safety_filter');

    const properties = normalizeProcessingFailedProperties({
      errorType: 'replicate_TIMEOUT',
      reason: 'replicate_TIMEOUT',
      provider: 'Replicate',
      model: 'owner/model:version',
      qualityTier: 'quick',
      retryable: true,
      durationMs: 5000,
      requestId: 'req_abc-123',
      message: 'raw provider URL https://provider.example/secret',
      stack: 'Error: secret stack',
    });

    expect(properties).toEqual({
      errorType: 'timeout',
      reason: 'timeout',
      provider: 'replicate',
      model: 'owner/model:version',
      qualityTier: 'quick',
      retryable: true,
      durationMs: 5000,
      requestId: 'req_abc-123',
    });
    expect(properties).not.toHaveProperty('message');
    expect(properties).not.toHaveProperty('stack');
    expect(properties).not.toHaveProperty('fileName');
  });

  it('uses safe defaults for invalid or unbounded values', () => {
    expect(
      normalizeProcessingFailedProperties({
        errorType: 'totally arbitrary free text with https://url',
        reason: 'arbitrary user content',
        provider: 'provider.example/path',
        model: 'model name with spaces',
        qualityTier: 'tier with spaces',
        durationMs: -1,
        requestId: 'request id with spaces',
      })
    ).toEqual({
      errorType: 'unknown',
      reason: 'unknown',
      provider: 'unknown',
      model: 'unknown',
      qualityTier: 'tier_with_spaces',
      retryable: true,
      durationMs: null,
      requestId: 'unknown',
    });
  });
});
