import { describe, expect, test } from 'vitest';

import formatsData from '../../../app/seo/data/formats.json';
import scaleData from '../../../app/seo/data/scale.json';
import toolsData from '../../../app/seo/data/tools.json';

function getPage(data: { pages: Array<{ slug: string; [key: string]: unknown }> }, slug: string) {
  const page = data.pages.find(candidate => candidate.slug === slug);
  expect(page, `missing SEO page ${slug}`).toBeDefined();
  return page!;
}

describe('high-traffic commercial landing funnels', () => {
  test('AI image upscaler accurately explains signup and sends visitors into signup', () => {
    const page = getPage(toolsData, 'ai-image-upscaler');
    const copy = JSON.stringify(page).toLowerCase();

    expect(copy).not.toContain('no signup');
    expect(copy).toContain('5 free credits');
    expect(page.ctaUrl).toBe('/?signup=1');
  });

  test('GIF page does not claim unsupported animated GIF processing', () => {
    const page = getPage(formatsData, 'upscale-gif-images');
    const copy = JSON.stringify(page).toLowerCase();

    expect(copy).toContain('not currently supported');
    expect(copy).not.toContain('preserving animation frames');
    expect(page.ctaUrl).toBe('/tools/ai-image-upscaler');
  });

  test('16x page explains the supported two-pass workflow and has a signup CTA', () => {
    const page = getPage(scaleData, 'upscale-16x');
    const copy = JSON.stringify(page).toLowerCase();

    expect(copy).toContain('two passes');
    expect(copy).not.toContain('no signup');
    expect(page.ctaUrl).toBe('/?signup=1');
  });
});
