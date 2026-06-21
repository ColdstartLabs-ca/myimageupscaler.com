import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getAllPublishedPosts } from '@server/services/blog.service';
import {
  Calendar,
  Clock,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Search,
  Wand2,
} from 'lucide-react';
import { clientEnv } from '@shared/config/env';
import { AmbientBackground } from '@client/components/landing/AmbientBackground';
import { BlogSearch } from '@client/components/blog/BlogSearch';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Locale } from '@/i18n/config';
import { getOpenGraphMetadata, getCanonicalUrl } from '@lib/seo/hreflang-generator';
import { buildBlogIndexJsonLd, buildBlogItemListJsonLd } from '@lib/seo/blog-template-signals';
import { BLOG_SPECIALIST_PROFILE } from '@lib/blog/specialist-profile';
import { getBlogIndexFeatured, getBlogStartHere } from '@lib/seo/seo-equity';

interface IBlogPageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}

export async function generateMetadata({ params }: IBlogPageProps): Promise<Metadata> {
  const { locale } = await params;
  const title = 'AI Image Upscaling Blog: Guides, Tests & Photo Enhancement Tips';
  const description = `Practical AI image upscaling guides, tool comparisons, print DPI advice, and photo enhancement workflows from ${clientEnv.APP_NAME}.`;
  const openGraph = getOpenGraphMetadata(
    '/blog',
    `${title} | ${clientEnv.APP_NAME}`,
    description,
    locale
  );
  const canonicalUrl = getCanonicalUrl('/blog', locale);

  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
    },
    openGraph,
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

const POSTS_PER_PAGE = 6;

const FEATURED_POST_PRIORITY = [
  'best-free-ai-image-upscaler-2026-tested-compared',
  'free-ai-upscaler-no-watermark',
  'upscale-image-for-print-300-dpi-guide',
  'best-free-ai-photo-enhancer-online',
  'fix-blurry-photos-ai-methods-guide',
] as const;

const INTENT_PATHS = [
  {
    label: 'Fix blurry photos',
    description: 'Sharpen soft, low-resolution, or compressed images.',
    query: 'blurry photos',
  },
  {
    label: 'Prepare for print',
    description: 'Choose DPI, pixels, and upscale settings for clean prints.',
    query: 'print dpi',
  },
  {
    label: 'Compare AI tools',
    description: 'Find the best upscaler for free, paid, and pro workflows.',
    query: 'best ai upscaler',
  },
  {
    label: 'E-commerce images',
    description: 'Improve product photos for listings and conversion.',
    query: 'e-commerce',
  },
] as const;

const TRUST_SIGNALS = [
  'Guides tied to real image workflows',
  'Free AI upscaling paths included',
  'Print, product, anime, and photo repair coverage',
] as const;

const TOPIC_FILTERS = [
  'AI enhancement',
  'image upscaling',
  'print DPI',
  'photo restoration',
  'e-commerce',
  'anime',
] as const;

const START_HERE_LINKS = [
  {
    label: 'Best AI upscaler picks',
    href: '/blog/best-free-ai-image-upscaler-2026-tested-compared',
    description: 'Compare free and paid options before choosing a workflow.',
  },
  {
    label: 'Image size and DPI',
    href: '/blog/upscale-image-for-print-300-dpi-guide',
    description: 'Match pixels, dimensions, and DPI for web or print output.',
  },
  {
    label: 'Photo repair workflows',
    href: '/blog/fix-blurry-photos-ai-methods-guide',
    description: 'Recover detail in soft, compressed, old, or damaged photos.',
  },
] as const;

function getPaginationItems(
  currentPage: number,
  totalPages: number
): (number | 'ellipsis-start' | 'ellipsis-end')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  if (windowStart > 2) {
    items.push('ellipsis-start');
  }

  for (let page = windowStart; page <= windowEnd; page++) {
    items.push(page);
  }

  if (windowEnd < totalPages - 1) {
    items.push('ellipsis-end');
  }

  items.push(totalPages);
  return items;
}

export default async function BlogPage({ params, searchParams }: IBlogPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const searchQueryParams = await searchParams;
  const t = await getTranslations('blog');
  const allPosts = await getAllPublishedPosts();
  const searchQuery = searchQueryParams.q?.toLowerCase().trim();
  const featuredPostPriority = getBlogIndexFeatured(undefined, 1);
  const startHereLinks = getBlogStartHere(undefined, 3);

  // Filter posts by search query
  const filteredPosts = searchQuery
    ? allPosts.filter(
        post =>
          post.title.toLowerCase().includes(searchQuery) ||
          post.description.toLowerCase().includes(searchQuery) ||
          post.category.toLowerCase().includes(searchQuery) ||
          post.tags.some(tag => tag.toLowerCase().includes(searchQuery))
      )
    : allPosts;

  const featuredPost =
    !searchQuery &&
    [...featuredPostPriority, ...FEATURED_POST_PRIORITY]
      .map(slug => filteredPosts.find(post => post.slug === slug))
      .find((post): post is (typeof filteredPosts)[number] => Boolean(post));
  const effectiveFeaturedPost = featuredPost || filteredPosts[0];
  const otherPosts = filteredPosts.filter(post => post.slug !== effectiveFeaturedPost?.slug);

  // Calculate pagination
  const currentPage = Number(searchQueryParams.page) || 1;
  const totalPages = Math.ceil(otherPosts.length / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const endIndex = startIndex + POSTS_PER_PAGE;
  const displayedPosts = otherPosts.slice(startIndex, endIndex);
  const paginationItems = getPaginationItems(currentPage, totalPages);
  const schemaOrg = { appName: clientEnv.APP_NAME, baseUrl: clientEnv.BASE_URL };
  const blogJsonLd = buildBlogIndexJsonLd(allPosts, schemaOrg);
  const itemListJsonLd = buildBlogItemListJsonLd(allPosts, schemaOrg);

  return (
    <div className="min-h-screen bg-main">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden pb-12 pt-14 md:pb-20 md:pt-24">
        <AmbientBackground variant="subtle" />
        <div className="container relative z-10 mx-auto max-w-6xl px-4">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-center">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
                <Sparkles className="h-4 w-4" />
                AI image upscaling guides, tests, and workflows
              </div>
              <h1 className="mb-5 font-display text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
                Fix image quality problems faster
                <span className="block bg-gradient-to-r from-accent via-secondary to-tertiary bg-clip-text text-transparent">
                  with practical AI guides
                </span>
              </h1>
              <p className="mb-6 max-w-2xl text-lg leading-relaxed text-text-secondary md:text-xl">
                Find the right guide for blurry photos, print resolution, product images, anime art,
                and AI upscaler comparisons, then try the matching workflow in {clientEnv.APP_NAME}.
              </p>
              <div className="mb-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/?signup=1"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg shadow-accent/25 gradient-cta transition-all hover:scale-[1.02] hover:opacity-90 active:scale-[0.98]"
                >
                  <Wand2 className="h-5 w-5" />
                  Upload an Image Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/tools"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface/80 px-6 py-3 text-sm font-semibold text-primary transition-all hover:border-accent/50 hover:bg-accent/10"
                >
                  Browse AI Tools
                </Link>
              </div>
              <div className="grid gap-3 text-sm text-text-secondary sm:grid-cols-3">
                {TRUST_SIGNALS.map(signal => (
                  <div key={signal} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                    <span>{signal}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex max-w-xl items-center gap-3 rounded-xl border border-border bg-surface/70 p-3">
                <Image
                  src={BLOG_SPECIALIST_PROFILE.image}
                  alt={`${BLOG_SPECIALIST_PROFILE.name}, ${BLOG_SPECIALIST_PROFILE.role}`}
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary">
                    Guides reviewed by{' '}
                    <Link
                      href={BLOG_SPECIALIST_PROFILE.url}
                      className="text-accent hover:underline"
                    >
                      {BLOG_SPECIALIST_PROFILE.name}
                    </Link>
                  </p>
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {BLOG_SPECIALIST_PROFILE.role}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface/80 p-5 shadow-card backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-accent">Find your next fix</p>
                  <h2 className="font-display text-2xl font-bold text-primary">
                    Search by problem
                  </h2>
                </div>
                <Search className="h-5 w-5 text-text-secondary" />
              </div>
              <BlogSearch />
              <div className="mt-5 grid gap-3">
                {INTENT_PATHS.map(path => (
                  <Link
                    key={path.label}
                    href={`/blog?q=${encodeURIComponent(path.query)}`}
                    className="group rounded-xl border border-border bg-main/40 p-4 transition-all hover:border-accent/50 hover:bg-accent/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-primary transition-colors group-hover:text-accent">
                        {path.label}
                      </h3>
                      <ArrowRight className="h-4 w-4 flex-shrink-0 text-accent transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                      {path.description}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-text-secondary">Popular topics</span>
            {TOPIC_FILTERS.map(topic => (
              <Link
                key={topic}
                href={`/blog?q=${encodeURIComponent(topic)}`}
                className="rounded-full border border-border bg-surface/70 px-3 py-1.5 text-sm text-text-secondary transition-all hover:border-accent/50 hover:text-accent"
              >
                {topic}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Post */}
      {effectiveFeaturedPost && (
        <section className="pb-12">
          <div className="container mx-auto px-4 max-w-6xl">
            <Link href={`/blog/${effectiveFeaturedPost.slug}`} className="group block">
              <article className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface via-surface to-surface-light transition-all duration-500 hover:border-accent/50 hover:shadow-card-hover">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative grid md:grid-cols-5 gap-0">
                  {/* Cover Image */}
                  <div className="md:col-span-2 aspect-[4/3] md:aspect-auto min-h-[280px] relative overflow-hidden">
                    {effectiveFeaturedPost.image ? (
                      <Image
                        src={effectiveFeaturedPost.image}
                        alt={effectiveFeaturedPost.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, 40vw"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-secondary/10 to-tertiary/20 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-accent" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-surface/20" />
                    <div className="absolute top-4 left-4 z-10">
                      <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-accent text-white shadow-lg">
                        {t('listing.featured')}
                      </span>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="md:col-span-3 p-8 md:p-10 flex flex-col justify-center">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
                        {effectiveFeaturedPost.category}
                      </span>
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {effectiveFeaturedPost.readingTime}
                      </span>
                    </div>
                    <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-4 group-hover:text-accent transition-colors leading-tight">
                      {effectiveFeaturedPost.title}
                    </h2>
                    <p className="text-text-secondary mb-6 line-clamp-2 text-lg leading-relaxed">
                      {effectiveFeaturedPost.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        {new Date(effectiveFeaturedPost.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                      <span className="inline-flex items-center gap-2 text-accent font-semibold group-hover:gap-3 transition-all">
                        {t('listing.readArticle')}
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            </Link>
          </div>
        </section>
      )}

      <section className="pb-12">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="grid gap-4 md:grid-cols-3">
            {(startHereLinks.length > 0 ? startHereLinks : START_HERE_LINKS).map(path => (
              <Link
                key={path.label}
                href={path.href}
                className="group rounded-2xl border border-border bg-surface p-5 transition-all hover:border-accent/50 hover:bg-accent/10"
              >
                <p className="text-sm font-medium text-accent">Start here</p>
                <h2 className="mt-1 font-display text-xl font-bold text-primary transition-colors group-hover:text-accent">
                  {path.label}
                </h2>
                <p className="mt-2 text-sm text-text-secondary">{path.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section className="pb-24">
        <div className="container mx-auto px-4 max-w-6xl">
          {otherPosts.length === 0 && !effectiveFeaturedPost ? (
            <div className="text-center py-20 bg-surface rounded-3xl border border-border">
              <Sparkles className="w-12 h-12 text-accent/50 mx-auto mb-4" />
              <p className="text-text-secondary text-lg">{t('listing.noPosts')}</p>
            </div>
          ) : otherPosts.length > 0 ? (
            <>
              <h2 className="font-display text-2xl font-bold text-white mb-8">
                {t('listing.moreArticles')}
                {totalPages > 1 && (
                  <span className="text-base font-normal text-text-secondary ml-2">
                    {t('listing.pagination', { currentPage, totalPages })}
                  </span>
                )}
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedPosts.map((post, index) => (
                  <Link key={post.slug} href={`/blog/${post.slug}`} className="group">
                    <article
                      className="h-full bg-surface rounded-2xl border border-border overflow-hidden hover:border-accent/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      {/* Cover Image */}
                      <div className="aspect-[16/9] relative overflow-hidden">
                        {post.image ? (
                          <Image
                            src={post.image}
                            alt={post.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-secondary/5 to-surface-light flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-accent opacity-50" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
                      </div>
                      <div className="p-6">
                        {/* Category & Reading Time */}
                        <div className="flex items-center gap-3 mb-3">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent">
                            {post.category}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {post.readingTime}
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="font-display text-lg font-semibold text-white mb-2 group-hover:text-accent transition-colors line-clamp-2 leading-snug">
                          {post.title}
                        </h3>

                        {/* Description */}
                        <p className="text-sm text-text-secondary mb-4 line-clamp-2 leading-relaxed">
                          {post.description}
                        </p>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-4 border-t border-border/50">
                          <span className="text-xs text-text-secondary">
                            {new Date(post.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          <span className="text-sm text-accent font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                            {t('listing.read')}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-12 flex items-center justify-center gap-2">
                  {/* Previous Button */}
                  {currentPage > 1 ? (
                    <Link
                      href={`/${locale}/blog?page=${currentPage - 1}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
                      scroll={false}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg hover:border-accent/50 hover:bg-accent/5 transition-all"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      {t('listing.previous')}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-4 py-2 text-muted-foreground cursor-not-allowed opacity-50">
                      <ChevronLeft className="w-4 h-4" />
                      {t('listing.previous')}
                    </span>
                  )}

                  {/* Page Numbers */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {paginationItems.map(item =>
                      typeof item === 'number' ? (
                        <Link
                          key={item}
                          href={`/${locale}/blog?page=${item}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
                          scroll={false}
                          className={`flex h-10 min-w-[2.5rem] items-center justify-center rounded-lg font-medium transition-all ${
                            currentPage === item
                              ? 'bg-accent text-white shadow-md'
                              : 'bg-surface border border-border hover:border-accent/50 hover:bg-accent/5'
                          }`}
                        >
                          {item}
                        </Link>
                      ) : (
                        <span
                          key={item}
                          className="flex h-10 min-w-[2rem] items-center justify-center text-text-secondary"
                        >
                          ...
                        </span>
                      )
                    )}
                  </div>

                  {/* Next Button */}
                  {currentPage < totalPages ? (
                    <Link
                      href={`/${locale}/blog?page=${currentPage + 1}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
                      scroll={false}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg hover:border-accent/50 hover:bg-accent/5 transition-all"
                    >
                      {t('listing.next')}
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-4 py-2 text-muted-foreground cursor-not-allowed opacity-50">
                      {t('listing.next')}
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent via-secondary to-accent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="container mx-auto px-4 max-w-4xl text-center relative z-10">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">
            {t('cta.title')}
          </h2>
          <p className="text-white/80 mb-8 text-lg max-w-xl mx-auto">
            {t('cta.description', { appName: clientEnv.APP_NAME })}
          </p>
          <Link
            href="/?signup=1"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-accent font-semibold rounded-xl hover:bg-white/90 hover:shadow-lg transition-all duration-300"
          >
            {t('cta.primaryButton')}
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
