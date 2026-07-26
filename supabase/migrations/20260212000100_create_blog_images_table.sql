-- Create blog_images table for blog image metadata catalog
-- Enables searching and reusing existing blog images instead of generating new ones

CREATE TABLE IF NOT EXISTS public.blog_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  storage_path TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL,
  image_type TEXT NOT NULL CHECK (image_type IN ('featured', 'inline')),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  prompt TEXT,  -- The AI prompt used to generate the image (nullable for non-AI images)
  used_in_posts TEXT[] NOT NULL DEFAULT '{}',  -- Array of blog post slugs using this image
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT valid_width CHECK (width > 0),
  CONSTRAINT valid_height CHECK (height > 0)
);

-- Create GIN index on tags for fast array matching
CREATE INDEX IF NOT EXISTS idx_blog_images_tags ON public.blog_images USING GIN(tags);

-- Create index on image_type for filtering
CREATE INDEX IF NOT EXISTS idx_blog_images_image_type ON public.blog_images(image_type);

-- Create index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_blog_images_created_at ON public.blog_images(created_at DESC);

-- Create index on url for fast lookups
CREATE INDEX IF NOT EXISTS idx_blog_images_url ON public.blog_images(url);

-- Enable RLS
ALTER TABLE public.blog_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Service role has full access (for API routes)
CREATE POLICY "Service role full access on blog_images"
  ON public.blog_images
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Public can read all images (for frontend display and search)
CREATE POLICY "Public read all blog_images"
  ON public.blog_images
  FOR SELECT
  USING (true);

-- Add comments for documentation
COMMENT ON TABLE public.blog_images IS 'Metadata catalog for blog images to enable search and reuse';
COMMENT ON COLUMN public.blog_images.url IS 'Public CDN URL of the image';
COMMENT ON COLUMN public.blog_images.storage_path IS 'Path in Supabase Storage bucket';
COMMENT ON COLUMN public.blog_images.alt_text IS 'Alt text for accessibility and SEO';
COMMENT ON COLUMN public.blog_images.tags IS 'Array of semantic tags for search matching (e.g., before-after, ai-processing)';
COMMENT ON COLUMN public.blog_images.description IS 'Human-readable description of the image content';
COMMENT ON COLUMN public.blog_images.image_type IS 'Either featured (1200x630 for social) or inline (800x600 for content)';
COMMENT ON COLUMN public.blog_images.prompt IS 'The AI prompt used to generate this image (null for uploaded/non-AI images)';
COMMENT ON COLUMN public.blog_images.used_in_posts IS 'Array of blog post slugs that use this image';
