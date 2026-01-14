/**
 * Schema Generator Tests
 * Tests for generatePSEOSchema function
 * Phase 4: Rich Schema Markup for pSEO Templates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import type { IPlatformPage, IFormatScalePage, IDeviceUseCasePage } from '@/lib/seo/pseo-types';

describe('Schema Generator - generatePSEOSchema', () => {
  const mockPlatformData: IPlatformPage = {
    slug: 'midjourney-upscaler',
    title: 'Midjourney Upscaler',
    metaTitle: 'Best AI Midjourney Upscaler | Enhance Images 4x',
    metaDescription: 'Upscale Midjourney images with AI. Get 4x resolution enhancement.',
    h1: 'Midjourney AI Image Upscaler',
    intro: 'Enhance your Midjourney images',
    primaryKeyword: 'midjourney upscaler',
    secondaryKeywords: ['midjourney enhancement', 'ai upscaling'],
    lastUpdated: '2026-01-14',
    category: 'platforms',
    platformName: 'Midjourney',
    platformType: 'ai-generator',
    description: 'Enhance Midjourney AI-generated images',
    benefits: [
      { title: '4x Enhancement', description: 'Upscale images up to 4x' },
      { title: 'Quality Preservation', description: 'Maintain image quality' },
    ],
    integration: ['Drag & drop', 'Batch processing'],
    useCases: [
      { title: 'Print', description: 'Prepare for printing' },
      { title: 'Web', description: 'Optimize for web' },
    ],
    workflowSteps: ['Upload image', 'Select enhancement', 'Download result'],
    faq: [
      {
        question: 'How does Midjourney upscaling work?',
        answer: 'Our AI analyzes your Midjourney images and intelligently adds details.',
      },
      {
        question: 'What formats are supported?',
        answer: 'We support PNG, JPEG, and WebP formats.',
      },
    ],
    relatedPlatforms: ['stable-diffusion-upscaler'],
    relatedTools: ['image-upscaler'],
  };

  const mockFormatScaleData: IFormatScalePage = {
    slug: 'png-upscale-2x',
    title: 'PNG 2x Upscaler',
    metaTitle: 'PNG Image 2x Upscaler | Double Resolution',
    metaDescription: 'Upscale PNG images to 2x resolution with AI.',
    h1: 'PNG 2x Upscaler',
    intro: 'Double your PNG image resolution',
    primaryKeyword: 'png upscaler 2x',
    secondaryKeywords: ['png enhancement', '2x upscaling'],
    lastUpdated: '2026-01-14',
    category: 'format-scale',
    format: 'PNG',
    scaleFactor: '2x',
    formatDescription: 'PNG is a lossless image format.',
    scaleExpectations: '2x scaling doubles the dimensions.',
    useCases: [{ title: 'Print', description: 'Prepare for printing' }],
    benefits: [{ title: 'Lossless', description: 'Maintain quality' }],
    bestPractices: ['Start with high quality', 'Avoid over-upsampling'],
    tips: ['Use PNG for transparency', 'Compress after upscaling'],
    faq: [
      {
        question: 'Will PNG transparency be preserved?',
        answer: 'Yes, our upscaler preserves PNG transparency.',
      },
    ],
    relatedFormats: ['jpeg-upscaler'],
    relatedScales: ['png-upscale-4x'],
  };

  const mockDeviceUseData: IDeviceUseCasePage = {
    slug: 'mobile-social-media-upscaler',
    title: 'Mobile Social Media Upscaler',
    metaTitle: 'Mobile Social Media Image Upscaler',
    metaDescription: 'Optimize images for mobile social media platforms.',
    h1: 'Mobile Social Media Upscaler',
    intro: 'Perfect images for social media',
    primaryKeyword: 'mobile social media upscaler',
    secondaryKeywords: ['mobile optimization', 'social media images'],
    lastUpdated: '2026-01-14',
    category: 'device-use',
    device: 'mobile',
    useCase: 'social media',
    deviceDescription: 'Mobile devices have limited screen space.',
    useCaseDescription: 'Social media platforms have specific requirements.',
    deviceConstraints: ['Limited bandwidth', 'Small screen size'],
    useCaseBenefits: ['Better engagement', 'Faster loading'],
    tips: ['Use square format', 'Optimize file size'],
    faq: [
      {
        question: 'What resolution is best for mobile social media?',
        answer: '1080x1080 is recommended for most platforms.',
      },
    ],
    relatedDevices: ['desktop-social-media-upscaler'],
    relatedUseCases: ['mobile-professional-upscaler'],
  };

  describe('Platform pages', () => {
    it('should generate schema with WebPage, FAQPage, and BreadcrumbList', () => {
      const schema = generatePSEOSchema(mockPlatformData, 'platforms', 'en') as {
        '@context': string;
        '@graph': object[];
      };

      expect(schema).toHaveProperty('@context', 'https://schema.org');
      expect(schema).toHaveProperty('@graph');
      expect(Array.isArray(schema['@graph'])).toBe(true);
      expect(schema['@graph'].length).toBeGreaterThanOrEqual(2);
    });

    it('should generate WebPage schema with inLanguage property', () => {
      const schema = generatePSEOSchema(mockPlatformData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const webPage = schema['@graph'].find((item: any) => item['@type'] === 'WebPage');

      expect(webPage).toBeDefined();
      expect(webPage).toHaveProperty('@type', 'WebPage');
      expect(webPage).toHaveProperty('inLanguage', 'en');
      expect(webPage).toHaveProperty('name', mockPlatformData.metaTitle);
      expect(webPage).toHaveProperty('description', mockPlatformData.metaDescription);
    });

    it('should generate FAQPage schema from FAQ data', () => {
      const schema = generatePSEOSchema(mockPlatformData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const faqPage = schema['@graph'].find((item: any) => item['@type'] === 'FAQPage');

      expect(faqPage).toBeDefined();
      expect(faqPage).toHaveProperty('@type', 'FAQPage');
      expect(faqPage).toHaveProperty('mainEntity');
      expect(Array.isArray(faqPage['mainEntity'])).toBe(true);
      expect(faqPage['mainEntity'].length).toBe(mockPlatformData.faq.length);

      // Check first FAQ item structure
      const firstFaq = faqPage['mainEntity'][0];
      expect(firstFaq).toHaveProperty('@type', 'Question');
      expect(firstFaq).toHaveProperty('name', mockPlatformData.faq[0].question);
      expect(firstFaq).toHaveProperty('acceptedAnswer');
      expect(firstFaq['acceptedAnswer']).toHaveProperty('@type', 'Answer');
      expect(firstFaq['acceptedAnswer']).toHaveProperty('text', mockPlatformData.faq[0].answer);
    });

    it('should generate BreadcrumbList schema for platforms', () => {
      const schema = generatePSEOSchema(mockPlatformData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const breadcrumb = schema['@graph'].find((item: any) => item['@type'] === 'BreadcrumbList');

      expect(breadcrumb).toBeDefined();
      expect(breadcrumb).toHaveProperty('@type', 'BreadcrumbList');
      expect(breadcrumb).toHaveProperty('itemListElement');
      expect(Array.isArray(breadcrumb['itemListElement'])).toBe(true);
      expect(breadcrumb['itemListElement'].length).toBe(3);

      // Check breadcrumb items
      expect(breadcrumb['itemListElement'][0]).toHaveProperty('position', 1);
      expect(breadcrumb['itemListElement'][0]).toHaveProperty('name', 'Home');
      expect(breadcrumb['itemListElement'][1]).toHaveProperty('position', 2);
      expect(breadcrumb['itemListElement'][1]).toHaveProperty('name', 'Platforms');
      expect(breadcrumb['itemListElement'][2]).toHaveProperty('position', 3);
      expect(breadcrumb['itemListElement'][2]).toHaveProperty('name', 'Midjourney');
    });

    it('should handle locale parameter correctly for non-English', () => {
      const schemaEs = generatePSEOSchema(mockPlatformData, 'platforms', 'es') as {
        '@graph': object[];
      };
      const webPage = schemaEs['@graph'].find((item: any) => item['@type'] === 'WebPage');

      expect(webPage).toHaveProperty('inLanguage', 'es');
      expect(webPage).toHaveProperty('url');
      expect(webPage['url']).toContain('/es/platforms/');
    });

    it('should not include locale prefix for English', () => {
      const schemaEn = generatePSEOSchema(mockPlatformData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const webPage = schemaEn['@graph'].find((item: any) => item['@type'] === 'WebPage');

      expect(webPage).toHaveProperty('inLanguage', 'en');
      expect(webPage['url']).not.toContain('/en/platforms/');
      expect(webPage['url']).toMatch(/\/platforms\//);
    });
  });

  describe('Format-scale pages', () => {
    it('should generate schema with WebPage, FAQPage, and BreadcrumbList', () => {
      const schema = generatePSEOSchema(mockFormatScaleData, 'format-scale', 'en') as {
        '@context': string;
        '@graph': object[];
      };

      expect(schema).toHaveProperty('@context', 'https://schema.org');
      expect(schema).toHaveProperty('@graph');
      expect(Array.isArray(schema['@graph'])).toBe(true);
      expect(schema['@graph'].length).toBeGreaterThanOrEqual(2);
    });

    it('should generate WebPage schema for format-scale', () => {
      const schema = generatePSEOSchema(mockFormatScaleData, 'format-scale', 'en') as {
        '@graph': object[];
      };
      const webPage = schema['@graph'].find((item: any) => item['@type'] === 'WebPage');

      expect(webPage).toBeDefined();
      expect(webPage).toHaveProperty('@type', 'WebPage');
      expect(webPage).toHaveProperty('name', mockFormatScaleData.metaTitle);
      expect(webPage).toHaveProperty('url');
      expect(webPage['url']).toContain('/format-scale/');
    });

    it('should generate FAQPage schema from FAQ data', () => {
      const schema = generatePSEOSchema(mockFormatScaleData, 'format-scale', 'en') as {
        '@graph': object[];
      };
      const faqPage = schema['@graph'].find((item: any) => item['@type'] === 'FAQPage');

      expect(faqPage).toBeDefined();
      expect(faqPage).toHaveProperty('@type', 'FAQPage');
      expect(faqPage['mainEntity'].length).toBe(mockFormatScaleData.faq.length);
    });

    it('should generate BreadcrumbList schema for format-scale', () => {
      const schema = generatePSEOSchema(mockFormatScaleData, 'format-scale', 'en') as {
        '@graph': object[];
      };
      const breadcrumb = schema['@graph'].find((item: any) => item['@type'] === 'BreadcrumbList');

      expect(breadcrumb).toBeDefined();
      expect(breadcrumb['itemListElement'].length).toBe(3);
      expect(breadcrumb['itemListElement'][1]).toHaveProperty('name', 'Format Scale');
      expect(breadcrumb['itemListElement'][2]).toHaveProperty('name', 'PNG 2x');
    });

    it('should use format and scale for breadcrumb title', () => {
      const schema = generatePSEOSchema(mockFormatScaleData, 'format-scale', 'en') as {
        '@graph': object[];
      };
      const breadcrumb = schema['@graph'].find((item: any) => item['@type'] === 'BreadcrumbList');

      expect(breadcrumb['itemListElement'][2]['name']).toBe('PNG 2x');
    });
  });

  describe('Device-use pages', () => {
    it('should generate schema with WebPage, FAQPage, and BreadcrumbList', () => {
      const schema = generatePSEOSchema(mockDeviceUseData, 'device-use', 'en') as {
        '@context': string;
        '@graph': object[];
      };

      expect(schema).toHaveProperty('@context', 'https://schema.org');
      expect(schema).toHaveProperty('@graph');
      expect(Array.isArray(schema['@graph'])).toBe(true);
      expect(schema['@graph'].length).toBeGreaterThanOrEqual(2);
    });

    it('should generate WebPage schema for device-use', () => {
      const schema = generatePSEOSchema(mockDeviceUseData, 'device-use', 'en') as {
        '@graph': object[];
      };
      const webPage = schema['@graph'].find((item: any) => item['@type'] === 'WebPage');

      expect(webPage).toBeDefined();
      expect(webPage).toHaveProperty('@type', 'WebPage');
      expect(webPage).toHaveProperty('url');
      expect(webPage['url']).toContain('/device-use/');
    });

    it('should generate FAQPage schema from FAQ data', () => {
      const schema = generatePSEOSchema(mockDeviceUseData, 'device-use', 'en') as {
        '@graph': object[];
      };
      const faqPage = schema['@graph'].find((item: any) => item['@type'] === 'FAQPage');

      expect(faqPage).toBeDefined();
      expect(faqPage['mainEntity'].length).toBe(mockDeviceUseData.faq.length);
    });

    it('should generate BreadcrumbList schema for device-use', () => {
      const schema = generatePSEOSchema(mockDeviceUseData, 'device-use', 'en') as {
        '@graph': object[];
      };
      const breadcrumb = schema['@graph'].find((item: any) => item['@type'] === 'BreadcrumbList');

      expect(breadcrumb).toBeDefined();
      expect(breadcrumb['itemListElement'].length).toBe(3);
      expect(breadcrumb['itemListElement'][1]).toHaveProperty('name', 'Device Use');
      expect(breadcrumb['itemListElement'][2]).toHaveProperty('name', 'mobile social media');
    });

    it('should use device and useCase for breadcrumb title', () => {
      const schema = generatePSEOSchema(mockDeviceUseData, 'device-use', 'en') as {
        '@graph': object[];
      };
      const breadcrumb = schema['@graph'].find((item: any) => item['@type'] === 'BreadcrumbList');

      expect(breadcrumb['itemListElement'][2]['name']).toBe('mobile social media');
    });
  });

  describe('Edge cases', () => {
    it('should not render FAQPage schema when FAQ array is empty', () => {
      const emptyFaqData = { ...mockPlatformData, faq: [] };
      const schema = generatePSEOSchema(emptyFaqData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const faqPage = schema['@graph'].find((item: any) => item['@type'] === 'FAQPage');

      expect(faqPage).toBeUndefined();
    });

    it('should not render FAQPage schema when FAQ is undefined', () => {
      const noFaqData = { ...mockPlatformData, faq: undefined as any };
      const schema = generatePSEOSchema(noFaqData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const faqPage = schema['@graph'].find((item: any) => item['@type'] === 'FAQPage');

      expect(faqPage).toBeUndefined();
    });

    it('should still render WebPage and BreadcrumbList when FAQ is empty', () => {
      const emptyFaqData = { ...mockPlatformData, faq: [] };
      const schema = generatePSEOSchema(emptyFaqData, 'platforms', 'en') as {
        '@graph': object[];
      };

      expect(schema['@graph'].length).toBe(2); // Only WebPage and BreadcrumbList

      const webPage = schema['@graph'].find((item: any) => item['@type'] === 'WebPage');
      const breadcrumb = schema['@graph'].find((item: any) => item['@type'] === 'BreadcrumbList');

      expect(webPage).toBeDefined();
      expect(breadcrumb).toBeDefined();
    });

    it('should handle all supported locales', () => {
      const locales = ['en', 'es', 'pt', 'de', 'fr', 'it', 'ja'] as const;

      locales.forEach(locale => {
        const schema = generatePSEOSchema(mockPlatformData, 'platforms', locale) as {
          '@graph': object[];
        };
        const webPage = schema['@graph'].find((item: any) => item['@type'] === 'WebPage');

        expect(webPage).toHaveProperty('inLanguage', locale);
      });
    });

    it('should handle unknown category with default breadcrumbs', () => {
      const schema = generatePSEOSchema(mockPlatformData, 'unknown-category', 'en') as {
        '@graph': object[];
      };
      const breadcrumb = schema['@graph'].find((item: any) => item['@type'] === 'BreadcrumbList');

      expect(breadcrumb).toBeDefined();
      expect(breadcrumb['itemListElement'][1]).toHaveProperty('name', 'unknown-category');
      expect(breadcrumb['itemListElement'][1]).toHaveProperty('item');
    });

    it('should include primaryKeyword in WebPage about property', () => {
      const schema = generatePSEOSchema(mockPlatformData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const webPage = schema['@graph'].find((item: any) => item['@type'] === 'WebPage');

      expect(webPage).toHaveProperty('about');
      expect(webPage['about']).toHaveProperty('@type', 'Thing');
      expect(webPage['about']).toHaveProperty('name', mockPlatformData.primaryKeyword);
    });
  });

  describe('Schema validation', () => {
    it('should include all required WebPage properties', () => {
      const schema = generatePSEOSchema(mockPlatformData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const webPage = schema['@graph'].find((item: any) => item['@type'] === 'WebPage');

      expect(webPage).toHaveProperty('@id');
      expect(webPage).toHaveProperty('name');
      expect(webPage).toHaveProperty('description');
      expect(webPage).toHaveProperty('url');
      expect(webPage).toHaveProperty('inLanguage');
      expect(webPage).toHaveProperty('isPartOf');
    });

    it('should include isPartOf with WebSite reference', () => {
      const schema = generatePSEOSchema(mockPlatformData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const webPage = schema['@graph'].find((item: any) => item['@type'] === 'WebPage');

      expect(webPage['isPartOf']).toHaveProperty('@type', 'WebSite');
      expect(webPage['isPartOf']).toHaveProperty('name');
      expect(webPage['isPartOf']).toHaveProperty('url');
    });

    it('should generate valid BreadcrumbList with all required properties', () => {
      const schema = generatePSEOSchema(mockPlatformData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const breadcrumb = schema['@graph'].find((item: any) => item['@type'] === 'BreadcrumbList');

      expect(breadcrumb).toHaveProperty('itemListElement');
      breadcrumb['itemListElement'].forEach((item: any) => {
        expect(item).toHaveProperty('@type', 'ListItem');
        expect(item).toHaveProperty('position');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('item');
      });
    });

    it('should generate valid FAQPage with all required properties', () => {
      const schema = generatePSEOSchema(mockPlatformData, 'platforms', 'en') as {
        '@graph': object[];
      };
      const faqPage = schema['@graph'].find((item: any) => item['@type'] === 'FAQPage');

      expect(faqPage).toHaveProperty('mainEntity');
      faqPage['mainEntity'].forEach((item: any) => {
        expect(item).toHaveProperty('@type', 'Question');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('acceptedAnswer');
        expect(item['acceptedAnswer']).toHaveProperty('@type', 'Answer');
        expect(item['acceptedAnswer']).toHaveProperty('text');
      });
    });
  });
});
