import { listBlogPosts } from '@server/services/blog.service';

export type LifecycleIntent =
  | 'face-restore'
  | 'hd-ultra'
  | 'batch'
  | 'ecommerce'
  | 'file-prep'
  | 'print';

export interface IEmailContentRecommendation {
  intent: LifecycleIntent;
  slug: string;
  title: string;
  description: string;
  url: string;
  productCtaUrl: string;
  productCtaLabel: string;
}

interface IIntentRule {
  tags: string[];
  categories: string[];
  fallback: Omit<IEmailContentRecommendation, 'intent'>;
}

const INTENT_RULES: Record<LifecycleIntent, IIntentRule> = {
  'face-restore': {
    tags: ['face-restore', 'photo-restoration', 'portrait', 'old-photo'],
    categories: ['photo restoration', 'guides'],
    fallback: {
      slug: 'restore-old-photos-ai-enhancement-guide',
      title: 'Restore old photos without over-sharpening',
      description: 'A practical guide to cleaner faces, better texture, and natural detail.',
      url: '/blog/restore-old-photos-ai-enhancement-guide',
      productCtaUrl: '/upscale?mode=face',
      productCtaLabel: 'Try Face Restore',
    },
  },
  'hd-ultra': {
    tags: ['hd-upscale', 'ultra', 'print', 'resolution'],
    categories: ['technical guides', 'guides'],
    fallback: {
      slug: 'image-resolution-for-printing-complete-guide',
      title: 'When to use HD vs Ultra for print-quality images',
      description: 'Choose the right upscale level for sharp prints without wasting credits.',
      url: '/blog/image-resolution-for-printing-complete-guide',
      productCtaUrl: '/upscale?mode=hd',
      productCtaLabel: 'Try HD Upscale',
    },
  },
  batch: {
    tags: ['batch', 'workflow', 'productivity'],
    categories: ['guides'],
    fallback: {
      slug: 'how-to-upscale-images-without-losing-quality',
      title: 'Upscale groups of images without starting over',
      description: 'Set up a repeatable workflow for larger image sets.',
      url: '/blog/how-to-upscale-images-without-losing-quality',
      productCtaUrl: '/upscale?mode=batch',
      productCtaLabel: 'Start a Batch',
    },
  },
  ecommerce: {
    tags: ['ecommerce', 'product', 'amazon', 'etsy'],
    categories: ['ecommerce', 'guides'],
    fallback: {
      slug: 'upscale-product-photos-amazon-etsy-guide',
      title: 'Prepare product photos for listings',
      description: 'Improve marketplace photos while keeping edges, labels, and textures clean.',
      url: '/blog/upscale-product-photos-amazon-etsy-guide',
      productCtaUrl: '/upscale?mode=hd',
      productCtaLabel: 'Improve Product Photos',
    },
  },
  'file-prep': {
    tags: ['file-prep', 'source-files', 'low-quality', 'blurry'],
    categories: ['guides'],
    fallback: {
      slug: 'fix-blurry-photos-ai-methods-guide',
      title: 'Best source files for AI upscaling',
      description: 'Small source choices can make a large difference in final quality.',
      url: '/blog/fix-blurry-photos-ai-methods-guide',
      productCtaUrl: '/upscale',
      productCtaLabel: 'Upload a Better Source',
    },
  },
  print: {
    tags: ['print', 'resolution', '4k', '8k'],
    categories: ['technical guides', 'guides'],
    fallback: {
      slug: 'upscale-midjourney-images-4k-8k-print-guide',
      title: 'Prepare AI images for 4K, 8K, and print',
      description: 'Understand when extra resolution helps and when it does not.',
      url: '/blog/upscale-midjourney-images-4k-8k-print-guide',
      productCtaUrl: '/upscale?mode=ultra',
      productCtaLabel: 'Try Ultra Upscale',
    },
  },
};

export class EmailContentRecommendationService {
  async recommendForIntent(intent: LifecycleIntent): Promise<IEmailContentRecommendation> {
    const rule = INTENT_RULES[intent];
    const { posts } = await listBlogPosts({
      status: 'published',
      limit: 50,
      offset: 0,
      sort: 'published_at',
      order: 'desc',
    });

    const match = posts.find(post => {
      const tags = (post.tags || []).map(tag => tag.toLowerCase());
      const category = (post.category || '').toLowerCase();
      return (
        rule.tags.some(tag => tags.includes(tag)) ||
        rule.categories.some(candidate => category.includes(candidate))
      );
    });

    if (!match) {
      return { intent, ...rule.fallback };
    }

    return {
      intent,
      slug: match.slug,
      title: match.title,
      description: match.description,
      url: `/blog/${match.slug}`,
      productCtaUrl: rule.fallback.productCtaUrl,
      productCtaLabel: rule.fallback.productCtaLabel,
    };
  }
}

let serviceInstance: EmailContentRecommendationService | null = null;

export function getEmailContentRecommendationService(): EmailContentRecommendationService {
  if (!serviceInstance) {
    serviceInstance = new EmailContentRecommendationService();
  }
  return serviceInstance;
}
