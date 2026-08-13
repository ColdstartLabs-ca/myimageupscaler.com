import { describe, expect, it } from 'vitest';
import { createPageSpeedResult, evaluatePageSpeedGate } from '../../../scripts/seo-pagespeed-check';

function createPayload(numericValue?: number): Parameters<typeof createPageSpeedResult>[2] {
  return {
    lighthouseResult: {
      categories: {},
      audits: {
        'largest-contentful-paint': {
          id: 'largest-contentful-paint',
          title: 'Largest Contentful Paint',
          ...(numericValue === undefined ? {} : { numericValue }),
        },
      },
    },
  };
}

describe('PageSpeed LCP budget measurement', () => {
  it('should use the current Lighthouse LCP instead of rolling field data', () => {
    const payload = createPayload(2400);
    payload.loadingExperience = {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 9000 },
      },
    };

    const result = createPageSpeedResult('https://example.com/blog', 'mobile', payload);

    expect(result.coreWebVitals.lcp.value).toBe(2400);
  });

  it.each([
    ['missing', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('should mark %s LCP as unknown instead of defaulting it to zero', (_label, numericValue) => {
    const result = createPageSpeedResult(
      'https://example.com/blog',
      'mobile',
      createPayload(numericValue)
    );

    expect(result.coreWebVitals.lcp.value).toBeNull();
    expect(result.coreWebVitals.lcp.rating).toBe('unknown');
    expect(evaluatePageSpeedGate([result], [], 1, 2.5).exitCode).toBe(1);
  });
});
