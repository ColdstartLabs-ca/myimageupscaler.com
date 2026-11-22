import blogDataRaw from '@/content/blog-data.json';
import { BLOCKED_BLOG_SLUGS } from '@shared/constants/blocked-blog-slugs';

const blogData = blogDataRaw as { posts: IBlogPost[] };

export interface IBlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  category: string;
  tags: string[];
  image?: string;
  readingTime: string;
  content: string;
}

export interface IBlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  category: string;
  tags: string[];
  image?: string;
  readingTime: string;
}

/**
 * Get all blog posts (sorted by date, newest first)
 * Edge-compatible - no filesystem access
 */
export function getAllPosts(): IBlogPostMeta[] {
  return blogData.posts.map(post => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    date: post.date,
    author: post.author,
    category: post.category,
    tags: post.tags,
    image: post.image,
    readingTime: post.readingTime,
  }));
}

/**
 * Get a single post by slug
 * Edge-compatible - no filesystem access
 */
export function getPostBySlug(slug: string): IBlogPost | null {
  return blogData.posts.find(p => p.slug === slug) || null;
}

/**
 * Get all slugs for static generation
 */
export function getAllSlugs(): string[] {
  return blogData.posts.map(p => p.slug);
}

/**
 * Get posts by category
 */
export function getPostsByCategory(category: string): IBlogPostMeta[] {
  return getAllPosts().filter(post => post.category.toLowerCase() === category.toLowerCase());
}

/**
 * Get posts by tag
 */
export function getPostsByTag(tag: string): IBlogPostMeta[] {
  return getAllPosts().filter(post => post.tags.some(t => t.toLowerCase() === tag.toLowerCase()));
}

/**
 * Get all unique categories
 */
export function getAllCategories(): string[] {
  const categories = new Set(blogData.posts.map(p => p.category));
  return Array.from(categories);
}

/**
 * Get all unique tags
 */
export function getAllTags(): string[] {
  const tags = new Set(blogData.posts.flatMap(p => p.tags));
  return Array.from(tags);
}

/**
 * Get posts by slugs (for related posts sections)
 */
export function getPostsBySlugs(slugs: string[]): IBlogPostMeta[] {
  return slugs
    .map(slug => blogData.posts.find(p => p.slug === slug))
    .filter((post): post is IBlogPost => post !== undefined && !BLOCKED_BLOG_SLUGS.has(post.slug))
    .map(post => ({
      slug: post.slug,
      title: post.title,
      description: post.description,
      date: post.date,
      author: post.author,
      category: post.category,
      tags: post.tags,
      image: post.image,
      readingTime: post.readingTime,
    }));
}
