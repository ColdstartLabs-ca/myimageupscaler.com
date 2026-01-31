/**
 * Migration script to migrate existing blog posts from blog-data.json to Supabase
 *
 * Usage:
 *   yarn tsx scripts/migrate-blog-to-supabase.ts
 *
 * Options:
 *   DRY_RUN=true - Skip actual database writes (for testing)
 *   FORCE=true   - Re-migrate posts even if they already exist
 */

import { supabaseAdmin } from '../server/supabase/supabaseAdmin';
import blogData from '../content/blog-data.json';

interface IBlogDataPost {
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
  seoTitle?: string;
  seoDescription?: string;
}

const DRY_RUN = process.env.DRY_RUN === 'true';
const FORCE = process.env.FORCE === 'true';

/**
 * Migrate a single post to Supabase
 */
async function migratePost(post: IBlogDataPost): Promise<{ success: boolean; message: string }> {
  try {
    // Check if post already exists
    const { data: existing } = await supabaseAdmin
      .from('blog_posts')
      .select('id, slug')
      .eq('slug', post.slug)
      .single();

    if (existing && !FORCE) {
      return {
        success: true,
        message: `Skipped: "${post.slug}" already exists (use FORCE=true to override)`,
      };
    }

    if (existing && FORCE) {
      console.log(`  Force updating existing post: ${post.slug}`);
    }

    if (DRY_RUN) {
      return {
        success: true,
        message: `DRY RUN: Would migrate "${post.slug}"`,
      };
    }

    // Insert or update the post
    const { error } = await supabaseAdmin.from('blog_posts').upsert(
      {
        slug: post.slug,
        title: post.title,
        description: post.description,
        content: post.content,
        author: post.author || 'MyImageUpscaler Team',
        category: post.category,
        tags: post.tags || [],
        featured_image_url: post.image,
        featured_image_alt: post.title, // Use title as default alt text
        reading_time: post.readingTime,
        seo_title: post.seoTitle,
        seo_description: post.seoDescription,
        status: 'published', // All existing posts are published
        published_at: post.date || new Date().toISOString(),
        created_by: 'migration-script',
      },
      {
        onConflict: 'slug',
      }
    );

    if (error) {
      return {
        success: false,
        message: `Failed: "${post.slug}" - ${error.message}`,
      };
    }

    return {
      success: true,
      message: `Migrated: "${post.slug}"`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: "${post.slug}" - ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Main migration function
 */
async function migrate(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Blog Migration: blog-data.json → Supabase');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will write to database)'}`);
  console.log(`Posts to migrate: ${blogData.posts.length}`);
  console.log(`Force override: ${FORCE ? 'YES' : 'NO'}`);
  console.log('='.repeat(60));
  console.log();

  if (!DRY_RUN) {
    console.log('⚠️  WARNING: This will write to your Supabase database!');
    console.log('    Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    console.log();

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  const results: string[] = [];

  for (const post of blogData.posts) {
    const result = await migratePost(post as IBlogDataPost);
    results.push(result.message);

    if (result.message.startsWith('Migrated:')) {
      successCount++;
    } else if (result.message.startsWith('Skipped:')) {
      skipCount++;
    } else if (result.message.startsWith('DRY RUN:')) {
      successCount++;
    } else {
      errorCount++;
    }

    console.log(`  ${result.message}`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total posts: ${blogData.posts.length}`);
  console.log(`Migrated: ${successCount}`);
  console.log(`Skipped: ${skipCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log('='.repeat(60));

  if (errorCount > 0) {
    console.log();
    console.log('Errors encountered:');
    results
      .filter(r => r.startsWith('Failed:') || r.startsWith('Error:'))
      .forEach(r => console.log(`  ${r}`));
  }
}

// Run migration
migrate().catch(console.error);
