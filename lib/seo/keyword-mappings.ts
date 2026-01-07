/**
 * Keyword to Page Mappings
 * Canonical page assignments to avoid keyword cannibalization
 * Based on PRD-PSEO-01 Section 7: Keyword-to-Page Mapping
 */

import { IKeywordPageMapping } from './types';

export const keywordPageMappings: IKeywordPageMapping[] = [
  // Tier 1: Critical Priority (500K+ monthly searches)
  {
    primaryKeyword: 'ai image upscaler',
    secondaryKeywords: [
      'image upscaler',
      'ai upscale',
      'upscaler',
      'ai upscale image',
      'upscale image ai',
      'image upscaler ai',
      'upscale ai',
    ],
    canonicalUrl: '/tools/ai-image-upscaler',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'What Is AI Image Upscaling',
        'How It Works',
        'Key Features',
        'Benefits',
        'Use Cases',
        'FAQ',
        'Related Tools',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },
  {
    primaryKeyword: 'ai photo enhancer',
    secondaryKeywords: [
      'photo enhancer ai',
      'ai enhance photo',
      'photo ai enhancer',
      'enhance photo ai',
      'ai photo enhance',
      'photo enhancer online',
    ],
    canonicalUrl: '/tools/ai-photo-enhancer',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'What Is AI Photo Enhancement',
        'How It Works',
        'Key Features',
        'Benefits',
        'Use Cases',
        'FAQ',
        'Related Tools',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },
  {
    primaryKeyword: 'ai image enhancer',
    secondaryKeywords: [
      'image enhancer ai',
      'ai enhance image',
      'enhance image ai',
      'image ai enhancer',
      'image enhancer online',
    ],
    canonicalUrl: '/tools/ai-image-enhancer',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'What Is AI Image Enhancement',
        'How It Works',
        'Key Features',
        'Benefits',
        'Use Cases',
        'FAQ',
        'Related Tools',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },
  {
    primaryKeyword: 'photo quality enhancer',
    secondaryKeywords: [
      'image quality enhancer',
      'picture quality enhancer',
      'photo quality enhancer online',
      'image quality enhancer online',
    ],
    canonicalUrl: '/tools/photo-quality-enhancer',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'What Is Photo Quality Enhancement',
        'How It Works',
        'Key Features',
        'Benefits',
        'Use Cases',
        'FAQ',
        'Related Tools',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },
  {
    primaryKeyword: 'image clarity enhancer',
    secondaryKeywords: [
      'photo clarity enhancer',
      'picture clarity enhancer',
      'enhance image clarity',
    ],
    canonicalUrl: '/tools/image-clarity-enhancer',
    intent: 'Transactional',
    tier: 1,
    priority: 'P1',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'What Is Image Clarity Enhancement',
        'How It Works',
        'Key Features',
        'Benefits',
        'Use Cases',
        'FAQ',
        'Related Tools',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },
  {
    primaryKeyword: 'picture quality enhancer',
    secondaryKeywords: ['enhance picture quality', 'picture enhancer online'],
    canonicalUrl: '/tools/picture-quality-enhancer',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'What Is Picture Quality Enhancement',
        'How It Works',
        'Key Features',
        'Benefits',
        'Use Cases',
        'FAQ',
        'Related Tools',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },

  // Free Tool Pages (Tier 1 High Intent)
  {
    primaryKeyword: 'free image upscaler',
    secondaryKeywords: [
      'image upscaler free',
      'upscale image free',
      'free upscale image',
      'online image upscaler free',
      'image upscaler online free',
      'upscale image online',
    ],
    canonicalUrl: '/free/free-image-upscaler',
    intent: 'Transactional',
    tier: 2,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'Why Free Tools Matter',
        'How It Works',
        'Key Features',
        'Limitations vs Premium',
        'Use Cases',
        'FAQ',
        'Upgrade Path',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },
  {
    primaryKeyword: 'free photo enhancer',
    secondaryKeywords: [
      'photo enhancer free',
      'photo enhancer online free',
      'free online photo enhancer',
      'pic enhancer online',
      'photo online enhancer',
    ],
    canonicalUrl: '/free/free-photo-enhancer',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'Why Free Tools Matter',
        'How It Works',
        'Key Features',
        'Limitations vs Premium',
        'Use Cases',
        'FAQ',
        'Upgrade Path',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },
  {
    primaryKeyword: 'free image enhancer',
    secondaryKeywords: [
      'image enhancer free',
      'free online image enhancer',
      'online image enhancer free',
    ],
    canonicalUrl: '/free/free-image-enhancer',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'Why Free Tools Matter',
        'How It Works',
        'Key Features',
        'Limitations vs Premium',
        'Use Cases',
        'FAQ',
        'Upgrade Path',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },
  {
    primaryKeyword: 'free ai photo enhancer',
    secondaryKeywords: [
      'ai photo enhancer free',
      'free ai image enhancer',
      'ai image enhancer free',
      'free ai upscaler',
      'ai upscaler free',
    ],
    canonicalUrl: '/free/free-ai-photo-enhancer',
    intent: 'Transactional',
    tier: 2,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'AI vs Traditional Enhancement',
        'How It Works',
        'Key Features',
        'Limitations vs Premium',
        'Use Cases',
        'FAQ',
        'Upgrade Path',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },
  {
    primaryKeyword: 'free ai image upscaler',
    secondaryKeywords: ['ai image upscaler free', 'free ai upscale', 'ai upscale image free'],
    canonicalUrl: '/free/free-ai-upscaler',
    intent: 'Transactional',
    tier: 2,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Hero + Introduction',
        'AI vs Traditional Upscaling',
        'How It Works',
        'Key Features',
        'Limitations vs Premium',
        'Use Cases',
        'FAQ',
        'Upgrade Path',
      ],
      faqCount: 8,
      internalLinks: 5,
    },
  },

  // Scale-Specific Pages (Tier 2)
  {
    primaryKeyword: 'upscale to 4k',
    secondaryKeywords: [
      'image upscaler 4k',
      '4k image upscaler',
      'ai image upscaler 4k',
      'upscale image to 4k',
      '4k upscaler',
    ],
    canonicalUrl: '/scale/upscale-to-4k',
    intent: 'Commercial',
    tier: 2,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Hero + Introduction',
        'What Is 4K Resolution',
        'How 4K Upscaling Works',
        'Key Features',
        'Use Cases',
        'FAQ',
      ],
      faqCount: 6,
      internalLinks: 4,
    },
  },
  {
    primaryKeyword: 'upscale to hd',
    secondaryKeywords: [
      'hd image upscaler',
      'hd photo enhancer',
      'upscale image to hd',
      'hd upscaler',
    ],
    canonicalUrl: '/scale/upscale-to-hd',
    intent: 'Commercial',
    tier: 2,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Hero + Introduction',
        'What Is HD Resolution',
        'How HD Upscaling Works',
        'Key Features',
        'Use Cases',
        'FAQ',
      ],
      faqCount: 6,
      internalLinks: 4,
    },
  },

  // Comparison Pages (Tier 3)
  {
    primaryKeyword: 'best ai upscaler',
    secondaryKeywords: [
      'best ai image upscaler',
      'best image upscaler',
      'top ai upscalers',
      'best upscaler',
    ],
    canonicalUrl: '/compare/best-ai-upscalers',
    intent: 'Comparison',
    tier: 3,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Introduction',
        'Comparison Criteria',
        'Top Tools Compared',
        'Detailed Reviews',
        'Recommendations',
        'FAQ',
      ],
      faqCount: 6,
      internalLinks: 8,
    },
  },
  {
    primaryKeyword: 'myimageupscaler vs imgupscaler',
    secondaryKeywords: [
      'img upscaler com',
      'imgupscaler alternative',
      'imgupscaler vs myimageupscaler',
    ],
    canonicalUrl: '/compare/myimageupscaler-vs-imgupscaler',
    intent: 'Comparison',
    tier: 2,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Introduction',
        'Feature Comparison',
        'Pricing Comparison',
        'Performance Comparison',
        'Use Case Recommendations',
        'FAQ',
      ],
      faqCount: 6,
      internalLinks: 5,
    },
  },
  {
    primaryKeyword: 'myimageupscaler vs clipdrop',
    secondaryKeywords: [
      'clip drop image upscaler',
      'clipdrop alternative',
      'clipdrop vs myimageupscaler',
    ],
    canonicalUrl: '/compare/myimageupscaler-vs-clipdrop',
    intent: 'Comparison',
    tier: 3,
    priority: 'P1',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Introduction',
        'Feature Comparison',
        'Pricing Comparison',
        'Performance Comparison',
        'Use Case Recommendations',
        'FAQ',
      ],
      faqCount: 6,
      internalLinks: 5,
    },
  },

  // Guide Pages (Tier 1-3)
  {
    primaryKeyword: 'how to upsize images',
    secondaryKeywords: ['upsize an image', 'upsize image', 'image upsizing guide'],
    canonicalUrl: '/guides/how-to-upsize-images',
    intent: 'Informational',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 2250,
      sections: [
        'Introduction',
        'Understanding Image Upsizing',
        'Step-by-Step Guide',
        'Tools Comparison',
        'Best Practices',
        'Common Mistakes',
        'FAQ',
        'Related Guides',
      ],
      faqCount: 8,
      internalLinks: 6,
    },
  },
  {
    primaryKeyword: 'how to upscale images',
    secondaryKeywords: ['upscale an image', 'upscale image guide', 'image upscaling tutorial'],
    canonicalUrl: '/guides/how-to-upscale-images',
    intent: 'Informational',
    tier: 3,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Introduction',
        'Understanding Upscaling',
        'Step-by-Step Guide',
        'Tools Overview',
        'Best Practices',
        'FAQ',
      ],
      faqCount: 6,
      internalLinks: 5,
    },
  },

  // Interactive Tool Pages (Tier 1 - High Volume)
  {
    primaryKeyword: 'image resizer',
    secondaryKeywords: [
      'resize image online',
      'online image resizer',
      'resize image',
      'image resize tool',
      'resize photo online',
      'picture resizer',
    ],
    canonicalUrl: '/tools/resize/image-resizer',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: ['Hero + Tool', 'How It Works', 'Key Features', 'Use Cases', 'Benefits', 'FAQ'],
      faqCount: 8,
      internalLinks: 4,
    },
  },
  {
    primaryKeyword: 'image compressor',
    secondaryKeywords: [
      'compress image online',
      'online image compressor',
      'compress image',
      'image compression tool',
      'reduce image size',
      'photo compressor',
    ],
    canonicalUrl: '/tools/compress/image-compressor',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: ['Hero + Tool', 'How It Works', 'Key Features', 'Use Cases', 'Benefits', 'FAQ'],
      faqCount: 6,
      internalLinks: 4,
    },
  },
  {
    primaryKeyword: 'png to jpg',
    secondaryKeywords: [
      'convert png to jpg',
      'png to jpeg',
      'png to jpg converter',
      'png to jpg online',
      'convert png to jpeg',
    ],
    canonicalUrl: '/tools/convert/png-to-jpg',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: ['Hero + Tool', 'How It Works', 'Key Features', 'Use Cases', 'Benefits', 'FAQ'],
      faqCount: 5,
      internalLinks: 4,
    },
  },

  // Additional Tier 2 Tool Pages
  {
    primaryKeyword: 'ai image enlarger',
    secondaryKeywords: ['image enlarger ai', 'ai enlarge image', 'enlarge image ai'],
    canonicalUrl: '/tools/ai-image-enlarger',
    intent: 'Transactional',
    tier: 2,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Hero + Introduction',
        'What Is AI Image Enlargement',
        'How It Works',
        'Key Features',
        'Use Cases',
        'FAQ',
      ],
      faqCount: 6,
      internalLinks: 4,
    },
  },
  {
    primaryKeyword: 'image enlarger',
    secondaryKeywords: [
      'photo enlarger',
      'picture enlarger',
      'image enlarger online',
      'photo enlarger online',
    ],
    canonicalUrl: '/tools/image-enlarger',
    intent: 'Transactional',
    tier: 2,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Hero + Introduction',
        'What Is Image Enlargement',
        'How It Works',
        'Key Features',
        'Use Cases',
        'FAQ',
      ],
      faqCount: 6,
      internalLinks: 4,
    },
  },

  // Background Removal Pages (Tier 1 - High Volume)
  {
    primaryKeyword: 'ai background remover',
    secondaryKeywords: [
      'background remover',
      'remove background',
      'remove bg',
      'bg remover',
      'transparent background',
      'cut out image',
    ],
    canonicalUrl: '/tools/ai-background-remover',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Hero + Introduction',
        'What Is AI Background Removal',
        'How It Works',
        'Key Features',
        'Use Cases',
        'Benefits',
        'FAQ',
      ],
      faqCount: 5,
      internalLinks: 4,
    },
  },
  {
    primaryKeyword: 'free background remover',
    secondaryKeywords: [
      'remove background free',
      'background remover online free',
      'free bg remover',
      'remove bg free',
    ],
    canonicalUrl: '/free/free-background-remover',
    intent: 'Transactional',
    tier: 1,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Hero + Introduction',
        'Why Free Tools Matter',
        'How It Works',
        'Key Features',
        'Privacy Benefits',
        'FAQ',
      ],
      faqCount: 4,
      internalLinks: 4,
    },
  },
  {
    primaryKeyword: 'product photo background removal',
    secondaryKeywords: [
      'remove background product photo',
      'ecommerce background removal',
      'amazon white background',
      'product image background remover',
    ],
    canonicalUrl: '/use-cases/product-photo-background-removal',
    intent: 'Commercial',
    tier: 2,
    priority: 'P0',
    contentRequirements: {
      minWords: 1400,
      sections: [
        'Hero + Introduction',
        'Marketplace Requirements',
        'How It Works',
        'Results',
        'FAQ',
      ],
      faqCount: 4,
      internalLinks: 4,
    },
  },
  {
    primaryKeyword: 'portrait background removal',
    secondaryKeywords: [
      'remove background portrait',
      'headshot background remover',
      'linkedin photo background',
      'profile picture background removal',
    ],
    canonicalUrl: '/use-cases/portrait-background-removal',
    intent: 'Commercial',
    tier: 2,
    priority: 'P1',
    contentRequirements: {
      minWords: 1400,
      sections: ['Hero + Introduction', 'Hair Detail Handling', 'How It Works', 'Results', 'FAQ'],
      faqCount: 4,
      internalLinks: 4,
    },
  },
];

/**
 * Get page mapping by canonical URL
 */
export function getPageMappingByUrl(url: string): IKeywordPageMapping | undefined {
  return keywordPageMappings.find(mapping => mapping.canonicalUrl === url);
}

/**
 * Get page mapping by primary keyword
 */
export function getPageMappingByKeyword(keyword: string): IKeywordPageMapping | undefined {
  return keywordPageMappings.find(
    mapping =>
      mapping.primaryKeyword.toLowerCase() === keyword.toLowerCase() ||
      mapping.secondaryKeywords.some(k => k.toLowerCase() === keyword.toLowerCase())
  );
}

/**
 * Get all pages by category
 */
export function getPagesByCategory(category: string): IKeywordPageMapping[] {
  return keywordPageMappings.filter(mapping => mapping.canonicalUrl.startsWith(`/${category}/`));
}

/**
 * Get all P0 priority pages
 */
export function getP0Pages(): IKeywordPageMapping[] {
  return keywordPageMappings.filter(mapping => mapping.priority === 'P0');
}

/**
 * Get pages by tier
 */
export function getPagesByTier(tier: 1 | 2 | 3 | 4 | 5): IKeywordPageMapping[] {
  return keywordPageMappings.filter(mapping => mapping.tier === tier);
}
