import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { getTranslations } from 'next-intl/server';
import {
  getPublishedPostBySlug,
  getAllPublishedPosts,
  getAllPublishedSlugs,
} from '@server/services/blog.service';
import { Lightbulb, Info, AlertTriangle, ChevronRight } from 'lucide-react';
import { clientEnv } from '@shared/config/env';
import { ReadingProgress } from '@client/components/blog/ReadingProgress';
import { BlogGuideSidebar } from '@client/components/blog/BlogGuideSidebar';
import { BlogPostHeroSection } from '@client/components/blog/BlogPostHeroSection';
import { BlogPostTags } from '@client/components/blog/BlogPostTags';
import { BlogSpecialistSection } from '@client/components/blog/BlogSpecialistSection';
import { BlogPostFooter } from '../_components/BlogPostFooter';
import { BlogCTA, parseCTAMarker } from '@client/components/blog/BlogCTA';
import { buildBlogAboutEntities, buildBlogBreadcrumbJsonLd } from '@lib/seo/blog-template-signals';
import { BLOG_SPECIALIST_PROFILE } from '@lib/blog/specialist-profile';
import { getRelatedPostsForSlug } from '@lib/seo/seo-equity';
import { BlogFaqSection } from '@client/components/blog/BlogFaqSection';
import { buildFallbackBlogFaq, buildFaqJsonLd } from '@lib/blog/blog-faq';

// Blog content is public and cacheable; keep database-backed pages off the request path.
export const dynamic = 'force-static';
export const revalidate = 86400;

// Convert MDX Callout components to blockquotes with type markers
function preprocessContent(content: string): string {
  return (
    content
      .replace(
        /<Callout type="(\w+)">\n?([\s\S]*?)\n?<\/Callout>/g,
        (_, type, text) => `> [!${type.toUpperCase()}]\n> ${text.trim().replace(/\n/g, '\n> ')}`
      )
      // <iframe> is not in CommonMark's block-level HTML tag list, so remark-parse
      // treats it as inline HTML and escapes it. Wrapping in <div> (which IS in the
      // block list) ensures remark treats it as a raw HTML block that rehype-raw can render.
      .replace(/(<iframe\b[^>]*>[\s\S]*?<\/iframe>)/gi, '\n\n<div>$1</div>\n\n')
  );
}

/**
 * Extract FAQ Q&A pairs from markdown content.
 * Looks for H3 headings under any H2 section containing "faq", "fragen", "questions", or "häufig".
 * Returns null if no FAQ section is found.
 */
function extractFaqSchema(
  content: string
): { '@context': string; '@type': string; mainEntity: object[] } | null {
  const lines = content.split('\n');
  const faqs: { question: string; answer: string }[] = [];

  let inFaqSection = false;
  let currentQuestion: string | null = null;
  let currentAnswerLines: string[] = [];

  const FAQ_SECTION_RE = /^##\s+.*(faq|fragen|questions|häufig|frequently)/i;
  const H2_RE = /^##\s+/;
  const H3_RE = /^###\s+(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (H2_RE.test(line)) {
      // Flush pending Q&A when entering a new H2 section
      if (inFaqSection && currentQuestion && currentAnswerLines.length > 0) {
        faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(' ').trim() });
        currentQuestion = null;
        currentAnswerLines = [];
      }
      inFaqSection = FAQ_SECTION_RE.test(line);
      continue;
    }

    if (!inFaqSection) continue;

    const h3Match = line.match(H3_RE);
    if (h3Match) {
      // Save previous Q&A
      if (currentQuestion && currentAnswerLines.length > 0) {
        faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(' ').trim() });
      }
      currentQuestion = h3Match[1].trim();
      currentAnswerLines = [];
      continue;
    }

    if (currentQuestion && line.trim()) {
      // Strip markdown links and formatting for clean answer text
      const cleanLine = line
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .trim();
      if (cleanLine) currentAnswerLines.push(cleanLine);
    }
  }

  // Flush last Q&A
  if (inFaqSection && currentQuestion && currentAnswerLines.length > 0) {
    faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(' ').trim() });
  }

  if (faqs.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

interface IPageProps {
  params: Promise<{ slug: string; locale: string }>;
}

function getPostPublishedDate(post: {
  published_at?: string;
  created_at?: string;
  date?: string;
}): string {
  return post.published_at || post.created_at || post.date || '1970-01-01T00:00:00.000Z';
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function extractTextFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractTextFromNode).join('');
  if (typeof node === 'object' && 'props' in node) {
    const props = node.props as { children?: ReactNode };
    return extractTextFromNode(props.children);
  }
  return '';
}

function extractTableOfContents(content: string): { id: string; title: string }[] {
  return content
    .split('\n')
    .map(line => line.match(/^##\s+(.+)/)?.[1]?.trim())
    .filter((heading): heading is string => Boolean(heading))
    .filter(heading => !/^faq$/i.test(heading))
    .slice(0, 8)
    .map(title => ({ title, id: slugifyHeading(title) }));
}

function getQuickVerdict(post: { title: string; description: string; category: string }): string {
  const trimmedDescription = post.description.trim();
  const firstSentence = trimmedDescription.match(/^(.+?[.!?])(?:\s|$)/)?.[1];

  if (firstSentence && firstSentence.length >= 70) {
    return firstSentence;
  }

  return `${trimmedDescription} Use the guide below to choose the right workflow, then test the result with your own image.`;
}

export async function generateStaticParams() {
  const slugs = await getAllPublishedSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  // Blog posts are English-only content, so canonical should always point to English version
  const canonicalUrl = `${clientEnv.BASE_URL}/blog/${slug}`;
  const defaultOgImage = '/og-image.png';

  const postDate = getPostPublishedDate(post);

  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.description,
    authors: [{ name: post.author }],
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      url: canonicalUrl,
      publishedTime: postDate,
      authors: [post.author],
      images: post.image
        ? [{ url: post.image, width: 1200, height: 630, alt: post.title }]
        : [{ url: defaultOgImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.seo_title || post.title,
      description: post.seo_description || post.description,
      images: post.image ? [post.image] : [defaultOgImage],
    },
  };
}

export default async function BlogPostPage({ params }: IPageProps) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  const ctaT = await getTranslations('blog.cta');

  if (!post) {
    notFound();
  }

  const allPosts = await getAllPublishedPosts();
  const snapshotRelatedSlugs = getRelatedPostsForSlug(slug, undefined, 3);
  const snapshotRelated = snapshotRelatedSlugs
    .map(relatedSlug => allPosts.find(p => p.slug === relatedSlug))
    .filter((relatedPost): relatedPost is (typeof allPosts)[number] => Boolean(relatedPost));
  const fallbackRelated = allPosts
    .filter(p => p.slug !== slug && p.category === post.category)
    .slice(0, 3);
  const relatedPosts = snapshotRelated.length > 0 ? snapshotRelated : fallbackRelated;

  const postDate = getPostPublishedDate(post);
  const readingTime = post.readingTime ?? '5 min read';
  const schemaOrg = { appName: clientEnv.APP_NAME, baseUrl: clientEnv.BASE_URL };
  const quickVerdict = getQuickVerdict(post);

  // FAQ JSON-LD (auto-extracted from content if FAQ section exists)
  const extractedFaqJsonLd = extractFaqSchema(post.content);
  const fallbackFaqItems = extractedFaqJsonLd ? [] : buildFallbackBlogFaq(post);
  const faqJsonLd = extractedFaqJsonLd || buildFaqJsonLd(fallbackFaqItems);
  const tableOfContents = [
    ...extractTableOfContents(post.content),
    ...(fallbackFaqItems.length > 0
      ? [{ id: 'frequently-asked-questions', title: 'Frequently Asked Questions' }]
      : []),
  ];

  // Article JSON-LD
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    keywords: post.tags,
    about: buildBlogAboutEntities(post.tags),
    author: {
      '@type': 'Organization',
      name: post.author,
      url: `${clientEnv.BASE_URL}/about`,
    },
    datePublished: postDate,
    dateModified: postDate,
    reviewedBy: {
      '@type': 'Person',
      name: BLOG_SPECIALIST_PROFILE.name,
      jobTitle: BLOG_SPECIALIST_PROFILE.role,
      description: BLOG_SPECIALIST_PROFILE.description,
      image: `${clientEnv.BASE_URL}${BLOG_SPECIALIST_PROFILE.image}`,
      url: `${clientEnv.BASE_URL}${BLOG_SPECIALIST_PROFILE.url}`,
      sameAs: BLOG_SPECIALIST_PROFILE.sameAs,
    },
    publisher: {
      '@type': 'Organization',
      name: clientEnv.APP_NAME,
      logo: `${clientEnv.BASE_URL}/logo/horizontal-logo-full.png`,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${clientEnv.BASE_URL}/blog/${slug}`,
    },
    image: post.image || `${clientEnv.BASE_URL}/og-image.png`,
  };
  const breadcrumbJsonLd = buildBlogBreadcrumbJsonLd(post, schemaOrg);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

      <ReadingProgress />

      <article className="min-h-screen bg-main">
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-accent/5 to-transparent" />

          <div className="container relative mx-auto max-w-6xl px-4 pb-20 pt-4 lg:pt-6">
            <nav
              aria-label="Breadcrumb"
              className="mb-4 flex items-center gap-1.5 text-xs text-text-muted"
            >
              <Link href="/blog" className="transition-colors hover:text-accent">
                Blog
              </Link>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              <Link
                href={`/blog?q=${encodeURIComponent(post.category)}`}
                className="transition-colors hover:text-accent"
              >
                {post.category}
              </Link>
            </nav>

            <BlogPostHeroSection
              title={post.title}
              description={post.description}
              category={post.category}
              readingTime={readingTime}
              publishedDate={new Date(postDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              tryLabel={ctaT('try.button')}
              pricingLabel={ctaT('secondaryButton')}
              image={post.image}
              tableOfContents={tableOfContents}
              specialist={BLOG_SPECIALIST_PROFILE}
              intentNotice={
                slug === 'pixelcut-ai-photo-editor'
                  ? {
                      text: 'Independent comparison — looking for Pixelcut itself?',
                      href: 'https://www.pixelcut.ai/',
                      linkLabel: 'Open the official Pixelcut editor',
                    }
                  : undefined
              }
            />

            <BlogPostTags tags={post.tags} placement="top" />

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
              <div id="article-content" className="min-w-0">
                <div className="prose prose-base prose-invert max-w-none lg:prose-lg prose-headings:scroll-mt-24 prose-headings:font-display prose-headings:tracking-tight prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3 lg:prose-h2:text-2xl lg:prose-h2:mt-12 lg:prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-6 lg:prose-h3:text-xl lg:prose-h3:mt-8 prose-p:leading-relaxed prose-li:leading-relaxed prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-strong:text-primary prose-img:rounded-2xl prose-img:shadow-lg">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      img: ({ src, alt }) => (
                        <span className="block my-8">
                          <Image
                            src={src || ''}
                            alt={alt || ''}
                            width={800}
                            height={450}
                            className="rounded-lg w-full h-auto"
                          />
                        </span>
                      ),
                      a: ({ href, children }) => (
                        <Link
                          href={href || '#'}
                          className="text-accent hover:underline"
                          target={href?.startsWith('http') ? '_blank' : undefined}
                          rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                        >
                          {children}
                        </Link>
                      ),
                      code: ({ children, className }) => {
                        const isInline = !className;
                        return isInline ? (
                          <code className="bg-surface-light px-1.5 py-0.5 rounded text-sm text-accent">
                            {children}
                          </code>
                        ) : (
                          <code className={className}>{children}</code>
                        );
                      },
                      pre: ({ children }) => (
                        <pre className="bg-surface-light p-4 rounded-lg overflow-x-auto border border-border">
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }) => {
                        // Safely extract text from React children for pattern matching
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const extractText = (node: any): string => {
                          if (typeof node === 'string') return node;
                          if (typeof node === 'number') return String(node);
                          if (!node) return '';
                          if (Array.isArray(node)) return node.map(extractText).join('');
                          if (node?.props?.children) return extractText(node.props.children);
                          return '';
                        };
                        const childrenAsString = extractText(children);

                        // Check for CTA markers first
                        const ctaResult = parseCTAMarker(childrenAsString);
                        if (ctaResult) {
                          return <BlogCTA type={ctaResult.type} toolSlug={ctaResult.toolSlug} />;
                        }

                        const tipMatch = childrenAsString.match(/\[!TIP\]\s*/);
                        const infoMatch = childrenAsString.match(/\[!INFO\]\s*/);
                        const warningMatch = childrenAsString.match(/\[!WARNING\]\s*/);

                        if (tipMatch || infoMatch || warningMatch) {
                          const type = tipMatch ? 'tip' : infoMatch ? 'info' : 'warning';
                          const Icon =
                            type === 'tip' ? Lightbulb : type === 'info' ? Info : AlertTriangle;
                          const colors = {
                            tip: 'border-emerald-500/50 bg-emerald-500/10',
                            info: 'border-accent/50 bg-accent/10',
                            warning: 'border-amber-500/50 bg-amber-500/10',
                          };
                          const iconColors = {
                            tip: 'text-emerald-400',
                            info: 'text-accent',
                            warning: 'text-amber-400',
                          };

                          // Strip the marker and render clean text
                          const cleanedContent = childrenAsString.replace(
                            /\[!(TIP|INFO|WARNING)\]\s*/,
                            ''
                          );

                          return (
                            <div
                              className={`not-prose my-6 p-4 rounded-lg border-l-4 ${colors[type]}`}
                            >
                              <div className="flex gap-3">
                                <Icon
                                  className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconColors[type]}`}
                                />
                                <div className="text-muted-foreground">{cleanedContent}</div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <blockquote className="border-l-4 border-accent/50 pl-4 italic text-muted-foreground">
                            {children}
                          </blockquote>
                        );
                      },
                      h1: ({ children }) => (
                        <h2 className="text-3xl font-bold text-white mt-12 mb-4">{children}</h2>
                      ),
                      h2: ({ children }) => {
                        const headingText = extractTextFromNode(children);
                        return (
                          <h2 id={slugifyHeading(headingText)} className="group">
                            {children}
                          </h2>
                        );
                      },
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-6">
                          <table className="min-w-full border-collapse">{children}</table>
                        </div>
                      ),
                      th: ({ children }) => (
                        <th className="border border-border bg-surface-light px-4 py-2 text-left font-semibold text-primary">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="border border-border px-4 py-2 text-muted-foreground">
                          {children}
                        </td>
                      ),
                      iframe: ({ src, ...props }) => (
                        <span className="block my-8 rounded-xl overflow-hidden">
                          <iframe
                            src={src}
                            {...props}
                            loading="lazy"
                            className="w-full"
                            style={{ aspectRatio: '16 / 9' }}
                          />
                        </span>
                      ),
                    }}
                  >
                    {preprocessContent(post.content)}
                  </Markdown>
                </div>
                <BlogFaqSection items={fallbackFaqItems} />
                <BlogSpecialistSection specialist={BLOG_SPECIALIST_PROFILE} />
              </div>

              <aside className="hidden lg:sticky lg:top-20 lg:block">
                <BlogGuideSidebar
                  items={tableOfContents}
                  readingTime={readingTime}
                  ctaLabel={ctaT('try.button')}
                />
              </aside>
            </div>
          </div>
        </div>

        <BlogPostFooter blogSlug={slug} relatedPosts={relatedPosts} quickVerdict={quickVerdict} />
      </article>
    </>
  );
}
