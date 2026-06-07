import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailContentRecommendationService } from '@server/services/email-content-recommendation.service';
import { listBlogPosts } from '@server/services/blog.service';

vi.mock('@server/services/blog.service', () => ({
  listBlogPosts: vi.fn(),
}));

describe('EmailContentRecommendationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects face restore post for portrait users', async () => {
    vi.mocked(listBlogPosts).mockResolvedValue({
      posts: [
        {
          slug: 'restore-old-photos-ai-enhancement-guide',
          title: 'Restore old photos',
          description: 'Portrait cleanup guide',
          category: 'Guides',
          tags: ['photo-restoration', 'face-restore'],
        } as never,
      ],
      total: 1,
      hasMore: false,
    });

    const result = await new EmailContentRecommendationService().recommendForIntent('face-restore');

    expect(result.slug).toBe('restore-old-photos-ai-enhancement-guide');
    expect(result.productCtaUrl).toBe('/upscale?mode=face');
  });
});
