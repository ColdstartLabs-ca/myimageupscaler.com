import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
// import { MDXRemote } from 'next-mdx-remote/rsc'; // Temporarily disabled for OpenNext
import { getPostBySlug, getAllPosts } from '@server/blog';
import { mdxComponents } from '@client/components/blog/MDXComponents';
import { Calendar, Clock, ArrowLeft, Tag, User } from 'lucide-react';
import { clientEnv } from '@shared/config/env';

interface IPageProps {
  params: Promise<{ slug: string }>;
}

// Temporarily disable static generation for OpenNext compatibility
// export async function generateStaticParams() {
//   const posts = getAllPosts();
//   return posts.map(post => ({ slug: post.slug }));
// }

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: post.title,
    description: post.description,
    authors: [{ name: post.author }],
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      images: post.image
        ? [{ url: post.image, width: 1200, height: 630, alt: post.title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: post.image ? [post.image] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: IPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const allPosts = getAllPosts();
  const relatedPosts = allPosts
    .filter(p => p.slug !== slug && p.category === post.category)
    .slice(0, 3);

  // Article JSON-LD
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    author: {
      '@type': 'Person',
      name: post.author,
    },
    datePublished: post.date,
    dateModified: post.date,
    publisher: {
      '@type': 'Organization',
      name: 'PixelPerfect AI',
      logo: {
        '@type': 'ImageObject',
        url: `${clientEnv.BASE_URL}/og-image.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${clientEnv.BASE_URL}/blog/${slug}`,
    },
    image: post.image || `${clientEnv.BASE_URL}/og-image.png`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <article className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        {/* Header */}
        <header className="py-12 md:py-20">
          <div className="container mx-auto px-4 max-w-4xl">
            {/* Back Link */}
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Blog
            </Link>

            {/* Category */}
            <div className="mb-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-700">
                {post.category}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 mb-6 leading-tight">
              {post.title}
            </h1>

            {/* Description */}
            <p className="text-xl text-slate-600 mb-8">{post.description}</p>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-6 text-slate-500 pb-8 border-b border-slate-200">
              <span className="flex items-center gap-2">
                <User className="w-5 h-5" />
                {post.author}
              </span>
              <span className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {new Date(post.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                {post.readingTime}
              </span>
            </div>

            {/* Tags */}
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-6">
                {post.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-600"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="pb-16">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="prose prose-lg prose-slate max-w-none">
              <div className="prose prose-lg max-w-none">
                {/* Temporarily showing raw content - MDX disabled for OpenNext compatibility */}
                <pre className="whitespace-pre-wrap bg-gray-100 p-4 rounded-lg text-sm">
                  {post.content}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="py-16 bg-slate-50 border-t border-slate-200">
            <div className="container mx-auto px-4 max-w-6xl">
              <h2 className="text-2xl font-bold text-slate-900 mb-8">Related Articles</h2>
              <div className="grid md:grid-cols-3 gap-6">
                {relatedPosts.map(related => (
                  <Link
                    key={related.slug}
                    href={`/blog/${related.slug}`}
                    className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
                  >
                    <span className="text-xs font-medium text-indigo-600 mb-2 block">
                      {related.category}
                    </span>
                    <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2">
                      {related.title}
                    </h3>
                    <p className="text-sm text-slate-500">{related.readingTime}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="py-16 bg-gradient-to-r from-indigo-600 to-purple-600">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Try AI Image Enhancement?
            </h2>
            <p className="text-indigo-100 mb-8 text-lg">
              Upload your image and see the results in seconds. No signup required.
            </p>
            <Link
              href="/upscaler"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-600 font-semibold rounded-xl hover:bg-indigo-50 transition-colors"
            >
              Try PixelPerfect Free
            </Link>
          </div>
        </section>
      </article>
    </>
  );
}
