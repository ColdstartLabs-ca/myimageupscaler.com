import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT_TITLE,
  classifyLocalePage,
  type IRenderedPageSignal,
} from '@/scripts/seo/measure-locale-coverage';

const english: IRenderedPageSignal = {
  url: 'https://myimageupscaler.com/device-use/mobile-ecommerce-upscaler',
  status: 200,
  title: 'Mobile E-commerce Image Upscaler',
  h1: 'Mobile E-commerce Upscaler',
};

describe('locale coverage classification', () => {
  it('should classify an English-identical page as english-mirror', () => {
    expect(
      classifyLocalePage(english, {
        ...english,
        url: `https://myimageupscaler.com/es${new URL(english.url).pathname}`,
      })
    ).toBe('english-mirror');
  });

  it('should classify the generic homepage title as soft-404', () => {
    expect(
      classifyLocalePage(english, {
        url: `https://myimageupscaler.com/es${new URL(english.url).pathname}`,
        status: 200,
        title: DEFAULT_LAYOUT_TITLE,
      })
    ).toBe('soft404');
  });

  it('should compare against the English page, not against itself', () => {
    expect(() => classifyLocalePage(english, english)).toThrow(/against itself/);
  });

  it('should keep a genuinely translated page distinct', () => {
    expect(
      classifyLocalePage(english, {
        url: `https://myimageupscaler.com/fr${new URL(english.url).pathname}`,
        status: 200,
        title: "Agrandisseur d'images e-commerce mobile",
        h1: "Agrandisseur d'images e-commerce mobile",
      })
    ).toBe('translated');
  });
});
