import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { clientEnv } from '@shared/config/env';
import { getCanonicalUrl, generateHreflangAlternates } from '@lib/seo/hreflang-generator';
import type { Locale } from '@/i18n/config';

interface IContactPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: IContactPageProps): Promise<Metadata> {
  const { locale } = await params;
  const canonicalUrl = getCanonicalUrl('/contact');
  const hreflangAlternates = generateHreflangAlternates('/contact');

  return {
    title: `Contact ${clientEnv.APP_NAME} - Get Support & Help`,
    description: `Contact the ${clientEnv.APP_NAME} team for support, feedback, or inquiries. We're here to help with AI image upscaling and enhancement.`,
    openGraph: {
      title: `Contact ${clientEnv.APP_NAME}`,
      description: `Get support and help with AI image upscaling and enhancement.`,
      type: 'website',
      url: canonicalUrl,
      siteName: clientEnv.APP_NAME,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: `Contact ${clientEnv.APP_NAME}`,
        },
      ],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates,
    },
  };
}

export default async function ContactPage({ params }: IContactPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen bg-base">
      {/* Hero Section */}
      <section className="py-20 hero-gradient">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
            Contact Us
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Have questions or feedback? We'd love to hear from you.
          </p>
        </div>
      </section>

      {/* Contact Options */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Email Support */}
            <div className="bg-surface p-8 rounded-2xl border border-border">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Email Support</h2>
              <p className="text-muted-foreground mb-4">
                Send us an email and we'll get back to you within 24 hours.
              </p>
              <a
                href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
                className="text-accent hover:underline font-semibold"
              >
                {clientEnv.SUPPORT_EMAIL}
              </a>
            </div>

            {/* Help Center */}
            <div className="bg-surface p-8 rounded-2xl border border-border">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Help Center</h2>
              <p className="text-muted-foreground mb-4">
                Browse our documentation for answers to common questions.
              </p>
              <a href="/help" className="text-accent hover:underline font-semibold">
                Visit Help Center →
              </a>
            </div>
          </div>

          {/* Social Media */}
          <div className="mt-8 bg-surface p-8 rounded-2xl border border-border">
            <h2 className="text-2xl font-bold text-foreground mb-4">Follow Us</h2>
            <p className="text-muted-foreground mb-6">
              Stay updated with the latest features and tips by following us on social media.
            </p>
            <div className="flex gap-4">
              <a
                href={`https://twitter.com/${clientEnv.TWITTER_HANDLE}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-accent text-white font-semibold rounded-xl hover:bg-accent/90 transition-colors"
              >
                Twitter
              </a>
              <a
                href={`https://linkedin.com/company/${clientEnv.TWITTER_HANDLE.toLowerCase()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-surface border border-border text-foreground font-semibold rounded-xl hover:bg-accent/10 transition-colors"
              >
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-surface">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-8">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <div className="border-b border-border pb-6">
              <h3 className="text-xl font-semibold text-foreground mb-2">
                How do I get started with {clientEnv.APP_NAME}?
              </h3>
              <p className="text-muted-foreground">
                Simply sign up for a free account to get started. You'll receive free credits to try our
                AI image upscaling and enhancement tools. No credit card required.
              </p>
            </div>
            <div className="border-b border-border pb-6">
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Is my data secure when using {clientEnv.APP_NAME}?
              </h3>
              <p className="text-muted-foreground">
                Yes! All image processing happens in your browser using our privacy-first approach. Your
                images are never uploaded to our servers unless you choose to save them.
              </p>
            </div>
            <div className="border-b border-border pb-6">
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Do you offer refunds?
              </h3>
              <p className="text-muted-foreground">
                We offer a satisfaction guarantee. If you're not happy with our service, please contact our
                support team and we'll work with you to make it right.
              </p>
            </div>
            <div className="border-b border-border pb-6">
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Can I use {clientEnv.APP_NAME} for commercial purposes?
              </h3>
              <p className="text-muted-foreground">
                Yes! You can use our service for both personal and commercial projects. Check our pricing
                page for plans that best fit your needs.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
