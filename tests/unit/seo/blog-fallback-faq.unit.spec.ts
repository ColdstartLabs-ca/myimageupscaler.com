import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFallbackBlogFaq, buildFaqJsonLd } from '@lib/blog/blog-faq';

describe('blog fallback FAQ', () => {
  const post = {
    title: 'How to Upscale Images Without Losing Quality',
    description:
      'Learn the best techniques and tools for upscaling images while preserving sharpness, detail, and overall quality.',
    category: 'Tutorials',
    tags: ['image upscaling', 'AI enhancement', 'photo quality'],
  };

  it('builds relevant fallback questions from post metadata', () => {
    const faqs = buildFallbackBlogFaq(post);

    expect(faqs).toHaveLength(3);
    expect(faqs[0].question).toBe('How do I upscale images without losing quality?');
    expect(faqs[0].answer).toContain(post.description);
    expect(faqs[1].answer).toContain('image upscaling');
    expect(faqs[2].answer).toContain('Upscale once');
  });

  it('does not generate broken wording for comparison SEO titles', () => {
    const faqs = buildFallbackBlogFaq({
      title: 'Best Free AI Image Upscaler No Watermark',
      description:
        'Compare free AI image upscalers with no watermark in 2026. See which tools avoid signup friction, hidden limits, and low-quality exports.',
      category: 'Tools',
      tags: ['free AI image upscaler', 'no watermark', 'tool comparison'],
    });

    expect(faqs[0].question).toBe(
      'How do I choose the right free AI image upscaler with no watermark?'
    );
    expect(faqs[0].question).not.toContain('best way to best');
    expect(faqs[0].answer).toContain('Compare tools by output sharpness');
    expect(faqs[0].answer).toContain('watermark policy');
  });

  it('uses requirements wording for size and DPI posts', () => {
    const faqs = buildFallbackBlogFaq({
      title: 'Image Resolution for Printing: DPI Guide for Perfect Prints',
      description:
        'Learn exactly what resolution you need for print. Calculate DPI requirements, understand when to upscale, and get print-ready images every time.',
      category: 'Tutorials',
      tags: ['printing', 'DPI', 'resolution'],
    });

    expect(faqs[0].question).toBe('What should I know about image resolution for printing DPI?');
    expect(faqs[0].answer).toContain('target size, format, and platform requirements');
  });

  it('converts fallback questions to FAQPage JSON-LD', () => {
    const schema = buildFaqJsonLd(buildFallbackBlogFaq(post));

    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toHaveLength(3);
    expect(schema.mainEntity[0]).toMatchObject({
      '@type': 'Question',
      acceptedAnswer: {
        '@type': 'Answer',
      },
    });
  });

  it('wires fallback FAQ into the blog post template', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx'),
      'utf8'
    );

    expect(pageSource).toContain('buildFallbackBlogFaq');
    expect(pageSource).toContain('BlogFaqSection');
    expect(pageSource).toContain('extractedFaqJsonLd ? []');
  });
});
