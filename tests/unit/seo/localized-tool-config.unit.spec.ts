import { beforeEach, describe, expect, it, vi } from 'vitest';
import canonicalInteractiveTools from '@/locales/en/interactive-tools.json';
import spanishInteractiveTools from '@/locales/es/interactive-tools.json';
import japaneseInteractiveTools from '@/locales/ja/interactive-tools.json';
import portugueseInteractiveTools from '@/locales/pt/interactive-tools.json';
import type { IToolPage } from '@/lib/seo/pseo-types';

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  generateToolSchema: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}));

vi.mock('@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate', () => ({
  InteractiveToolPageTemplate: () => null,
}));

vi.mock('@/app/(pseo)/_components/seo/SchemaMarkup', () => ({
  SchemaMarkup: () => null,
}));

vi.mock('@/lib/seo/schema-generator', () => ({
  generateToolSchema: mocks.generateToolSchema,
}));

function sourceTool(pages: typeof canonicalInteractiveTools.pages, slug: string) {
  const tool = pages.find(page => page.slug === slug);
  if (!tool) throw new Error(`Missing fixture for ${slug}`);
  return tool;
}

function generatedTool(): IToolPage {
  return mocks.generateToolSchema.mock.calls.at(-1)?.[0] as IToolPage;
}

describe('localized interactive tool configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue({
      raw: () => canonicalInteractiveTools.pages,
    });
    mocks.generateToolSchema.mockReturnValue({});
  });

  it('should keep Japanese YouTube display copy while using canonical runtime data', async () => {
    mocks.getTranslations.mockResolvedValue({
      raw: () => japaneseInteractiveTools.pages,
    });

    const { default: ResizeToolPage } =
      await import('@/app/[locale]/(pseo)/tools/resize/[slug]/page');
    const localized = sourceTool(japaneseInteractiveTools.pages, 'resize-image-for-youtube');
    const canonical = sourceTool(canonicalInteractiveTools.pages, 'resize-image-for-youtube');

    await ResizeToolPage({
      params: Promise.resolve({ slug: 'resize-image-for-youtube', locale: 'ja' }),
    });

    const tool = generatedTool();
    expect(tool.title).toBe(localized.title);
    expect(tool.toolComponent).toBe(canonical.toolComponent);
    expect(tool.toolComponent).not.toBe(localized.toolComponent);
    expect(tool.toolConfig).toEqual(canonical.toolConfig);
    expect(tool.toolConfig).not.toEqual(localized.toolConfig);
  });

  it('should use the canonical compressor for the Spanish image-compressor route', async () => {
    mocks.getTranslations.mockResolvedValue({
      raw: () => spanishInteractiveTools.pages,
    });

    const { default: CompressToolPage } =
      await import('@/app/[locale]/(pseo)/tools/compress/[slug]/page');
    const localized = sourceTool(spanishInteractiveTools.pages, 'image-compressor');
    const canonical = sourceTool(canonicalInteractiveTools.pages, 'image-compressor');

    await CompressToolPage({
      params: Promise.resolve({ slug: 'image-compressor', locale: 'es' }),
    });

    const tool = generatedTool();
    expect(tool.title).toBe(localized.title);
    expect(tool.toolComponent).toBe('ImageCompressor');
    expect(tool.toolComponent).toBe(canonical.toolComponent);
    expect(tool.toolComponent).not.toBe(localized.toolComponent);
    expect(tool.toolConfig).toEqual(canonical.toolConfig);
  });

  it.each(['png-to-jpg', 'jpg-to-png'] as const)(
    'should use canonical runtime data for the Spanish %s converter',
    async slug => {
      mocks.getTranslations.mockResolvedValue({
        raw: () => spanishInteractiveTools.pages,
      });

      const { default: ConversionToolPage } =
        await import('@/app/[locale]/(pseo)/tools/convert/[slug]/page');
      const localized = sourceTool(spanishInteractiveTools.pages, slug);
      const canonical = sourceTool(canonicalInteractiveTools.pages, slug);

      await ConversionToolPage({
        params: Promise.resolve({ slug, locale: 'es' }),
      });

      const tool = generatedTool();
      expect(tool.title).toBe(localized.title);
      expect(tool.toolComponent).toBe(canonical.toolComponent);
      expect(tool.toolComponent).not.toBe(localized.toolComponent);
      expect(tool.toolConfig).toEqual(canonical.toolConfig);
    }
  );

  it('should reject translated Portuguese MIME values for PNG-to-JPG runtime props', async () => {
    mocks.getTranslations.mockResolvedValue({
      raw: () => portugueseInteractiveTools.pages,
    });

    const { default: ConversionToolPage } =
      await import('@/app/[locale]/(pseo)/tools/convert/[slug]/page');
    const localized = sourceTool(portugueseInteractiveTools.pages, 'png-to-jpg');
    const canonical = sourceTool(canonicalInteractiveTools.pages, 'png-to-jpg');

    await ConversionToolPage({
      params: Promise.resolve({ slug: 'png-to-jpg', locale: 'pt' }),
    });

    const tool = generatedTool();
    expect(tool.title).toBe(localized.title);
    expect(tool.toolComponent).toBe(canonical.toolComponent);
    expect(tool.toolConfig).toEqual(canonical.toolConfig);
    expect(tool.toolConfig).not.toEqual(localized.toolConfig);
    expect(tool.toolConfig?.acceptedInputFormats).toEqual(['image/png']);
  });
});
