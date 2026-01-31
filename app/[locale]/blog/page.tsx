import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getAllPosts } from '@server/blog';
import { Calendar, Clock, ArrowRight, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { clientEnv } from '@shared/config/env';
import { AmbientBackground } from '@client/components/landing/AmbientBackground';
import { BlogSearch } from '@client/components/blog/BlogSearch';
import { getTranslations, setRequestLocale } from 'next-intl/server';

interface IBlogPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}

export async function generateMetadata({ params }: IBlogPageProps): Promise<Metadata> {
  await params;
  const title = 'Blog - Image Enhancement Tips & Guides';
  const description = `Learn about AI image upscaling, photo enhancement techniques, and tips for e-commerce product photography. Expert guides from ${clientEnv.APP_NAME}.`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | ${clientEnv.APP_NAME}`,
      description,
    },
  };
}

const POSTS_PER_PAGE = 6;

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default async function BlogPage({ params, searchParams }: IBlogPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const searchQueryParams = await searchParams;
  const t = await getTranslations('blog');
  const allPosts = getAllPosts();
  const searchQuery = searchQueryParams.q?.toLowerCase().trim();

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

  const [featuredPost, ...otherPosts] = filteredPosts;

  // Shuffle the other posts (only when not searching)
  const shuffledPosts = searchQuery ? otherPosts : shuffleArray(otherPosts);

  // Calculate pagination
  const currentPage = Number(searchQueryParams.page) || 1;
  const totalPages = Math.ceil(shuffledPosts.length / POSTS_PER_PAGE);
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const endIndex = startIndex + POSTS_PER_PAGE;
  const displayedPosts = shuffledPosts.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen bg-main">
      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <AmbientBackground variant="subtle" />
        <div className="container mx-auto px-4 max-w-5xl text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            {t('page.badge')}
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight">
            {t('page.title')}
            <span className="block bg-gradient-to-r from-accent via-secondary to-tertiary bg-clip-text text-transparent">
              {t('page.titleHighlight')}
            </span>
          </h1>
          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed mb-8">
            {t('page.subtitle')}
          </p>
          <BlogSearch />
        </div>
      </section>

      {/* Featured Post */}
      {featuredPost && (
        <section className="pb-12">
          <div className="container mx-auto px-4 max-w-6xl">
            <Link href={`/blog/${featuredPost.slug}`} className="group block">
              <article className="relative bg-gradient-to-br from-surface via-surface to-surface-light rounded-3xl border border-border overflow-hidden hover:border-accent/50 transition-all duration-500 hover:shadow-card-hover">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative grid md:grid-cols-5 gap-0">
                  {/* Cover Image */}
                  <div className="md:col-span-2 aspect-[4/3] md:aspect-auto min-h-[280px] relative overflow-hidden">
                    {featuredPost.image ? (
                      <Image
                        src={featuredPost.image}
                        alt={featuredPost.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, 40vw"
                        unoptimized
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
                        {featuredPost.category}
                      </span>
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {featuredPost.readingTime}
                      </span>
                    </div>
                    <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-4 group-hover:text-accent transition-colors leading-tight">
                      {featuredPost.title}
                    </h2>
                    <p className="text-text-secondary mb-6 line-clamp-2 text-lg leading-relaxed">
                      {featuredPost.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        {new Date(featuredPost.date).toLocaleDateString('en-US', {
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

      {/* Blog Posts Grid */}
      <section className="pb-24">
        <div className="container mx-auto px-4 max-w-6xl">
          {shuffledPosts.length === 0 && !featuredPost ? (
            <div className="text-center py-20 bg-surface rounded-3xl border border-border">
              <Sparkles className="w-12 h-12 text-accent/50 mx-auto mb-4" />
              <p className="text-text-secondary text-lg">{t('listing.noPosts')}</p>
            </div>
          ) : shuffledPosts.length > 0 ? (
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
                            unoptimized
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
                      href={`/blog?page=${currentPage - 1}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
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
                  <div className="flex items-center gap-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                      <Link
                        key={pageNum}
                        href={`/blog?page=${pageNum}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
                        scroll={false}
                        className={`min-w-[2.5rem] h-10 flex items-center justify-center rounded-lg font-medium transition-all ${
                          currentPage === pageNum
                            ? 'bg-accent text-white shadow-md'
                            : 'bg-surface border border-border hover:border-accent/50 hover:bg-accent/5'
                        }`}
                      >
                        {pageNum}
                      </Link>
                    ))}
                  </div>

                  {/* Next Button */}
                  {currentPage < totalPages ? (
                    <Link
                      href={`/blog?page=${currentPage + 1}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
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
