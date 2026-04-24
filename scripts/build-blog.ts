import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import readingTime from 'reading-time';

// Known valid routes in the app
const VALID_ROUTES = new Set([
  '/',
  '/pricing',
  '/?signup=1',
  '/login',
  '/signup',
  '/blog',
  '/privacy',
  '/terms',
  '/contact',
  '/account',
  '/dashboard',
]);

function getAppRoutes(): Set<string> {
  const routes = new Set(VALID_ROUTES);
  const appDir = path.join(process.cwd(), 'app');

  function scanDir(dir: string, prefix: string = '') {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        const routeSegment = entry.name.startsWith('(') ? '' : `/${entry.name}`;
        const newPrefix = prefix + routeSegment;

        // Check if this directory has a page.tsx
        const pagePath = path.join(dir, entry.name, 'page.tsx');
        if (fs.existsSync(pagePath) && newPrefix) {
          routes.add(newPrefix);
        }

        scanDir(path.join(dir, entry.name), newPrefix);
      }
    }
  }

  scanDir(appDir);
  addSeoDataRoutes(routes);
  return routes;
}

function addSeoDataRoutes(routes: Set<string>): void {
  const seoDataDir = path.join(process.cwd(), 'app', 'seo', 'data');
  if (!fs.existsSync(seoDataDir)) return;

  const files = fs.readdirSync(seoDataDir).filter(file => file.endsWith('.json'));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(seoDataDir, file), 'utf8');
      const data = JSON.parse(raw) as {
        category?: unknown;
        pages?: Array<{ slug?: unknown }>;
      };

      if (typeof data.category !== 'string' || !Array.isArray(data.pages)) continue;

      for (const page of data.pages) {
        if (typeof page.slug === 'string' && page.slug.length > 0) {
          routes.add(`/${data.category}/${page.slug}`);
        }
      }
    } catch {
      // Ignore malformed/non-standard SEO data files; app route scanning still applies.
    }
  }
}

function validateInternalLinks(markdown: string, slug: string, allSlugs: string[]): string[] {
  const errors: string[] = [];
  // Match links but not images (negative lookbehind for !)
  const linkRegex = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
  // Match inline images
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const appRoutes = getAppRoutes();

  // Validate inline images
  let imgMatch;
  while ((imgMatch = imageRegex.exec(markdown)) !== null) {
    const [, alt, url] = imgMatch;

    // Skip external images
    if (!url.startsWith('/')) continue;

    // Check if local image exists
    const publicPath = path.join(process.cwd(), 'public', url);
    if (!fs.existsSync(publicPath)) {
      errors.push(`Broken image: ![${alt}](${url}) → file not found`);
    }
  }

  let match;
  while ((match = linkRegex.exec(markdown)) !== null) {
    const [, linkText, url] = match;

    // Check for localhost/dev URLs that shouldn't be in production
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      errors.push(
        `Dev URL in content: [${linkText}](${url}) → use relative path or production domain`
      );
      continue;
    }

    // Skip external links and anchors (but catch same-domain links)
    let normalizedUrl = url;

    // Convert same-domain URLs to relative
    const domainPatterns = [
      'https://myimageupscaler.com',
      'https://www.myimageupscaler.com',
      'http://myimageupscaler.com',
      'http://www.myimageupscaler.com',
    ];
    for (const domain of domainPatterns) {
      if (url.startsWith(domain)) {
        normalizedUrl = url.replace(domain, '') || '/';
        break;
      }
    }

    // Skip truly external links and anchors
    if (!normalizedUrl.startsWith('/') || normalizedUrl.startsWith('//')) continue;

    // Remove anchor and query params for validation
    const cleanUrl = normalizedUrl.split('#')[0].split('?')[0];

    // Check blog post links
    if (cleanUrl.startsWith('/blog/')) {
      const linkedSlug = cleanUrl.replace('/blog/', '');
      if (linkedSlug && !allSlugs.includes(linkedSlug)) {
        errors.push(`Broken blog link: [${linkText}](${url}) → post "${linkedSlug}" not found`);
      }
      continue;
    }

    // Check app routes
    if (!appRoutes.has(cleanUrl)) {
      // Check if it's a dynamic route or public file
      const publicPath = path.join(process.cwd(), 'public', cleanUrl);
      if (!fs.existsSync(publicPath)) {
        errors.push(`Broken link: [${linkText}](${url}) → route not found`);
      }
    }
  }

  return errors;
}

async function validateImage(image: string | undefined, slug: string): Promise<void> {
  if (!image) {
    console.warn(`⚠️  [${slug}] Missing featured image`);
    return;
  }

  // Local paths must exist
  if (image.startsWith('/')) {
    const localPath = path.join(process.cwd(), 'public', image);
    if (!fs.existsSync(localPath)) {
      throw new Error(
        `❌ [${slug}] Featured image not found: ${image}\n   Use an Unsplash URL instead, e.g.: https://images.unsplash.com/photo-XXX?w=1200&h=630&fit=crop&q=80`
      );
    }
    return;
  }

  // Must be Unsplash or local
  if (!image.startsWith('https://images.unsplash.com/')) {
    console.warn(`⚠️  [${slug}] Non-Unsplash external image: ${image}`);
  }

  // Validate external URLs actually exist (HEAD request for efficiency)
  try {
    const response = await fetch(image, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(
        `❌ [${slug}] Featured image URL returns ${response.status}: ${image}\n   The image may have been removed. Find a new image at https://unsplash.com`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('❌')) {
      throw error;
    }
    console.warn(`⚠️  [${slug}] Could not verify external image (network error): ${image}`);
  }
}

interface IBlogPost {
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

async function buildBlogData() {
  const postsDir = path.join(process.cwd(), 'content/blog');

  // Check if blog directory exists
  if (!fs.existsSync(postsDir)) {
    console.warn('⚠️  No blog directory found at content/blog');
    const outputPath = path.join(process.cwd(), 'content/blog-data.json');
    fs.writeFileSync(outputPath, JSON.stringify({ posts: [] }, null, 2));
    console.log('✅ Created empty content/blog-data.json');
    return;
  }

  const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.mdx'));

  if (files.length === 0) {
    console.warn('⚠️  No .mdx files found in content/blog');
    const outputPath = path.join(process.cwd(), 'content/blog-data.json');
    fs.writeFileSync(outputPath, JSON.stringify({ posts: [] }, null, 2));
    console.log('✅ Created empty content/blog-data.json');
    return;
  }

  // First pass: collect all slugs
  const allSlugs = files.map(f => f.replace(/\.mdx$/, ''));

  // Second pass: build posts with validation
  const linkErrors: string[] = [];

  const postsData = files.map(filename => {
    const slug = filename.replace(/\.mdx$/, '');
    const content = fs.readFileSync(path.join(postsDir, filename), 'utf8');
    const { data, content: markdown } = matter(content);

    // Validate internal links
    const errors = validateInternalLinks(markdown, slug, allSlugs);
    if (errors.length > 0) {
      linkErrors.push(`[${slug}]`, ...errors.map(e => `  ${e}`));
    }

    return {
      slug,
      title: data.title || '',
      description: data.description || '',
      date: data.date || '',
      author: data.author || 'MyImageUpscaler Team',
      category: data.category || 'General',
      tags: data.tags || [],
      image: data.image,
      readingTime: readingTime(markdown).text,
      content: markdown,
    };
  });

  // Validate all featured images in parallel
  await Promise.all(postsData.map(post => validateImage(post.image, post.slug)));

  const posts: IBlogPost[] = postsData.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Report link errors
  if (linkErrors.length > 0) {
    console.warn('\n⚠️  Broken internal links found:');
    linkErrors.forEach(e => console.warn(e));
    console.warn('');
  }

  const outputPath = path.join(process.cwd(), 'content/blog-data.json');
  fs.writeFileSync(outputPath, JSON.stringify({ posts }, null, 2));

  console.log(`✅ Built ${posts.length} blog posts to content/blog-data.json`);
}

buildBlogData().catch(error => {
  console.error('❌ Failed to build blog data:', error);
  process.exit(1);
});
