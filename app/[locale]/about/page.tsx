import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { clientEnv } from '@shared/config/env';
import { getCanonicalUrl, generateHreflangAlternates } from '@lib/seo/hreflang-generator';
import type { Locale } from '@/i18n/config';

interface IAboutPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: IAboutPageProps): Promise<Metadata> {
  await params;
  const canonicalUrl = getCanonicalUrl('/about');
  const hreflangAlternates = generateHreflangAlternates('/about');

  return {
    title: `About ${clientEnv.APP_NAME} - AI Image Upscaling & Enhancement`,
    description: `Learn about ${clientEnv.APP_NAME}, the AI-powered image upscaling and enhancement platform. Our mission is to make professional-quality image enhancement accessible to everyone.`,
    openGraph: {
      title: `About ${clientEnv.APP_NAME}`,
      description: `AI-powered image upscaling and enhancement platform. Professional quality, accessible to everyone.`,
      type: 'website',
      url: canonicalUrl,
      siteName: clientEnv.APP_NAME,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: `About ${clientEnv.APP_NAME}`,
        },
      ],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates,
    },
  };
}

export default async function AboutPage({ params }: IAboutPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen bg-base">
      {/* Hero Section */}
      <section className="py-20 hero-gradient">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
            About {clientEnv.APP_NAME}
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Making professional AI-powered image enhancement accessible to everyone
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-6">Our Mission</h2>
          <p className="text-lg text-muted-foreground leading-relaxed mb-6">
            {clientEnv.APP_NAME} was founded with a simple goal: to democratize professional-quality
            image enhancement. We believe that everyone deserves access to powerful AI tools that
            can transform their images without requiring expensive software or technical expertise.
            We&apos;re committed to making professional-quality image enhancement accessible to
            everyone.
          </p>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Our cutting-edge AI technology upscales images, enhances quality, and restores details
            while preserving the natural look of your photos. Whether you&apos;re a photographer,
            e-commerce seller, or just someone who wants to improve their personal photos,
            we&apos;re here to help.
          </p>
        </div>
      </section>

      {/* What We Do Section */}
      <section className="py-16 bg-surface">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-6">What We Do</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-3">AI Image Upscaling</h3>
              <p className="text-muted-foreground">
                Enlarge images up to 4x without losing quality. Our AI intelligently reconstructs
                details for sharp, professional results.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Photo Enhancement</h3>
              <p className="text-muted-foreground">
                Automatically improve image quality by adjusting brightness, contrast, and clarity
                while maintaining a natural look.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Background Removal</h3>
              <p className="text-muted-foreground">
                Remove backgrounds from images instantly. Perfect for product photography,
                portraits, and graphic design.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Batch Processing</h3>
              <p className="text-muted-foreground">
                Process multiple images at once to save time. Ideal for e-commerce sellers and
                photographers with large catalogs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-6">Why Choose Us</h2>
          <ul className="space-y-4">
            <li className="flex items-start">
              <span className="text-accent mr-3">✓</span>
              <div>
                <strong className="text-foreground">Privacy-First:</strong>{' '}
                <span className="text-muted-foreground">
                  All processing happens in your browser. Your images never leave your device unless
                  you choose to save them. We don&apos;t store your images.
                </span>
              </div>
            </li>
            <li className="flex items-start">
              <span className="text-accent mr-3">✓</span>
              <div>
                <strong className="text-foreground">No Installation:</strong>{' '}
                <span className="text-muted-foreground">
                  Works entirely in your web browser. No software to download, no compatibility
                  issues.
                </span>
              </div>
            </li>
            <li className="flex items-start">
              <span className="text-accent mr-3">✓</span>
              <div>
                <strong className="text-foreground">Text Preservation:</strong>{' '}
                <span className="text-muted-foreground">
                  Our AI is specially trained to keep text crisp and readable when upscaling images.
                </span>
              </div>
            </li>
            <li className="flex items-start">
              <span className="text-accent mr-3">✓</span>
              <div>
                <strong className="text-foreground">Free to Try:</strong>{' '}
                <span className="text-muted-foreground">
                  Get started with free credits. No credit card required.
                </span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 bg-surface">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-4">Get in Touch</h2>
          <p className="text-muted-foreground mb-8">
            Have questions or feedback? We&apos;d love to hear from you.
          </p>
          <a
            href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 px-8 py-4 bg-accent text-white font-semibold rounded-xl hover:bg-accent/90 transition-all duration-300"
          >
            Contact Support
          </a>
        </div>
      </section>
    </main>
  );
}
