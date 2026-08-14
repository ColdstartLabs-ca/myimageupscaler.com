import { describe, expect, it, vi } from 'vitest';
import { generateMetadata } from '@/lib/seo/metadata-factory';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
  serverEnv: {
    ENV: 'test',
  },
}));

const page = (slug: string, lastUpdated = '2025-01-01T00:00:00.000Z') => ({
  slug,
  title: 'Test page',
  metaTitle: 'Test page',
  metaDescription: 'Test description',
  h1: 'Test page',
  intro: 'Test intro',
  primaryKeyword: 'test page',
  secondaryKeywords: [],
  lastUpdated,
});

describe('pruned page signals', () => {
  it('noindexes but follows a pruned page', () => {
    const metadata = generateMetadata(page('svg-to-jpg'), 'tools', 'fr');

    expect(metadata.robots).toMatchObject({ index: false, follow: true });
  });

  it('keeps a click-producing page indexable', () => {
    const metadata = generateMetadata(page('convert-jpeg-to-png'), 'tools', 'en');

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });
});
