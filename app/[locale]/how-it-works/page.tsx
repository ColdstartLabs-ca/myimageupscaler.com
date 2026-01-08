import { Metadata } from 'next';
import HowItWorks from '@client/components/features/landing/HowItWorks';
import { CTASection } from '@client/components/features/landing/CTASection';
import { clientEnv } from '@shared/config/env';

export const metadata: Metadata = {
  title: `How it Works | ${clientEnv.APP_NAME} - Image Upscaling & Enhancement`,
  description: `Learn how ${clientEnv.APP_NAME} transforms your images in three simple steps: Upload, Process, and Download. Get professional results in seconds.`,
};

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-base">
      {/* Hero Section */}
      <section className="py-20 hero-gradient">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
            How it
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent-light to-cyan-400">
              {' '}
              Works
            </span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Transform your workflow in three simple steps. No complex settings, just professional
            results every time.
          </p>
        </div>
      </section>

      {/* How It Works Section */}
      <HowItWorks />

      {/* CTA Section */}
      <CTASection />
    </main>
  );
}
