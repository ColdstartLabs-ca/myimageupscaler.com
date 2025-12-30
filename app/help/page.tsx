import type { Metadata } from 'next';
import Link from 'next/link';
import { JSX } from 'react';
import { clientEnv } from '@shared/config/env';

export const metadata: Metadata = {
  title: 'Help & FAQ',
  description: `Find answers to common questions about ${clientEnv.APP_NAME} image upscaling, credits, billing, and technical support.`,
  alternates: {
    canonical: '/help',
  },
};

export default function HelpPage(): JSX.Element {
  return (
    <main className="flex-1">
      <div className="container mx-auto py-16 px-6 max-w-4xl">
        <h1 className="text-4xl font-bold mb-4">Help & FAQ</h1>
        <p className="text-lg text-muted-foreground mb-12">
          Find answers to common questions about using {clientEnv.APP_NAME}
        </p>

        {/* Quick Links */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <a
            href="#getting-started"
            className="block p-6 bg-surface-light hover:bg-surface-light rounded-xl transition-colors"
          >
            <h3 className="text-lg font-semibold mb-2">Getting Started</h3>
            <p className="text-sm text-muted-foreground">Learn how to use the service</p>
          </a>
          <a
            href="#credits-billing"
            className="block p-6 bg-surface-light hover:bg-surface-light rounded-xl transition-colors"
          >
            <h3 className="text-lg font-semibold mb-2">Credits & Billing</h3>
            <p className="text-sm text-muted-foreground">Understand pricing and payments</p>
          </a>
          <a
            href="#technical"
            className="block p-6 bg-surface-light hover:bg-surface-light rounded-xl transition-colors"
          >
            <h3 className="text-lg font-semibold mb-2">Technical Support</h3>
            <p className="text-sm text-muted-foreground">Troubleshoot issues</p>
          </a>
        </div>

        {/* Getting Started */}
        <section id="getting-started" className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Getting Started</h2>

          <div className="space-y-4">
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                How do I start using {clientEnv.APP_NAME}?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">To get started:</p>
                <ol className="list-decimal pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <Link href="/dashboard" className="text-accent hover:underline">
                      Create an account
                    </Link>{' '}
                    using email or Google
                  </li>
                  <li>You&apos;ll receive 10 free credits to try the service</li>
                  <li>
                    Navigate to the{' '}
                    <Link href="/upscaler" className="text-accent hover:underline">
                      Upscaler
                    </Link>
                  </li>
                  <li>Upload an image (JPG, PNG, or WEBP format)</li>
                  <li>Choose your upscale factor (2x or 4x)</li>
                  <li>Click &quot;Enhance Image&quot; and wait for processing</li>
                  <li>Download your enhanced image</li>
                </ol>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                What image formats are supported?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  We currently support the following image formats:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>JPG/JPEG</strong> - Most common format for photos
                  </li>
                  <li>
                    <strong>PNG</strong> - Best for images with transparency or text
                  </li>
                  <li>
                    <strong>WEBP</strong> - Modern format with good compression
                  </li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  Maximum file size for free tier: <strong>5MB</strong>
                </p>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                What is the difference between 2x and 4x upscaling?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  <strong>2x Upscaling:</strong> Doubles the width and height of your image (4x
                  total pixels). Best for moderate quality improvements.
                </p>
                <p className="text-muted-foreground mb-4">
                  <strong>4x Upscaling:</strong> Quadruples the width and height (16x total pixels).
                  Best for significant enlargements or very small source images.
                </p>
                <p className="text-muted-foreground">
                  Example: A 500x500px image becomes 1000x1000px at 2x, or 2000x2000px at 4x.
                </p>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                How long does image processing take?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground">
                  Processing typically takes 30-60 seconds depending on image size and current
                  server load. You&apos;ll see a progress indicator while your image is being
                  enhanced.
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* Credits & Billing */}
        <section id="credits-billing" className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Credits & Billing</h2>

          <div className="space-y-4">
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                What are credits?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  Credits are the currency used for processing images. Each image enhancement
                  consumes 1 credit, regardless of upscale factor.
                </p>
                <p className="text-muted-foreground">
                  New users receive <strong>10 free credits</strong> to try the service.
                </p>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                How do I purchase more credits?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  Visit our{' '}
                  <Link href="/pricing" className="text-accent hover:underline">
                    Pricing page
                  </Link>{' '}
                  to choose from our subscription plans:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>Hobby:</strong> 200 credits/month for $19/month
                  </li>
                  <li>
                    <strong>Professional:</strong> 1000 credits/month for $49/month
                  </li>
                  <li>
                    <strong>Business:</strong> 5000 credits/month for $149/month
                  </li>
                </ul>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                Do credits expire?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground">
                  Subscription credits roll over month-to-month up to 6× your monthly credit
                  allowance, as long as your subscription remains active. For example, the Hobby
                  plan can accumulate up to 1,200 credits (6 × 200).
                </p>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                Can I cancel my subscription?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">Yes! You can cancel anytime through:</p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    Your{' '}
                    <Link href="/dashboard/billing" className="text-accent hover:underline">
                      Billing Dashboard
                    </Link>
                  </li>
                  <li>The Stripe customer portal</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  You&apos;ll continue to have access until the end of your billing period, and any
                  remaining credits will stay in your account.
                </p>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                What payment methods do you accept?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground">
                  We accept all major credit cards (Visa, Mastercard, American Express) and various
                  other payment methods through Stripe, our secure payment processor.
                </p>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                Can I get a refund?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  Due to the nature of digital services, refunds are generally not provided for used
                  credits. However, we may issue refunds at our discretion for:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>Technical failures that result in lost credits</li>
                  <li>Duplicate charges</li>
                  <li>Service unavailability</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  Contact{' '}
                  <a
                    href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
                    className="text-indigo-600 hover:underline"
                  >
                    {clientEnv.SUPPORT_EMAIL}
                  </a>{' '}
                  for assistance.
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* Technical Support */}
        <section id="technical" className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Technical Support</h2>

          <div className="space-y-4">
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                My image failed to process. What should I do?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">If processing fails:</p>
                <ol className="list-decimal pl-6 space-y-2 text-muted-foreground">
                  <li>Your credit should be automatically refunded</li>
                  <li>Check that your image meets our requirements (format, size)</li>
                  <li>Try a different image to rule out file corruption</li>
                  <li>Clear your browser cache and try again</li>
                  <li>
                    If the problem persists, contact{' '}
                    <a
                      href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
                      className="text-accent hover:underline"
                    >
                      {clientEnv.SUPPORT_EMAIL}
                    </a>
                  </li>
                </ol>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                The quality isn&apos;t what I expected. Why?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  AI enhancement works best with certain types of images:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>Best results:</strong> Photos with clear subjects, product images, real
                    estate photos
                  </li>
                  <li>
                    <strong>Good results:</strong> Graphics with text, logos, illustrations
                  </li>
                  <li>
                    <strong>Variable results:</strong> Very low-resolution images, heavily
                    compressed images, abstract art
                  </li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  The quality of your source image greatly affects the final result. Starting with a
                  higher-quality source will produce better enhancements.
                </p>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                Is my data secure and private?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">Yes! We take privacy seriously:</p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>Images are processed in real-time and not permanently stored</li>
                  <li>We do not use your images to train AI models</li>
                  <li>All data transmission is encrypted with HTTPS</li>
                  <li>We comply with data protection regulations</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  Read our full{' '}
                  <Link href="/privacy" className="text-accent hover:underline">
                    Privacy Policy
                  </Link>{' '}
                  for details.
                </p>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                Can I use enhanced images commercially?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground">
                  Yes! You retain all rights to your images. We do not claim any ownership of your
                  uploaded or enhanced images. However, you must have the legal right to use the
                  original image you upload. We are not responsible for copyright violations related
                  to your source images.
                </p>
              </div>
            </details>

            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                What browsers are supported?
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {clientEnv.APP_NAME} works best on modern browsers:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>Chrome/Edge (latest 2 versions)</li>
                  <li>Firefox (latest 2 versions)</li>
                  <li>Safari (latest 2 versions)</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  JavaScript must be enabled for the service to function.
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* Contact Support */}
        <section className="mt-16 p-8 bg-gradient-to-br from-accent/10 to-secondary/10 rounded-xl border border-accent/20">
          <h2 className="text-2xl font-bold mb-4">Still need help?</h2>
          <p className="text-muted-foreground mb-6">
            Can&apos;t find the answer you&apos;re looking for? Our support team is here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
              className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Email Support
            </a>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-6 py-3 border border-white/20 text-muted-foreground font-medium rounded-lg hover:bg-surface transition-colors"
            >
              View Pricing
            </Link>
          </div>
        </section>

        {/* Related Links */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-6">
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-accent hover:underline">
            Terms of Service
          </Link>
          <Link href="/blog" className="text-accent hover:underline">
            Blog
          </Link>
        </div>
      </div>
    </main>
  );
}
