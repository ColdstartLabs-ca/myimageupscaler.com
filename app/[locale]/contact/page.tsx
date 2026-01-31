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
    title: 'Contact ' + clientEnv.APP_NAME + ' - Get Support & Feedback',
    description: 'Get in touch with the ' + clientEnv.APP_NAME + ' team for support, feedback, or questions about our AI image upscaling and enhancement tools.',
    openGraph: {
      title: 'Contact ' + clientEnv.APP_NAME,
      description: 'Get support, share feedback, or ask questions about our AI-powered image enhancement tools.',
      type: 'website',
      url: canonicalUrl,
      siteName: clientEnv.APP_NAME,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Contact ' + clientEnv.APP_NAME,
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
      <section className="py-20 hero-gradient">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
            Contact {clientEnv.APP_NAME}
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Have questions, feedback, or need support? We'd love to hear from you.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="text-3xl font-bold text-foreground mb-12 text-center">Get in Touch</h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-surface rounded-2xl p-8 border border-border">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Email Support</h3>
              <p className="text-muted-foreground mb-6">
                For general inquiries, support, or feedback, reach out to us via email.
              </p>
              <a
                href={'mailto:' + clientEnv.SUPPORT_EMAIL}
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white font-semibold rounded-xl hover:bg-accent/90 transition-all duration-300"
              >
                {clientEnv.SUPPORT_EMAIL}
              </a>
            </div>

            <div className="bg-surface rounded-2xl p-8 border border-border">
              <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Help Center</h3>
              <p className="text-muted-foreground mb-6">
                Browse our documentation and FAQs for quick answers to common questions.
              </p>
              <a
                href="/help"
                className="inline-flex items-center gap-2 px-6 py-3 bg-secondary text-white font-semibold rounded-xl hover:bg-secondary/90 transition-all duration-300"
              >
                Visit Help Center
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-surface">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">What to Expect</h2>
          <p className="text-muted-foreground mb-8">
            We strive to respond to all inquiries within 24-48 hours during business days.
          </p>
          <div className="grid md:grid-cols-3 gap-6 text-left">
            <div>
              <h4 className="font-semibold text-foreground mb-2">General Inquiries</h4>
              <p className="text-sm text-muted-foreground">Response within 24-48 hours</p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">Technical Support</h4>
              <p className="text-sm text-muted-foreground">Response within 24-48 hours</p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">Business Inquiries</h4>
              <p className="text-sm text-muted-foreground">Response within 48-72 hours</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-6">Follow Us</h2>
          <p className="text-muted-foreground mb-8">
            Stay updated with the latest features, tips, and news.
          </p>
          <div className="flex justify-center gap-4">
            <a
              href={'https://twitter.com/' + clientEnv.TWITTER_HANDLE}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-surface border border-border rounded-xl hover:border-accent/50 hover:bg-accent/5 transition-all"
            >
              Twitter
            </a>
            <a
              href={'https://linkedin.com/company/' + clientEnv.TWITTER_HANDLE.toLowerCase()}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-surface border border-border rounded-xl hover:border-accent/50 hover:bg-accent/5 transition-all"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
