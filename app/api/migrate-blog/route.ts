import { NextRequest, NextResponse } from 'next/server';
import { clientEnv, serverEnv } from '@shared/config/env';

/**
 * Temporary API route to execute the blog_posts table migration
 * This should be removed after the migration is applied
 */
export async function POST(request: NextRequest) {
  // Security check - only allow in development or with a special header
  const isDev = serverEnv.ENV === 'development';
  const migrateHeader = request.headers.get('x-migration-token');

  if (!isDev && migrateHeader !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get the Supabase URL from clientEnv (it has the URL)
    const supabaseUrl = clientEnv.SUPABASE_URL;
    const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

    // Connection string for Supabase transaction mode pooler
    const connectionString = `postgresql://postgres.${projectRef}:${serverEnv.SUPABASE_SERVICE_ROLE_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

    const { Client } = await import('pg');
    const client = new Client({ connectionString });

    await client.connect();

    const sql = `
-- Create blog_posts table for dynamic blog content management
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'MyImageUpscaler Team',
  category TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  featured_image_url TEXT,
  featured_image_alt TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  reading_time TEXT,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by TEXT,
  CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT published_requires_date CHECK (
    (status = 'published' AND published_at IS NOT NULL) OR status = 'draft'
  )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON public.blog_posts(published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON public.blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_tags ON public.blog_posts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts(slug);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY IF NOT EXISTS "Service role full access on blog_posts"
  ON public.blog_posts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "Public read published blog_posts"
  ON public.blog_posts
  FOR SELECT
  USING (status = 'published');

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_blog_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_blog_posts_updated ON public.blog_posts;
CREATE TRIGGER on_blog_posts_updated
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_blog_posts_updated_at();
`;

    await client.query(sql);
    await client.end();

    return NextResponse.json({
      success: true,
      message: 'Migration applied successfully',
      table: 'blog_posts'
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({
      error: 'Migration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Allow GET to check status
export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to apply the blog_posts migration'
  });
}
