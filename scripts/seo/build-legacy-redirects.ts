import fs from 'node:fs';
import path from 'node:path';
import { INTERACTIVE_TOOL_PATHS } from '../../lib/seo/interactive-tool-routes';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'app/seo/data');
const GSC_404_PATH = path.join(ROOT, 'docs/PRDs/gsc-recovery-2026-08/data/gsc-404.csv');
const OUTPUT_PATH = path.join(ROOT, 'lib/seo/legacy-redirects.ts');
const LOCALE_PATTERN = ':locale(en|fr|de|es|it|ja|pt)';
const SUPPORTED_LOCALES = new Set(['en', 'fr', 'de', 'es', 'it', 'ja', 'pt']);
const ENGLISH_ONLY_CATEGORIES = new Set([
  'compare',
  'comparisons-expanded',
  'platforms',
  'bulk-tools',
  'content',
  'photo-restoration',
  'camera-raw',
  'industry-insights',
  'device-optimization',
  'ai-features',
  'technical-guides',
  'personas-expanded',
  'use-cases-expanded',
  'ai-photo-editor',
]);

const BLOG_FALLBACK = '/blog/best-free-ai-image-upscaler-2026-tested-compared';

const FORMER_MIDDLEWARE_REDIRECTS: Record<string, string> = {
  '/tools/bulk-image-resizer': '/tools/resize/bulk-image-resizer',
  '/tools/bulk-image-compressor': '/tools/compress/bulk-image-compressor',
  '/tools/png-to-jpg': '/tools/convert/png-to-jpg',
  '/tools/jpg-to-png': '/tools/convert/jpg-to-png',
  '/tools/webp-to-jpg': '/tools/convert/webp-to-jpg',
  '/tools/webp-to-png': '/tools/convert/webp-to-png',
  '/tools/jpg-to-webp': '/tools/convert/jpg-to-webp',
  '/tools/png-to-webp': '/tools/convert/png-to-webp',
  '/tools/image-compressor': '/tools/compress/image-compressor',
  '/tools/image-resizer': '/tools/resize/image-resizer',
  '/tools/resize-image-for-instagram': '/tools/resize/resize-image-for-instagram',
  '/tools/resize-image-for-youtube': '/tools/resize/resize-image-for-youtube',
  '/tools/resize-image-for-facebook': '/tools/resize/resize-image-for-facebook',
  '/tools/resize-image-for-twitter': '/tools/resize/resize-image-for-twitter',
  '/tools/resize-image-for-linkedin': '/tools/resize/resize-image-for-linkedin',
  '/tools/resize-image-for-discord': '/tools/resize/resize-image-for-discord',
  '/tools/resize-image-for-telegram': '/tools/resize/resize-image-for-telegram',
  '/tools/convert/png-in-jpg': '/tools/convert/png-to-jpg',
  '/tools/Imagem-cutout-tool': '/tools/image-cutout-tool',
  '/tools/free-ai-upscaler': '/free/free-ai-upscaler',
  '/article/upscale-arw-images': '/camera-raw/upscale-arw-images',
  '/article/photography-business-enhancement':
    '/industry-insights/photography-business-enhancement',
  '/article/family-photo-preservation': '/photo-restoration/family-photo-preservation',
  '/article/upscale-product-photos': '/content/upscale-product-photos',
  '/article/vintage-photo-colorization': '/photo-restoration/vintage-photo-colorization',
  '/industry-insights/real-estate-photo-enhancement': '/use-cases/real-estate-photo-enhancement',
  '/blog/photo-enhancement-upscaling-vs-quality':
    '/blog/ai-image-upscaling-vs-sharpening-explained',
  '/blog/best-free-ai-image-upscaler-tools-2026': BLOG_FALLBACK,
  '/blog/free-upscaler-no-sign-up': '/blog/free-ai-upscaler-no-watermark',
  '/blog/upscale-image-online-free': '/blog/free-ai-upscaler-no-watermark',
  '/blog/ai-vs-traditional-image-upscaling': '/blog/ai-image-upscaling-vs-sharpening-explained',
  '/blog/how-ai-image-upscaling-works-explained': '/blog/how-ai-image-upscaling-works-guide',
  '/blog/restore-old-photos-online': '/use-cases/old-photo-restoration',
};

const TOOL_SLUG_ALIASES: Record<string, string> = {
  'webp-in-png': 'webp-to-png',
  'png-in-webp': 'png-to-webp',
  'png-en-jpg': 'png-to-jpg',
  'png-en-webp': 'png-to-webp',
  'jpg-en-webp': 'jpg-to-webp',
  'jpg-in-png': 'jpg-to-png',
  'webp-in-jpg': 'webp-to-jpg',
  'webp-en-jpg': 'webp-to-jpg',
  'webp-en-png': 'webp-to-png',
  'png-para-jpg': 'png-to-jpg',
  'convert-to-webp': 'png-to-webp',
  'ia-background-remover': 'ai-background-remover',
  'imagem-resizer': 'image-resizer',
  'bulk-imagem-resizer': 'bulk-image-resizer',
  'bulk-imagem-compressor': 'bulk-image-compressor',
  'redimensionneur-image': 'image-resizer',
  'redimensionner-image': 'image-resizer',
  'redimensionneur-image-lot': 'bulk-image-resizer',
  'ridimensiona-immagine-in-blocco': 'bulk-image-resizer',
  'ridimensionare-immagine-in-blocco': 'bulk-image-resizer',
  'compresseur-image': 'image-compressor',
  'compresseur-image-lot': 'bulk-image-compressor',
  'compressore-immagini': 'image-compressor',
  'compressore-immagini-in-blocco': 'bulk-image-compressor',
  'compressor-de-imagem': 'image-compressor',
};

function parseCsvUrls(csv: string): string[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.split(',')[0]?.trim())
    .filter((url): url is string => Boolean(url));
}

function routeCategory(fileName: string, data: { category?: string }): string | null {
  if (fileName === 'personas-expanded.json') return 'personas-expanded';
  if (fileName === 'comparisons-expanded.json') return 'comparisons-expanded';
  if (fileName === 'use-cases-expanded.json') return 'use-cases-expanded';
  if (fileName === 'comparison.json') return 'compare';
  if (fileName === 'competitor-comparisons.json') return null;
  return data.category ?? null;
}

function loadOwners(): { bySlug: Map<string, string>; paths: Set<string> } {
  const bySlug = new Map<string, string>();
  const paths = new Set<string>();

  for (const fileName of fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8')) as {
      category?: string;
      pages?: Array<{ slug?: string }>;
    };
    const category = routeCategory(fileName, data);
    if (!category || !data.pages) continue;

    for (const page of data.pages) {
      if (!page.slug) continue;
      const pagePath = `/${category}/${page.slug}`;
      paths.add(pagePath);
      if (!bySlug.has(page.slug)) bySlug.set(page.slug, pagePath);
    }
  }

  return { bySlug, paths };
}

function loadBlogSlugs(): Set<string> {
  const slugs = new Set<string>([
    'best-ai-upscaler',
    'best-ai-image-quality-enhancer-free',
    'upscale-image-for-print-300-dpi-guide',
    'best-free-ai-image-upscaler-2026-tested-compared',
    'free-ai-upscaler-no-watermark',
    'ai-image-upscaling-vs-sharpening-explained',
    'best-ai-image-enhancer',
  ]);
  const blogDir = path.join(ROOT, 'content/blog');

  if (fs.existsSync(blogDir)) {
    for (const file of fs.readdirSync(blogDir)) {
      if (file.endsWith('.mdx')) slugs.add(file.slice(0, -4));
    }
  }

  return slugs;
}

function splitLocale(pathname: string): { locale: string | null; path: string } {
  const match = pathname.match(/^\/([^/]+)(\/.*)?$/);
  if (!match || !SUPPORTED_LOCALES.has(match[1])) return { locale: null, path: pathname };
  return { locale: match[1], path: match[2] || '/' };
}

function dedicatedToolDestination(slug: string): string | null {
  return INTERACTIVE_TOOL_PATHS[slug as keyof typeof INTERACTIVE_TOOL_PATHS] ?? null;
}

function translatedToolSlug(slug: string): string {
  const lowerSlug = slug.toLowerCase();
  const directAlias = TOOL_SLUG_ALIASES[lowerSlug];
  if (directAlias) return directAlias;

  const socialMatch = lowerSlug.match(
    /^(?:redimensionner-image-pour|redimensionneur-image-pour|ridimensionare-immagine-per|ridimensiona-immagine-per|redimensionar-imagem-para)-(.+)$/
  );
  if (socialMatch) return `resize-image-for-${socialMatch[1]}`;

  return lowerSlug;
}

function toolsDestination(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'tools') return null;

  if (segments.length === 2) {
    const slug = translatedToolSlug(segments[1]);
    const dedicatedPath = dedicatedToolDestination(slug);
    if (dedicatedPath) return dedicatedPath;
    if (slug === 'free-ai-upscaler') return '/free/free-ai-upscaler';
    if (slug === 'colorize-photo') return '/tools/ai-photo-enhancer';
    if (slug === 'background-remover') return '/tools/ai-background-remover';
    if (slug === 'ai-background-remover') return '/tools/ai-background-remover';
    return null;
  }

  const category = segments[1].toLowerCase();
  const slug = translatedToolSlug(segments.slice(2).join('/'));
  if (!slug || slug.includes('/')) return null;

  if (category === 'converter') return dedicatedToolDestination(slug) ?? `/tools/convert/${slug}`;
  if (category === 'convert') {
    const destination = dedicatedToolDestination(slug);
    return destination?.startsWith('/tools/convert/') ? destination : null;
  }
  if (category === 'resize') {
    const destination = dedicatedToolDestination(slug);
    return destination?.startsWith('/tools/resize/') ? destination : null;
  }
  if (category === 'compress') {
    const destination = dedicatedToolDestination(slug);
    return destination?.startsWith('/tools/compress/') ? destination : null;
  }

  return null;
}

function isKnownCanonicalPath(
  pathname: string,
  owners: ReturnType<typeof loadOwners>,
  blogs: Set<string>
): boolean {
  const normalized = pathname.replace(/\/$/, '') || '/';
  if (normalized.startsWith('/blog/')) return blogs.has(normalized.slice('/blog/'.length));
  if (owners.paths.has(normalized)) return true;

  const category = normalized.split('/').filter(Boolean)[0];
  if (category && normalized === `/${category}`) {
    return [...owners.paths].some(pagePath => pagePath.startsWith(`/${category}/`));
  }

  const dedicatedMatch = normalized.match(/^\/tools\/(resize|convert|compress)\/([^/]+)$/);
  if (dedicatedMatch && dedicatedToolDestination(dedicatedMatch[2])) return true;

  const genericToolMatch = normalized.match(/^\/tools\/([^/]+)$/);
  return Boolean(genericToolMatch && owners.paths.has(`/tools/${genericToolMatch[1]}`));
}

function destinationForUnlocalizedPath(
  pathname: string,
  owners: ReturnType<typeof loadOwners>,
  blogs: Set<string>
): string | null {
  const normalized = pathname.replace(/\/$/, '') || '/';
  const formerRedirect = FORMER_MIDDLEWARE_REDIRECTS[normalized];
  if (formerRedirect) return formerRedirect;

  const toolDestination = toolsDestination(normalized);
  if (toolDestination) return toolDestination;

  if (normalized === '/&' || normalized === '/$' || normalized === '/5') return '/';
  if (normalized === '/search' || normalized === '/signup' || normalized === '/auth/signup')
    return '/';
  if (normalized === '/auth/register' || normalized === '/upscaler') {
    return normalized === '/upscaler' ? '/tools/ai-image-upscaler' : '/';
  }
  const undefinedPath = normalized.match(/^\/undefined\/([^/]+)$/);
  if (undefinedPath && owners.paths.has(`/platforms/${undefinedPath[1]}`)) {
    return `/platforms/${undefinedPath[1]}`;
  }
  if (normalized === '/article') return '/blog';
  if (normalized === '/personas') return '/use-cases';
  if (normalized === '/comparisons' || normalized === '/technical-guides') {
    return normalized === '/comparisons' ? '/compare' : '/guides';
  }

  const articleMatch = normalized.match(/^\/article\/([^/]+)$/);
  if (articleMatch) return owners.bySlug.get(articleMatch[1]) ?? BLOG_FALLBACK;

  const personasMatch = normalized.match(/^\/personas\/([^/]+)$/);
  if (personasMatch) {
    const owner = owners.bySlug.get(personasMatch[1]);
    return owner?.startsWith('/personas-expanded/') ? owner : '/use-cases';
  }

  const comparisonsMatch = normalized.match(/^\/comparisons\/([^/]+)$/);
  if (comparisonsMatch) {
    const owner = owners.bySlug.get(comparisonsMatch[1]);
    return owner?.startsWith('/comparisons-expanded/') ? owner : '/compare';
  }

  const comparisonMatch = normalized.match(/^\/comparison\/([^/]+)$/);
  if (comparisonMatch) return `/compare/${comparisonMatch[1]}`;

  const compareMatch = normalized.match(/^\/compare\/([^/]+)$/);
  if (compareMatch && !isKnownCanonicalPath(normalized, owners, blogs)) {
    return '/compare/best-ai-upscalers';
  }

  if (normalized === '/use-cases/anime-illustration-upscaling') {
    return '/use-cases/anime-image-upscaler';
  }

  if (normalized.startsWith('/blog/')) {
    return blogs.has(normalized.slice('/blog/'.length)) ? null : BLOG_FALLBACK;
  }

  if (normalized === '/guides/how-to-upsize-images') return '/guides/how-to-upscale-images';

  const englishOnlyMatch = normalized.match(
    /^\/(compare|comparisons-expanded|personas-expanded|content|photo-restoration|camera-raw|industry-insights|device-optimization|technical-guides)(?:\/|$)/
  );
  if (englishOnlyMatch && isKnownCanonicalPath(normalized, owners, blogs)) return null;

  return null;
}

function isEnglishOnlyPath(pathname: string): boolean {
  const category = pathname.split('/').filter(Boolean)[0];
  return Boolean(category && ENGLISH_ONLY_CATEGORIES.has(category));
}

function shouldPreserveLocale(destination: string): boolean {
  const category = destination.split('/').filter(Boolean)[0];
  return category !== 'blog' && (!category || !ENGLISH_ONLY_CATEGORIES.has(category));
}

function destinationForPath(
  pathname: string,
  owners: ReturnType<typeof loadOwners>,
  blogs: Set<string>
): string | null {
  const { locale, path: pathWithoutLocale } = splitLocale(pathname);
  const destination = destinationForUnlocalizedPath(pathWithoutLocale, owners, blogs);

  if (!locale) return destination;
  if (destination)
    return shouldPreserveLocale(destination) ? `/${locale}${destination}` : destination;

  // Middleware also removes locale prefixes from English-only pages. Emit a static one-hop rule
  // for GSC sources so the generated table remains self-contained.
  if (
    isEnglishOnlyPath(pathWithoutLocale) &&
    isKnownCanonicalPath(pathWithoutLocale, owners, blogs)
  ) {
    return pathWithoutLocale;
  }

  return null;
}

function localeVariant(source: string, destination: string): [string, string] | null {
  if (source.startsWith('/:locale') || source.startsWith('/undefined')) return null;
  if (
    !source.startsWith('/article/') &&
    !source.startsWith('/tools/') &&
    !source.startsWith('/blog/')
  ) {
    return null;
  }

  const localeDestination = shouldPreserveLocale(destination)
    ? `/${LOCALE_PATTERN}${destination}`
    : destination;
  return [`/${LOCALE_PATTERN}${source}`, localeDestination];
}

function render(
  entries: Array<{ source: string; destination: string }>,
  unmapped: string[]
): string {
  const redirectLines = entries
    .sort((a, b) => a.source.localeCompare(b.source))
    .map(
      entry =>
        `  { source: ${JSON.stringify(entry.source)}, destination: ${JSON.stringify(entry.destination)}, permanent: true, statusCode: 301 },`
    )
    .join('\n');
  const unmappedLines = unmapped.map(source => JSON.stringify(source)).join(', ');

  return `/**\n * Generated by scripts/seo/build-legacy-redirects.ts.\n * Do not edit manually; regenerate after changing the GSC export or SEO data owners.\n */\n\nexport interface ILegacyRedirect {\n  source: string;\n  destination: string;\n  permanent: true;\n  statusCode: 301;\n}\n\nexport const UNMAPPED_LEGACY_PATHS = [${unmappedLines}] as const;\n\nexport const LEGACY_REDIRECTS: ILegacyRedirect[] = [\n${redirectLines}\n];\n`;
}

const owners = loadOwners();
const blogs = loadBlogSlugs();
const sources = new Set(
  parseCsvUrls(fs.readFileSync(GSC_404_PATH, 'utf8')).map(url => new URL(url).pathname)
);
for (const source of Object.keys(FORMER_MIDDLEWARE_REDIRECTS)) sources.add(source);

const redirects = new Map<string, string>();
const unmapped = new Set<string>();

function addRedirect(source: string, destination: string): void {
  if (source === destination) return;
  // Next matches redirect sources case-insensitively. A case-only rule therefore
  // matches its own destination forever; middleware already canonicalizes tool casing.
  if (source.toLowerCase() === destination.toLowerCase()) return;
  const existing = redirects.get(source);
  if (existing && existing !== destination) {
    throw new Error(`Conflicting redirect for ${source}: ${existing} vs ${destination}`);
  }
  redirects.set(source, destination);
}

for (const source of sources) {
  const destination = destinationForPath(source, owners, blogs);
  if (!destination) {
    if (!isKnownCanonicalPath(splitLocale(source).path, owners, blogs)) unmapped.add(source);
    continue;
  }
  addRedirect(source, destination);
}

for (const [source, destination] of Object.entries(FORMER_MIDDLEWARE_REDIRECTS)) {
  addRedirect(source, destination);
}

for (const [source, destination] of redirects) {
  const variant = localeVariant(source, destination);
  if (variant) addRedirect(variant[0], variant[1]);
}

const output = render(
  [...redirects].map(([source, destination]) => ({ source, destination })),
  [...unmapped].sort()
);
fs.writeFileSync(OUTPUT_PATH, output);

console.log(`Generated ${redirects.size} legacy redirects at ${path.relative(ROOT, OUTPUT_PATH)}`);
if (unmapped.size > 0) {
  console.log(`UNMAPPED (${unmapped.size}):`);
  for (const source of [...unmapped].sort()) console.log(`- ${source}`);
}
