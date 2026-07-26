import { describe, expect, it } from 'vitest';
import useCases from '@/app/seo/data/use-cases.json';
import { generateUseCaseSchema } from '@/lib/seo/schema-generator';
import type { IUseCasePage } from '@/lib/seo/pseo-types';
import { getCreditsForTierAtScale } from '@shared/config/subscription.utils';

describe('use-case credit copy', () => {
  const portraitPage = useCases.pages.find(page => page.slug === 'portrait-photo-upscaler');

  it('should quote the same credits in pSEO data as in config', () => {
    expect(portraitPage?.supportedTiers).toMatchObject({
      faceRestore: { credits: getCreditsForTierAtScale('face-restore', 2) },
      facePro: { credits: getCreditsForTierAtScale('face-pro', 2) },
      ultra: { credits: getCreditsForTierAtScale('ultra', 2) },
    });
  });

  it('should round-trip updated credit copy into FAQPage schema', () => {
    const schema = generateUseCaseSchema(portraitPage as IUseCasePage) as {
      '@graph': Array<{
        '@type': string;
        mainEntity?: Array<{ acceptedAnswer: { text: string } }>;
      }>;
    };
    const faqSchema = schema['@graph'].find(item => item['@type'] === 'FAQPage');
    const answers = faqSchema?.mainEntity?.map(item => item.acceptedAnswer.text) ?? [];

    expect(answers.some(answer => answer.includes('2–12 credits'))).toBe(true);
    expect(answers.join(' ')).not.toContain('Face Pro (6 credits)');
  });
});
