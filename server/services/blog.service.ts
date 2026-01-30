import { supabaseAdmin } from '../supabase/supabaseAdmin';
import type {
  IBlogPost,
  IBlogPostMeta,
  ICreateBlogPostInput,
  IUpdateBlogPostInput,
  IListBlogPostsQuery,
} from '@shared/validation/blog.schema';

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Add frontend-compatible computed properties to a blog post
 * Converts snake_case database fields to camelCase for frontend
 */
function addComputedProperties<T extends Record<string, unknown>>(post: T): T & {
  date?: string;
  image?: string;
  readingTime?: string;
} {
  return {
    ...post,
    // Alias for published_at or created_at
    date: (post.published_at || post.created_at) as string | undefined,
    // Alias for featured_image_url
    image: post.featured_image_url as string | undefined,
    // Alias for reading_time
    readingTime: post.reading_time as string | undefined,
  };
}

// =============================================================================
// CRUD OPERATIONS (for API routes)
// =============================================================================

/**
 * Create a new blog post
 */
export async function createBlogPost(input: ICreateBlogPostInput): Promise<IBlogPost> {
  const readingTime = calculateReadingTime(input.content);

  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .insert({
      slug: input.slug,
      title: input.title,
      description: input.description,
      content: input.content,
      author: input.author,
      category: input.category,
      tags: input.tags,
      featured_image_url: input.featured_image_url,
      featured_image_alt: input.featured_image_alt,
      seo_title: input.seo_title,
      seo_description: input.seo_description,
      reading_time: readingTime,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation on slug
    if (error.code === '23505') {
      throw new Error('DUPLICATE_SLUG: A post with this slug already exists');
    }
    throw error;
  }

  return data as IBlogPost;
}

/**
 * Update an existing blog post
 */
export async function updateBlogPost(slug: string, input: IUpdateBlogPostInput): Promise<IBlogPost> {
  const updateData: Record<string, unknown> = { ...input };

  // Recalculate reading time if content changed
  if (input.content) {
    updateData.reading_time = calculateReadingTime(input.content);
  }

  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .update(updateData)
    .eq('slug', slug)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('NOT_FOUND: Post not found');
    }
    throw error;
  }

  return data as IBlogPost;
}

/**
 * Get a blog post by slug (any status)
 */
export async function getBlogPostBySlug(slug: string): Promise<IBlogPost | null> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data as IBlogPost;
}

/**
 * List blog posts with filters and pagination
 */
export async function listBlogPosts(query: IListBlogPostsQuery): Promise<{
  posts: IBlogPost[];
  total: number;
  hasMore: boolean;
}> {
  // Build query
  let dbQuery = supabaseAdmin
    .from('blog_posts')
    .select('*', { count: 'exact' });

  // Apply filters
  if (query.status) {
    dbQuery = dbQuery.eq('status', query.status);
  }
  if (query.category) {
    dbQuery = dbQuery.eq('category', query.category);
  }
  if (query.tag) {
    dbQuery = dbQuery.contains('tags', [query.tag]);
  }

  // Apply sorting
  dbQuery = dbQuery.order(query.sort, { ascending: query.order === 'asc' });

  // Apply pagination
  dbQuery = dbQuery.range(query.offset, query.offset + query.limit - 1);

  const { data, error, count } = await dbQuery;

  if (error) throw error;

  return {
    posts: (data || []) as IBlogPost[],
    total: count || 0,
    hasMore: (count || 0) > query.offset + query.limit,
  };
}

/**
 * Delete a blog post by slug
 */
export async function deleteBlogPost(slug: string): Promise<void> {
  const { error } = await supabaseAdmin.from('blog_posts').delete().eq('slug', slug);

  if (error) {
    throw error;
  }
}

/**
 * Publish a draft blog post
 */
export async function publishBlogPost(slug: string): Promise<IBlogPost> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .eq('slug', slug)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('NOT_FOUND: Post not found');
    }
    throw error;
  }

  return data as IBlogPost;
}

/**
 * Unpublish a blog post (revert to draft)
 */
export async function unpublishBlogPost(slug: string): Promise<IBlogPost> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .update({
      status: 'draft',
      published_at: null,
    })
    .eq('slug', slug)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('NOT_FOUND: Post not found');
    }
    throw error;
  }

  return data as IBlogPost;
}

// =============================================================================
// PUBLIC-FACING FUNCTIONS (for frontend)
// =============================================================================

/**
 * Get all published posts for frontend rendering
 * Replaces file-based getAllPosts()
 */
export async function getAllPublishedPosts(): Promise<IBlogPostMeta[]> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('slug, title, description, published_at, created_at, author, category, tags, featured_image_url, reading_time')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(post => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    date: post.published_at || post.created_at,
    author: post.author,
    category: post.category,
    tags: post.tags || [],
    image: post.featured_image_url,
    readingTime: post.reading_time || '5 min read',
  }));
}

/**
 * Get single published post by slug
 * Replaces file-based getPostBySlug()
 */
export async function getPublishedPostBySlug(slug: string): Promise<IBlogPost | null> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error || !data) return null;
  return data as IBlogPost;
}

/**
 * Get all published slugs for static generation
 */
export async function getAllPublishedSlugs(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('slug')
    .eq('status', 'published');

  if (error) throw error;
  return (data || []).map(post => post.slug);
}

/**
 * Get posts by category
 */
export async function getPostsByCategory(category: string): Promise<IBlogPostMeta[]> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('slug, title, description, published_at, created_at, author, category, tags, featured_image_url, reading_time')
    .eq('status', 'published')
    .eq('category', category)
    .order('published_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(post => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    date: post.published_at || post.created_at,
    author: post.author,
    category: post.category,
    tags: post.tags || [],
    image: post.featured_image_url,
    readingTime: post.reading_time || '5 min read',
  }));
}

/**
 * Get posts by tag
 */
export async function getPostsByTag(tag: string): Promise<IBlogPostMeta[]> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('slug, title, description, published_at, created_at, author, category, tags, featured_image_url, reading_time')
    .eq('status', 'published')
    .contains('tags', [tag])
    .order('published_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(post => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    date: post.published_at || post.created_at,
    author: post.author,
    category: post.category,
    tags: post.tags || [],
    image: post.featured_image_url,
    readingTime: post.reading_time || '5 min read',
  }));
}

/**
 * Get all unique categories
 */
export async function getAllCategories(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('category')
    .eq('status', 'published');

  if (error) throw error;

  const categories = new Set((data || []).map(post => post.category));
  return Array.from(categories).sort();
}

/**
 * Get all unique tags
 */
export async function getAllTags(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('tags')
    .eq('status', 'published');

  if (error) throw error;

  const tagSet = new Set<string>();
  (data || []).forEach(post => {
    const tags = post.tags || [];
    tags.forEach((tag: string) => tagSet.add(tag));
  });

  return Array.from(tagSet).sort();
}

/**
 * Get multiple posts by slugs
 */
export async function getPostsBySlugs(slugs: string[]): Promise<IBlogPostMeta[]> {
  if (slugs.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('slug, title, description, published_at, created_at, author, category, tags, featured_image_url, reading_time')
    .eq('status', 'published')
    .in('slug', slugs)
    .order('published_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(post => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    date: post.published_at || post.created_at,
    author: post.author,
    category: post.category,
    tags: post.tags || [],
    image: post.featured_image_url,
    readingTime: post.reading_time || '5 min read',
  }));
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Calculate reading time from markdown content
 */
export function calculateReadingTime(content: string): string {
  const wordsPerMinute = 200;
  const wordCount = content.split(/\s+/).length;
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  return `${minutes} min read`;
}

/**
 * Check if a slug exists
 */
export async function slugExists(slug: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('blog_posts')
    .select('slug')
    .eq('slug', slug)
    .limit(1)
    .single();

  if (error?.code === 'PGRST116') return false;
  if (error) throw error;

  return !!data;
}
