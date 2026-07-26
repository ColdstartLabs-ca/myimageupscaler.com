import { describe, expect, it } from 'vitest';
import appUseCases from '@/app/seo/data/use-cases.json';
import de from '@/locales/de/use-cases.json';
import en from '@/locales/en/use-cases.json';
import es from '@/locales/es/use-cases.json';
import fr from '@/locales/fr/use-cases.json';
import itLocale from '@/locales/it/use-cases.json';
import ja from '@/locales/ja/use-cases.json';
import pt from '@/locales/pt/use-cases.json';
import deHelp from '@/locales/de/help.json';
import enHelp from '@/locales/en/help.json';
import esHelp from '@/locales/es/help.json';
import frHelp from '@/locales/fr/help.json';
import itHelp from '@/locales/it/help.json';
import jaHelp from '@/locales/ja/help.json';
import ptHelp from '@/locales/pt/help.json';

describe('locale credit parity', () => {
  it('should quote identical credits across all 7 locales', () => {
    const canonical = appUseCases.pages.find(
      page => page.slug === 'portrait-photo-upscaler'
    )?.supportedTiers;

    for (const locale of [en, de, es, fr, itLocale, ja, pt]) {
      const localized = locale.pages.find(
        page =>
          page.supportedTiers?.faceRestore &&
          page.supportedTiers?.facePro &&
          page.supportedTiers?.ultra
      )?.supportedTiers;

      expect(
        Object.fromEntries(
          Object.entries(localized ?? {}).map(([key, value]) => [key, value.credits])
        )
      ).toEqual(
        Object.fromEntries(
          Object.entries(canonical ?? {}).map(([key, value]) => [key, value.credits])
        )
      );
    }
  });

  it('should quote five welcome credits across all 7 help locales', () => {
    for (const locale of [enHelp, deHelp, esHelp, frHelp, itHelp, jaHelp, ptHelp]) {
      const serialized = JSON.stringify(locale);

      expect(serialized).toMatch(/5/);
      expect(serialized).not.toMatch(
        /10 (free credits|kostenlose Guthaben|créditos gratuitos|crédits gratuits|crediti gratuiti|créditos grátis)|10回の無料クレジット/
      );
    }
  });
});
