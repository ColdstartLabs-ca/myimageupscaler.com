import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@shared/config/env', () => ({
  serverEnv: { ENV: 'test' },
}));

describe('png-to-pdf and webp-to-pdf tool pages', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('png-to-pdf slug exists in tool registry', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('png-to-pdf', 'en');
    expect(result.data).not.toBeNull();
    expect(result.data?.slug).toBe('png-to-pdf');
  });

  it('webp-to-pdf slug exists in tool registry', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('webp-to-pdf', 'en');
    expect(result.data).not.toBeNull();
    expect(result.data?.slug).toBe('webp-to-pdf');
  });

  it('png-to-pdf uses ImageToPdfConverter component', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('png-to-pdf', 'en');
    expect(result.data?.toolComponent).toBe('ImageToPdfConverter');
  });

  it('webp-to-pdf uses ImageToPdfConverter component', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('webp-to-pdf', 'en');
    expect(result.data?.toolComponent).toBe('ImageToPdfConverter');
  });

  it('png-to-pdf only accepts image/png', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('png-to-pdf', 'en');
    expect(result.data?.acceptedFormats).toEqual(['image/png']);
    expect(
      (result.data?.toolConfig as { acceptedInputFormats: string[] })?.acceptedInputFormats
    ).toEqual(['image/png']);
  });

  it('webp-to-pdf only accepts image/webp', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('webp-to-pdf', 'en');
    expect(result.data?.acceptedFormats).toEqual(['image/webp']);
    expect(
      (result.data?.toolConfig as { acceptedInputFormats: string[] })?.acceptedInputFormats
    ).toEqual(['image/webp']);
  });

  it('png-to-pdf has valid metaTitle and metaDescription', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('png-to-pdf', 'en');
    expect(result.data?.metaTitle).toBeTruthy();
    expect(result.data?.metaDescription).toBeTruthy();
  });

  it('webp-to-pdf has valid metaTitle and metaDescription', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('webp-to-pdf', 'en');
    expect(result.data?.metaTitle).toBeTruthy();
    expect(result.data?.metaDescription).toBeTruthy();
  });

  it('png-to-pdf relatedTools cross-links webp-to-pdf', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('png-to-pdf', 'en');
    expect(result.data?.relatedTools).toContain('webp-to-pdf');
    expect(result.data?.relatedTools).toContain('image-to-pdf');
  });

  it('webp-to-pdf relatedTools cross-links png-to-pdf', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('webp-to-pdf', 'en');
    expect(result.data?.relatedTools).toContain('png-to-pdf');
    expect(result.data?.relatedTools).toContain('image-to-pdf');
  });

  it('image-to-pdf relatedTools includes png-to-pdf and webp-to-pdf', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('image-to-pdf', 'en');
    expect(result.data?.relatedTools).toContain('png-to-pdf');
    expect(result.data?.relatedTools).toContain('webp-to-pdf');
  });

  it('jpg-to-pdf relatedTools includes png-to-pdf and webp-to-pdf', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('jpg-to-pdf', 'en');
    expect(result.data?.relatedTools).toContain('png-to-pdf');
    expect(result.data?.relatedTools).toContain('webp-to-pdf');
  });

  it('both slugs are included in getAllToolSlugs', async () => {
    const { getAllToolSlugs } = await import('@/lib/seo/data-loader');
    const slugs = await getAllToolSlugs();
    expect(slugs).toContain('png-to-pdf');
    expect(slugs).toContain('webp-to-pdf');
  });

  it('png-to-pdf is marked as interactive', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('png-to-pdf', 'en');
    expect(result.data?.isInteractive).toBe(true);
  });

  it('webp-to-pdf is marked as interactive', async () => {
    const { getToolDataWithLocale } = await import('@/lib/seo/data-loader');
    const result = await getToolDataWithLocale('webp-to-pdf', 'en');
    expect(result.data?.isInteractive).toBe(true);
  });
});
