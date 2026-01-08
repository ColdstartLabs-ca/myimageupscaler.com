import { Metadata } from 'next';
import Features from '@client/components/features/landing/Features';
import { CTASection } from '@client/components/features/landing/CTASection';
import { clientEnv } from '@shared/config/env';

export const metadata: Metadata = {
  title: `Features | ${clientEnv.APP_NAME} - Image Upscaling & Enhancement`,
  description: `Discover powerful features of ${clientEnv.APP_NAME}: Text preservation, batch processing, ethical AI, lightning fast upscaling, and more.`,
};

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-base">
      {/* Hero Section */}
      <section className="py-20 hero-gradient">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
            Powerful Features for
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent-light to-cyan-400">
              Professional Results
            </span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Everything you need to enhance your images with cutting-edge AI technology. From text
            preservation to batch processing, we&apos;ve got you covered.
          </p>
        </div>
      </section>

      {/* Features Section */}
      <Features />

      {/* CTA Section */}
      <CTASection />
    </main>
  );
}
