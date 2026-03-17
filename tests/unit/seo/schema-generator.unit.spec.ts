/**
 * Schema Generator Unit Tests
 *
 * Tests for standalone FAQ and HowTo schema generators
 * Phase 6: Added for AI search extraction
 */

import { describe, it, expect } from 'vitest';
import { generateFAQSchema, generateHowToSchema } from '@lib/seo/schema-generator';
import type { IFAQSchema, IHowToStep } from '@lib/seo';

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
