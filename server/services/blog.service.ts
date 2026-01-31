import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { supabaseAdmin } from '../supabase/supabaseAdmin';
import type {
  IBlogPost,
  IBlogPostMeta,
  ICreateBlogPostInput,
  IUpdateBlogPostInput,
  IListBlogPostsQuery,
} from '@shared/validation/blog.schema';

const CONTENT_DIR = path.join(process.cwd(), 'content/blog');

// =============================================================================
// MDX FILE READING FUNCTIONS
// =============================================================================

/**
 * Read all blog posts from MDX files in content/blog directory
 */
async function getPostsFromMDX(): Promise<IBlogPostMeta[]> {
  try {
    const files = await glob('**/*.mdx', { cwd: CONTENT_DIR });

    const posts: IBlogPostMeta[] = [];

    for (const file of files) {
      const filePath = path.join(CONTENT_DIR, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const { data } = matter(fileContent);

      const slug = file.replace(/\.mdx$/, '');

      posts.push({
        slug,
        title: data.title || '',
        description: data.description || '',
        date: data.date || data.publishedAt || new Date().toISOString(),
        author: data.author || 'MyImageUpscaler Team',
        category: data.category || 'Guides',
        tags: data.tags || [],
        image: data.image || data.featuredImage,
        readingTime: data.readingTime || '5 min read',
      });
    }

    return posts.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Error reading MDX files:', error);
    return [];
  }
}

/**
 * Read a single blog post from MDX file
 */
async function getPostFromMDX(slug: string): Promise<IBlogPostMeta | null> {
  try {
    const filePath = path.join(CONTENT_DIR, `${slug}.mdx`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    return {
      slug,
      title: data.title || '',
      description: data.description || '',
      date: data.date || data.publishedAt || new Date().toISOString(),
      author: data.author || 'MyImageUpscaler Team',
      category: data.category || 'Guides',
      tags: data.tags || [],
      image: data.image || data.featuredImage,
      readingTime: data.readingTime || '5 min read',
      content,
    } as IBlogPostMeta;
  } catch (error) {
    console.error(`Error reading MDX file for slug ${slug}:`, error);
    return null;
  }
}

/**
 * Get all MDX slugs
 */
async function getMDXSlugs(): Promise<string[]> {
  try {
    const files = await glob('**/*.mdx', { cwd: CONTENT_DIR });
    return files.map(f => f.replace(/\.mdx$/, ''));
  } catch {
    return [];
  }
}

// =============================================================================
// DATABASE FUNCTIONS
// =============================================================================

/**
 * Get blog posts from Supabase database
 */
async function getPostsFromDatabase(): Promise<IBlogPostMeta[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('blog_posts')
      .select('slug, title, description, published_at, created_at, author, category, tags, featured_image_url, reading_time')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205') {
        return [];
      }
      throw error;
    }

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
  } catch (error) {
    console.error('Error fetching posts from database:', error);
    return [];
  }
}

/**
 * Get a single blog post from database by slug
 */
async function getPostFromDatabase(slug: string): Promise<IBlogPost | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116' || error.code === 'PGRST205') {
        return null;
      }
      throw error;
    }

    return data as IBlogPost;
  } catch (error) {
    console.error('Error fetching post from database:', error);
    return null;
  }
}

/**
 * Get all database slugs
 */
async function getDatabaseSlugs(): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('blog_posts')
      .select('slug')
      .eq('status', 'published');

    if (error) {
      if (error.code === 'PGRST205') return [];
      throw error;
    }

    return (data || []).map(p => p.slug);
  } catch {
    return [];
  }
}

// =============================================================================
// CRUD OPERATIONS (for API routes)
// =============================================================================

/**
 * Add frontend-compatible computed properties to a blog post
 */
function addComputedProperties<T extends Record<string, unknown>>(post: T): T & {
  date?: string;
  image?: string;
  readingTime?: string;
} {
  return {
    ...post,
    date: (post.published_at || post.created_at) as string | undefined,
    image: post.featured_image_url as string | undefined,
    readingTime: post.reading_time as string | undefined,
  };
}

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
  let dbQuery = supabaseAdmin
    .from('blog_posts')
    .select('*', { count: 'exact' });

  if (query.status) {
    dbQuery = dbQuery.eq('status', query.status);
  }
  if (query.category) {
    dbQuery = dbQuery.eq('category', query.category);
  }
  if (query.tag) {
    dbQuery = dbQuery.contains('tags', [query.tag]);
  }

  dbQuery = dbQuery.order(query.sort, { ascending: query.order === 'asc' });
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
// PUBLIC-FACING FUNCTIONS (Hybrid: MDX + Database)
// =============================================================================

/**
 * Get all published posts from both MDX files and database
 * MDX posts take precedence over database posts with the same slug
 */
export async function getAllPublishedPosts(): Promise<IBlogPostMeta[]> {
  const [mdxPosts, dbPosts] = await Promise.all([
    getPostsFromMDX(),
    getPostsFromDatabase(),
  ]);

  // Deduplicate by slug (MDX takes precedence)
  const postsMap = new Map<string, IBlogPostMeta>();

  for (const post of mdxPosts) {
    postsMap.set(post.slug, post);
  }

  for (const post of dbPosts) {
    if (!postsMap.has(post.slug)) {
      postsMap.set(post.slug, post);
    }
  }

  // Sort by date (newest first)
  return Array.from(postsMap.values()).sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  });
}

/**
 * Get single published post by slug
 * Checks MDX files first, then database
 */
export async function getPublishedPostBySlug(slug: string): Promise<IBlogPost | null> {
  // Check MDX first
  const mdxPost = await getPostFromMDX(slug);
  if (mdxPost) {
    return mdxPost as IBlogPost;
  }

  // Check database
  return getPostFromDatabase(slug);
}

/**
 * Get all published slugs for static generation
 * Combines slugs from both MDX files and database
 */
export async function getAllPublishedSlugs(): Promise<string[]> {
  const [mdxSlugs, dbSlugs] = await Promise.all([
    getMDXSlugs(),
    getDatabaseSlugs(),
  ]);

  // Combine and deduplicate
  const allSlugs = new Set([...mdxSlugs, ...dbSlugs]);
  return Array.from(allSlugs);
}

/**
 * Get posts by category (from both MDX and database)
 */
export async function getPostsByCategory(category: string): Promise<IBlogPostMeta[]> {
  const allPosts = await getAllPublishedPosts();
  return allPosts.filter(post => post.category === category);
}

/**
 * Get posts by tag (from both MDX and database)
 */
export async function getPostsByTag(tag: string): Promise<IBlogPostMeta[]> {
  const allPosts = await getAllPublishedPosts();
  return allPosts.filter(post => post.tags.includes(tag));
}

/**
 * Get all unique categories
 */
export async function getAllCategories(): Promise<string[]> {
  const allPosts = await getAllPublishedPosts();
  const categories = new Set(allPosts.map(post => post.category));
  return Array.from(categories).sort();
}

/**
 * Get all unique tags
 */
export async function getAllTags(): Promise<string[]> {
  const allPosts = await getAllPublishedPosts();
  const tagSet = new Set<string>();
  allPosts.forEach(post => {
    post.tags.forEach(tag => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
}

/**
 * Get multiple posts by slugs
 */
export async function getPostsBySlugs(slugs: string[]): Promise<IBlogPostMeta[]> {
  const allPosts = await getAllPublishedPosts();
  const slugsSet = new Set(slugs);
  return allPosts.filter(post => slugsSet.has(post.slug));
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
 * Check if a slug exists (in MDX or database)
 */
export async function slugExists(slug: string): Promise<boolean> {
  // Check MDX files
  const mdxSlugs = await getMDXSlugs();
  if (mdxSlugs.includes(slug)) {
    return true;
  }

  // Check database
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
