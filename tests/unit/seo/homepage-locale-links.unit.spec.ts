import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../../..');

describe('Homepage locale links', () => {
  const source = readFileSync(
    join(ROOT, 'client/components/pages/HomePageClient.tsx'),
    'utf-8',
  );

  it('Homepage should contain crawlable link to /fr', () => {
    expect(source).toContain("href: '/fr'");
  });

  it('Homepage should contain crawlable link to /de', () => {
    expect(source).toContain("href: '/de'");
  });

  it('Homepage should contain crawlable link to /es', () => {
    expect(source).toContain("href: '/es'");
  });

  it('Homepage should contain crawlable link to /it', () => {
    expect(source).toContain("href: '/it'");
  });

  it('Homepage should contain crawlable link to /ja', () => {
    expect(source).toContain("href: '/ja'");
  });

  it('Homepage should contain crawlable link to /pt', () => {
    expect(source).toContain("href: '/pt'");
  });

  it('Homepage should link to all 6 non-English locales', () => {
    const locales = ['/de', '/es', '/fr', '/it', '/ja', '/pt'];
    const presentLocales = locales.filter(locale => source.includes(`href: '${locale}'`));
    expect(presentLocales.length).toBe(6);
  });

  it('Locale links use Next.js Link component (crawlable)', () => {
    // Verify Link is used from next/link and LOCALE_LINKS renders through it
    expect(source).toContain('LOCALE_LINKS');
    expect(source).toContain('<Link');
  });
});
