import { describe, expect, it } from 'vitest';
import { clientEnv } from '@shared/config/env';
import { getEnabledPlans } from '@shared/config/subscription.utils';
import { generatePlanJsonLd } from '@client/components/features/landing/Pricing';

describe('Homepage subscription Product JSON-LD', () => {
  it('provides a crawlable image and canonical URL for every monthly plan', () => {
    const plans = getEnabledPlans().filter(plan => plan.interval === 'month');

    expect(plans.length).toBeGreaterThan(0);

    for (const plan of plans) {
      const schema = generatePlanJsonLd(plan, plan.priceInCents / 100);

      expect(schema['@type']).toBe('Product');
      expect(schema.image).toBe(`${clientEnv.BASE_URL}/og-image.png`);
      expect(schema.url).toBe(`${clientEnv.BASE_URL}/pricing`);
      expect(schema['@id']).toBe(`${clientEnv.BASE_URL}/pricing#${plan.key}`);
      expect(schema.offers).toMatchObject({
        '@type': 'Offer',
        price: plan.priceInCents / 100,
        priceCurrency: 'USD',
      });
    }
  });
});
