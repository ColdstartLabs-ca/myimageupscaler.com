-- Create blog_posts table for dynamic blog content management
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,  -- Markdown content
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

  -- Constraints
  CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT published_requires_date CHECK (
    (status = 'published' AND published_at IS NOT NULL) OR status = 'draft'
  )
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON public.blog_posts(published_at DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON public.blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_tags ON public.blog_posts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts(slug);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Service role has full access (for API routes)
CREATE POLICY "Service role full access on blog_posts"
  ON public.blog_posts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Public can read published posts (for frontend)
CREATE POLICY "Public read published blog_posts"
  ON public.blog_posts
  FOR SELECT
  USING (status = 'published');

-- Create updated_at trigger
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

-- Add comment for documentation
COMMENT ON TABLE public.blog_posts IS 'Blog posts with draft/published workflow for AI agent content creation';
COMMENT ON COLUMN public.blog_posts.status IS 'Post status: draft (in progress) or published (live)';
COMMENT ON COLUMN public.blog_posts.published_at IS 'Set when post is first published';
COMMENT ON COLUMN public.blog_posts.reading_time IS 'Human-readable reading time, e.g. "5 min read"';
