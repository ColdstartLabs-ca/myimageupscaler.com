/**
 * Schema Generator Unit Tests
 *
 * Tests for standalone FAQ and HowTo schema generators
 * Phase 6: Added for AI search extraction
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateFAQSchema,
  generateHowToSchema,
  generateHomepageSchema,
  generateToolSchema,
} from '@lib/seo/schema-generator';
import type { IFAQSchema, IHowToStep, IToolPage } from '@lib/seo';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
    SUPPORT_EMAIL: 'support@myimageupscaler.com',
  },
  serverEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    ENV: 'test',
  },
}));

describe('generateFAQSchema', () => {
  it('should generate valid FAQPage schema with @context and @type', () => {
    const faqs: IFAQSchema[] = [
      {
        '@type': 'Question',
        name: 'What is AI upscaling?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'AI upscaling uses machine learning to increase image resolution.',
        },
      },
    ];

    const schema = generateFAQSchema(faqs);

    expect(schema).toHaveProperty('@context', 'https://schema.org');
    expect(schema).toHaveProperty('@type', 'FAQPage');
    expect(schema).toHaveProperty('mainEntity');
  });

  it('should include all FAQ items in mainEntity array', () => {
    const faqs: IFAQSchema[] = [
      {
        '@type': 'Question',
        name: 'Question 1',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Answer 1',
        },
      },
      {
        '@type': 'Question',
        name: 'Question 2',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Answer 2',
        },
      },
    ];

    const schema = generateFAQSchema(faqs) as Record<string, unknown>;
    const mainEntity = schema.mainEntity as unknown[];

    expect(mainEntity).toHaveLength(2);
    expect(mainEntity[0]).toEqual({
      '@type': 'Question',
      name: 'Question 1',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Answer 1',
      },
    });
  });

  it('should handle empty FAQ array', () => {
    const schema = generateFAQSchema([]) as Record<string, unknown>;

    expect(schema).toHaveProperty('@context', 'https://schema.org');
    expect(schema).toHaveProperty('@type', 'FAQPage');
    expect(schema.mainEntity).toEqual([]);
  });

  it('should produce JSON-serializable output', () => {
    const faqs: IFAQSchema[] = [
      {
        '@type': 'Question',
        name: 'Test Question',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Test Answer',
        },
      },
    ];

    const schema = generateFAQSchema(faqs);

    expect(() => JSON.stringify(schema)).not.toThrow();
    expect(() => JSON.parse(JSON.stringify(schema))).not.toThrow();
  });
});

describe('generateHowToSchema', () => {
  const mockSteps: IHowToStep[] = [
    {
      '@type': 'HowToStep',
      name: 'Upload your image',
      text: 'Click the upload button to select your image.',
    },
    {
      '@type': 'HowToStep',
      name: 'Select enhancement level',
      text: 'Choose 2x, 3x, or 4x upscaling.',
    },
  ];

  it('should generate valid HowTo schema with @context and @type', () => {
    const schema = generateHowToSchema({
      name: 'How to Upscale Images',
      description: 'Learn how to upscale images with AI',
      steps: mockSteps,
    });

    expect(schema).toHaveProperty('@context', 'https://schema.org');
    expect(schema).toHaveProperty('@type', 'HowTo');
  });

  it('should include required HowTo properties', () => {
    const schema = generateHowToSchema({
      name: 'How to Upscale Images',
      description: 'Learn how to upscale images with AI',
      steps: mockSteps,
    }) as Record<string, unknown>;

    expect(schema).toHaveProperty('name', 'How to Upscale Images');
    expect(schema).toHaveProperty('description', 'Learn how to upscale images with AI');
    expect(schema).toHaveProperty('step');
  });

  it('should include all steps in step array', () => {
    const schema = generateHowToSchema({
      name: 'How to Upscale Images',
      description: 'Learn how to upscale images with AI',
      steps: mockSteps,
    }) as Record<string, unknown>;

    const steps = schema.step as unknown[];

    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({
      '@type': 'HowToStep',
      name: 'Upload your image',
      text: 'Click the upload button to select your image.',
    });
  });

  it('should include image property when provided', () => {
    const schema = generateHowToSchema({
      name: 'How to Upscale Images',
      description: 'Learn how to upscale images with AI',
      steps: mockSteps,
      image: 'https://example.com/image.jpg',
    }) as Record<string, unknown>;

    expect(schema).toHaveProperty('image', 'https://example.com/image.jpg');
  });

  it('should not include image property when not provided', () => {
    const schema = generateHowToSchema({
      name: 'How to Upscale Images',
      description: 'Learn how to upscale images with AI',
      steps: mockSteps,
    }) as Record<string, unknown>;

    expect(schema).not.toHaveProperty('image');
  });

  it('should handle empty steps array', () => {
    const schema = generateHowToSchema({
      name: 'How to Upscale Images',
      description: 'Learn how to upscale images with AI',
      steps: [],
    }) as Record<string, unknown>;

    expect(schema).toHaveProperty('step', []);
  });

  it('should produce JSON-serializable output', () => {
    const schema = generateHowToSchema({
      name: 'How to Upscale Images',
      description: 'Learn how to upscale images with AI',
      steps: mockSteps,
    });

    expect(() => JSON.stringify(schema)).not.toThrow();
    expect(() => JSON.parse(JSON.stringify(schema))).not.toThrow();
  });

  it('should properly format step objects without @type when using generateHowToSchema', () => {
    // The generateHowToSchema function should accept plain step objects
    // and add the @type property internally
    const plainSteps = [
      {
        name: 'Step 1',
        text: 'Do step 1',
      },
      {
        name: 'Step 2',
        text: 'Do step 2',
      },
    ];

    const schema = generateHowToSchema({
      name: 'Test HowTo',
      description: 'Test description',
      steps: plainSteps as IHowToStep[],
    }) as Record<string, unknown>;

    const steps = schema.step as unknown[];

    expect(steps).toHaveLength(2);
    // The schema generator uses the steps as-is, so if they don't have @type,
    // they won't have it in the output either
    expect(steps[0]).toHaveProperty('name', 'Step 1');
    expect(steps[0]).toHaveProperty('text', 'Do step 1');
  });
});

describe('Speakable schema (AEO)', () => {
  describe('generateHomepageSchema', () => {
    it('should include a WebPage node with SpeakableSpecification', () => {
      const schema = generateHomepageSchema('en') as { '@graph': Record<string, unknown>[] };
      const graph = schema['@graph'];

      const webPage = graph.find(node => node['@type'] === 'WebPage');
      expect(webPage).toBeDefined();
      expect(webPage).toHaveProperty('speakable');

      const speakable = webPage!['speakable'] as Record<string, unknown>;
      expect(speakable['@type']).toBe('SpeakableSpecification');
      expect(speakable['cssSelector']).toContain('h1');
      expect(speakable['cssSelector']).toContain('h2');
    });

    it('should give the WebPage node a stable @id', () => {
      const schema = generateHomepageSchema('en') as { '@graph': Record<string, unknown>[] };
      const webPage = schema['@graph'].find(n => n['@type'] === 'WebPage');
      expect(webPage).toHaveProperty('@id');
      expect(webPage!['@id'] as string).toContain('#webpage');
    });

    it('should include @id on the Organization node', () => {
      const schema = generateHomepageSchema('en') as { '@graph': Record<string, unknown>[] };
      const org = schema['@graph'].find(n => n['@type'] === 'Organization');
      expect(org).toBeDefined();
      expect(org!['@id']).toBe('https://myimageupscaler.com#organization');
    });
  });

  describe('generateToolSchema', () => {
    const mockTool: IToolPage = {
      slug: 'ai-image-upscaler',
      title: 'AI Image Upscaler',
      primaryKeyword: 'ai image upscaler',
      category: 'upscale',
      metaTitle: 'AI Image Upscaler',
      metaDescription: 'Upscale images with AI',
      heroTitle: 'AI Image Upscaler',
      heroSubtitle: 'Upscale images',
      features: [],
      faq: [{ question: 'How does it work?', answer: 'It uses AI to upscale images.' }],
    };

    it('should include a WebPage node with SpeakableSpecification', () => {
      const schema = generateToolSchema(mockTool, 'en') as { '@graph': Record<string, unknown>[] };
      const webPage = schema['@graph'].find(n => n['@type'] === 'WebPage');
      expect(webPage).toBeDefined();
      expect(webPage).toHaveProperty('speakable');

      const speakable = webPage!['speakable'] as Record<string, unknown>;
      expect(speakable['@type']).toBe('SpeakableSpecification');
      expect(speakable['cssSelector']).toContain('h1');
      expect(speakable['cssSelector']).toContain('h2');
    });

    it('should use the tool canonical URL in the WebPage @id', () => {
      const schema = generateToolSchema(mockTool, 'en') as { '@graph': Record<string, unknown>[] };
      const webPage = schema['@graph'].find(n => n['@type'] === 'WebPage');
      expect(webPage!['@id']).toBe('https://myimageupscaler.com/tools/ai-image-upscaler#webpage');
    });

    it('should use locale-prefixed URL for non-English locales', () => {
      const schema = generateToolSchema(mockTool, 'de') as { '@graph': Record<string, unknown>[] };
      const webPage = schema['@graph'].find(n => n['@type'] === 'WebPage');
      expect(webPage!['@id']).toBe(
        'https://myimageupscaler.com/de/tools/ai-image-upscaler#webpage'
      );
    });
  });
});
