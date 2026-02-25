import { z } from 'zod';
import type { ICreateBlogPostInput } from './blog.schema';

// Outrank.so article shape (from webhook payload)
export const outrankArticleSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  content_markdown: z.string().optional(),
  content_html: z.string().min(1),
  meta_description: z.string().optional(),
  created_at: z.string().optional(),
  image_url: z.string().url().optional().or(z.literal('')).optional(),
  slug: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export type IOutrankArticle = z.infer<typeof outrankArticleSchema>;

// Full webhook payload
export const outrankWebhookPayloadSchema = z.object({
  event_type: z.literal('publish_articles'),
  timestamp: z.string().optional(),
  data: z.object({
    articles: z.array(outrankArticleSchema).min(1),
  }),
});

export type IOutrankWebhookPayload = z.infer<typeof outrankWebhookPayloadSchema>;

/**
 * Sanitize an Outrank slug to match our blog slug constraints:
 * - Lowercase
 * - Only alphanumeric and hyphens
 * - No consecutive hyphens
 * - No leading/trailing hyphens
 * - Min 3 chars, max 100 chars
 */
function sanitizeSlug(rawSlug: string): string {
  return rawSlug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → hyphen
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .substring(0, 100); // enforce max length
}

/**
 * Strip HTML tags from a string (for description generation)
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Map an Outrank article to ICreateBlogPostInput for our blog service.
 *
 * Field mapping:
 * - slug: sanitized from article.slug
 * - title: article.title (max 200 chars)
 * - description: meta_description OR first 150 chars of stripped HTML content
 * - content: content_html (fallback to content_markdown)
 * - author: 'MyImageUpscaler Team'
 * - category: 'blog'
 * - tags: article.tags (max 10)
 * - featured_image_url: article.image_url (if valid non-empty URL)
 * - seo_title: title truncated to 70 chars
 * - seo_description: meta_description truncated to 160 chars
 */
export function mapOutrankArticleToBlogInput(article: IOutrankArticle): ICreateBlogPostInput {
  const slug = sanitizeSlug(article.slug);
  const content = article.content_html || article.content_markdown || '';
  const strippedContent = stripHtml(content);

  // Generate description from meta_description or first 150 chars of content
  let description = article.meta_description?.trim() || strippedContent.substring(0, 150);
  // Ensure description meets min 20 char constraint
  if (description.length < 20) {
    description = strippedContent.substring(0, 200);
  }
  // Clamp to max 500 chars
  description = description.substring(0, 500);

  // seo_description from meta_description (max 160 chars)
  const seo_description = article.meta_description
    ? article.meta_description.substring(0, 160)
    : undefined;

  // seo_title from title (max 70 chars)
  const seo_title = article.title.substring(0, 70);

  // featured_image_url: only include if it's a non-empty valid-looking URL
  const featured_image_url =
    article.image_url && article.image_url.startsWith('http') ? article.image_url : undefined;

  return {
    slug,
    title: article.title.substring(0, 200),
    description,
    content,
    author: 'MyImageUpscaler Team',
    category: 'blog',
    tags: (article.tags ?? []).slice(0, 10),
    featured_image_url,
    seo_title,
    seo_description,
  };
}
