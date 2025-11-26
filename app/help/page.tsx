import type { Metadata } from 'next';
import Link from 'next/link';
import { JSX } from 'react';

export const metadata: Metadata = {
  title: 'Help & FAQ',
  description:
    'Find answers to common questions about PixelPerfect AI image upscaling, credits, billing, and technical support.',
  alternates: {
    canonical: '/help',
  },
};

// eslint-disable-next-line import/no-default-export
export default function HelpPage(): JSX.Element {
  return (
    <main className="flex-1">
      <div className="container mx-auto py-16 px-6 max-w-4xl">
        <h1 className="text-4xl font-bold mb-4">Help & FAQ</h1>
        <p className="text-lg text-base-content/70 mb-12">
          Find answers to common questions about using PixelPerfect AI
        </p>

        {/* Quick Links */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <a
            href="#getting-started"
            className="card bg-base-200 hover:bg-base-300 transition-colors"
          >
            <div className="card-body">
              <h3 className="card-title text-lg">Getting Started</h3>
              <p className="text-sm text-base-content/70">Learn how to use the service</p>
            </div>
          </a>
          <a
            href="#credits-billing"
            className="card bg-base-200 hover:bg-base-300 transition-colors"
          >
            <div className="card-body">
              <h3 className="card-title text-lg">Credits & Billing</h3>
              <p className="text-sm text-base-content/70">Understand pricing and payments</p>
            </div>
          </a>
          <a href="#technical" className="card bg-base-200 hover:bg-base-300 transition-colors">
            <div className="card-body">
              <h3 className="card-title text-lg">Technical Support</h3>
              <p className="text-sm text-base-content/70">Troubleshoot issues</p>
            </div>
          </a>
        </div>

        {/* Getting Started */}
        <section id="getting-started" className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Getting Started</h2>

          <div className="space-y-4">
            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="getting-started-accordion" defaultChecked />
              <div className="collapse-title text-lg font-medium">
                How do I start using PixelPerfect AI?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">To get started:</p>
                <ol className="list-decimal pl-6 space-y-2 text-base-content/80">
                  <li>
                    <Link href="/dashboard" className="text-primary hover:underline">
                      Create an account
                    </Link>{' '}
                    using email or Google
                  </li>
                  <li>You&apos;ll receive 10 free credits to try the service</li>
                  <li>
                    Navigate to the{' '}
                    <Link href="/upscaler" className="text-primary hover:underline">
                      Upscaler
                    </Link>
                  </li>
                  <li>Upload an image (JPG, PNG, or WEBP format)</li>
                  <li>Choose your upscale factor (2x or 4x)</li>
                  <li>Click &quot;Enhance Image&quot; and wait for processing</li>
                  <li>Download your enhanced image</li>
                </ol>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="getting-started-accordion" />
              <div className="collapse-title text-lg font-medium">
                What image formats are supported?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">
                  We currently support the following image formats:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-base-content/80">
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
                <p className="text-base-content/80 mt-4">
                  Maximum file size for free tier: <strong>5MB</strong>
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="getting-started-accordion" />
              <div className="collapse-title text-lg font-medium">
                What is the difference between 2x and 4x upscaling?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">
                  <strong>2x Upscaling:</strong> Doubles the width and height of your image (4x
                  total pixels). Best for moderate quality improvements.
                </p>
                <p className="text-base-content/80 mb-4">
                  <strong>4x Upscaling:</strong> Quadruples the width and height (16x total pixels).
                  Best for significant enlargements or very small source images.
                </p>
                <p className="text-base-content/80">
                  Example: A 500x500px image becomes 1000x1000px at 2x, or 2000x2000px at 4x.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="getting-started-accordion" />
              <div className="collapse-title text-lg font-medium">
                How long does image processing take?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80">
                  Processing typically takes 30-60 seconds depending on image size and current
                  server load. You&apos;ll see a progress indicator while your image is being
                  enhanced.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Credits & Billing */}
        <section id="credits-billing" className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Credits & Billing</h2>

          <div className="space-y-4">
            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="billing-accordion" />
              <div className="collapse-title text-lg font-medium">What are credits?</div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">
                  Credits are the currency used for processing images. Each image enhancement
                  consumes 1 credit, regardless of upscale factor.
                </p>
                <p className="text-base-content/80">
                  New users receive <strong>10 free credits</strong> to try the service.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="billing-accordion" />
              <div className="collapse-title text-lg font-medium">
                How do I purchase more credits?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">
                  Visit our{' '}
                  <Link href="/pricing" className="text-primary hover:underline">
                    Pricing page
                  </Link>{' '}
                  to choose between:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-base-content/80">
                  <li>
                    <strong>Credit Packs:</strong> One-time purchases (100, 500, or 2500 credits)
                  </li>
                  <li>
                    <strong>Subscriptions:</strong> Monthly plans with recurring credits (50, 250,
                    or 1000 credits/month)
                  </li>
                </ul>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="billing-accordion" />
              <div className="collapse-title text-lg font-medium">Do credits expire?</div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">
                  <strong>Credit Packs:</strong> Valid for 12 months from purchase date.
                </p>
                <p className="text-base-content/80">
                  <strong>Subscription Credits:</strong> Roll over month-to-month up to 6x your
                  monthly amount, as long as your subscription is active.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="billing-accordion" />
              <div className="collapse-title text-lg font-medium">
                Can I cancel my subscription?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">Yes! You can cancel anytime through:</p>
                <ul className="list-disc pl-6 space-y-2 text-base-content/80">
                  <li>
                    Your{' '}
                    <Link href="/dashboard/billing" className="text-primary hover:underline">
                      Billing Dashboard
                    </Link>
                  </li>
                  <li>The Stripe customer portal</li>
                </ul>
                <p className="text-base-content/80 mt-4">
                  You&apos;ll continue to have access until the end of your billing period, and any
                  remaining credits will stay in your account.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="billing-accordion" />
              <div className="collapse-title text-lg font-medium">
                What payment methods do you accept?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80">
                  We accept all major credit cards (Visa, Mastercard, American Express) and various
                  other payment methods through Stripe, our secure payment processor.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="billing-accordion" />
              <div className="collapse-title text-lg font-medium">Can I get a refund?</div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">
                  Due to the nature of digital services, refunds are generally not provided for used
                  credits. However, we may issue refunds at our discretion for:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-base-content/80">
                  <li>Technical failures that result in lost credits</li>
                  <li>Duplicate charges</li>
                  <li>Service unavailability</li>
                </ul>
                <p className="text-base-content/80 mt-4">
                  Contact{' '}
                  <a
                    href="mailto:support@pixelperfect.app"
                    className="text-primary hover:underline"
                  >
                    support@pixelperfect.app
                  </a>{' '}
                  for assistance.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Technical Support */}
        <section id="technical" className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Technical Support</h2>

          <div className="space-y-4">
            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="technical-accordion" />
              <div className="collapse-title text-lg font-medium">
                My image failed to process. What should I do?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">If processing fails:</p>
                <ol className="list-decimal pl-6 space-y-2 text-base-content/80">
                  <li>Your credit should be automatically refunded</li>
                  <li>Check that your image meets our requirements (format, size)</li>
                  <li>Try a different image to rule out file corruption</li>
                  <li>Clear your browser cache and try again</li>
                  <li>
                    If the problem persists, contact{' '}
                    <a
                      href="mailto:support@pixelperfect.app"
                      className="text-primary hover:underline"
                    >
                      support@pixelperfect.app
                    </a>
                  </li>
                </ol>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="technical-accordion" />
              <div className="collapse-title text-lg font-medium">
                The quality isn&apos;t what I expected. Why?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">
                  AI enhancement works best with certain types of images:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-base-content/80">
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
                <p className="text-base-content/80 mt-4">
                  The quality of your source image greatly affects the final result. Starting with a
                  higher-quality source will produce better enhancements.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="technical-accordion" />
              <div className="collapse-title text-lg font-medium">
                Is my data secure and private?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">Yes! We take privacy seriously:</p>
                <ul className="list-disc pl-6 space-y-2 text-base-content/80">
                  <li>Images are processed in real-time and not permanently stored</li>
                  <li>We do not use your images to train AI models</li>
                  <li>All data transmission is encrypted with HTTPS</li>
                  <li>We comply with data protection regulations</li>
                </ul>
                <p className="text-base-content/80 mt-4">
                  Read our full{' '}
                  <Link href="/privacy" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>{' '}
                  for details.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="technical-accordion" />
              <div className="collapse-title text-lg font-medium">
                Can I use enhanced images commercially?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/80">
                  Yes! You retain all rights to your images. We do not claim any ownership of your
                  uploaded or enhanced images. However, you must have the legal right to use the
                  original image you upload. We are not responsible for copyright violations related
                  to your source images.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="technical-accordion" />
              <div className="collapse-title text-lg font-medium">What browsers are supported?</div>
              <div className="collapse-content">
                <p className="text-base-content/80 mb-4">
                  PixelPerfect AI works best on modern browsers:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-base-content/80">
                  <li>Chrome/Edge (latest 2 versions)</li>
                  <li>Firefox (latest 2 versions)</li>
                  <li>Safari (latest 2 versions)</li>
                </ul>
                <p className="text-base-content/80 mt-4">
                  JavaScript must be enabled for the service to function.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Contact Support */}
        <section className="mt-16 p-8 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-lg border border-primary/20">
          <h2 className="text-2xl font-bold mb-4">Still need help?</h2>
          <p className="text-base-content/80 mb-6">
            Can&apos;t find the answer you&apos;re looking for? Our support team is here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="mailto:support@pixelperfect.app" className="btn btn-primary">
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
            <Link href="/pricing" className="btn btn-outline">
              View Pricing
            </Link>
          </div>
        </section>

        {/* Related Links */}
        <div className="mt-12 pt-8 border-t border-base-300 flex flex-wrap gap-6">
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
          <Link href="/blog" className="text-primary hover:underline">
            Blog
          </Link>
        </div>
      </div>
    </main>
  );
}
