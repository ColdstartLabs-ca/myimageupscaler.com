import type { Metadata } from 'next';
import Link from 'next/link';
import { JSX } from 'react';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Read the terms and conditions for using PixelPerfect AI image upscaling and enhancement services.',
  alternates: {
    canonical: '/terms',
  },
};

// eslint-disable-next-line import/no-default-export
export default function TermsOfServicePage(): JSX.Element {
  const lastUpdated = 'November 26, 2025';

  return (
    <main className="flex-1">
      <div className="container mx-auto py-16 px-6 max-w-4xl">
        <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
        <p className="text-base-content/70 mb-8">Last updated: {lastUpdated}</p>

        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-base-content/80 mb-4">
              By accessing or using PixelPerfect AI (&quot;Service&quot;), you agree to be bound by
              these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you
              may not use the Service.
            </p>
            <p className="text-base-content/80">
              We reserve the right to modify these Terms at any time. Continued use of the Service
              after changes constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-base-content/80 mb-4">
              PixelPerfect AI provides AI-powered image upscaling and enhancement services. The
              Service allows users to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-base-content/80">
              <li>Upload images for AI-powered enhancement</li>
              <li>Upscale images to higher resolutions (2x, 4x)</li>
              <li>Improve image quality while preserving text and logos</li>
              <li>Download processed images</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Account Registration</h2>
            <p className="text-base-content/80 mb-4">To use certain features, you must:</p>
            <ul className="list-disc pl-6 mb-4 text-base-content/80">
              <li>Create an account with accurate information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Notify us immediately of unauthorized access</li>
              <li>Be at least 13 years old (or the minimum age in your jurisdiction)</li>
            </ul>
            <p className="text-base-content/80">
              You are responsible for all activities under your account.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Credits and Payments</h2>

            <h3 className="text-xl font-medium mb-3">4.1 Credit System</h3>
            <p className="text-base-content/80 mb-4">
              The Service operates on a credit-based system. Each image processing action consumes
              credits based on the operation type and image size.
            </p>

            <h3 className="text-xl font-medium mb-3">4.2 Free Credits</h3>
            <p className="text-base-content/80 mb-4">
              New users receive 10 free credits upon registration. Free credits are subject to our
              standard Terms and may be modified or discontinued at any time.
            </p>

            <h3 className="text-xl font-medium mb-3">4.3 Purchased Credits</h3>
            <ul className="list-disc pl-6 mb-4 text-base-content/80">
              <li>Credit packs are one-time purchases and do not expire for 12 months</li>
              <li>
                Subscription credits renew monthly and may roll over (up to 6x monthly amount)
              </li>
              <li>All purchases are processed through Stripe</li>
              <li>Prices are in USD unless otherwise stated</li>
            </ul>

            <h3 className="text-xl font-medium mb-3">4.4 Refunds</h3>
            <p className="text-base-content/80 mb-4">
              Due to the nature of digital services, refunds are generally not provided for used
              credits. However, we may issue refunds at our discretion for:
            </p>
            <ul className="list-disc pl-6 mb-4 text-base-content/80">
              <li>Technical failures that result in lost credits</li>
              <li>Duplicate charges</li>
              <li>Service unavailability</li>
            </ul>
            <p className="text-base-content/80">
              For refund requests, contact{' '}
              <a href="mailto:support@pixelperfect.app" className="text-primary hover:underline">
                support@pixelperfect.app
              </a>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Subscriptions</h2>
            <ul className="list-disc pl-6 mb-4 text-base-content/80">
              <li>Subscriptions automatically renew at the end of each billing period</li>
              <li>You may cancel at any time through your account settings or Stripe portal</li>
              <li>Cancellation takes effect at the end of the current billing period</li>
              <li>No prorated refunds for partial billing periods</li>
              <li>
                We may change subscription prices with 30 days notice; continued use constitutes
                acceptance
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Acceptable Use</h2>
            <p className="text-base-content/80 mb-4">You agree NOT to use the Service to:</p>
            <ul className="list-disc pl-6 mb-4 text-base-content/80">
              <li>Process illegal, harmful, or offensive content</li>
              <li>Process images you do not have rights to use</li>
              <li>Generate or enhance content depicting minors in inappropriate ways</li>
              <li>Create deepfakes or misleading content intended to deceive</li>
              <li>Violate intellectual property rights of others</li>
              <li>Attempt to reverse-engineer or exploit the Service</li>
              <li>Use automated systems to abuse the Service</li>
              <li>Circumvent usage limits or security measures</li>
              <li>Resell or redistribute the Service without authorization</li>
            </ul>
            <p className="text-base-content/80">
              Violation of these terms may result in immediate account termination without refund.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>

            <h3 className="text-xl font-medium mb-3">7.1 Your Content</h3>
            <p className="text-base-content/80 mb-4">
              You retain all rights to images you upload. By using the Service, you grant us a
              limited license to process your images solely for providing the requested service.
            </p>

            <h3 className="text-xl font-medium mb-3">7.2 Our Service</h3>
            <p className="text-base-content/80 mb-4">
              PixelPerfect AI, including its technology, branding, and content, is protected by
              intellectual property laws. You may not copy, modify, distribute, or create derivative
              works without our written permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Service Availability</h2>
            <p className="text-base-content/80 mb-4">We strive for high availability but:</p>
            <ul className="list-disc pl-6 mb-4 text-base-content/80">
              <li>The Service is provided &quot;as is&quot; without guarantees</li>
              <li>We may perform maintenance with or without notice</li>
              <li>Processing times may vary based on demand</li>
              <li>We reserve the right to modify or discontinue features</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
            <p className="text-base-content/80 mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, PIXELPERFECT AI SHALL NOT BE LIABLE FOR:
            </p>
            <ul className="list-disc pl-6 mb-4 text-base-content/80">
              <li>Indirect, incidental, special, or consequential damages</li>
              <li>Loss of profits, data, or business opportunities</li>
              <li>Service interruptions or data loss</li>
              <li>Actions of third parties</li>
            </ul>
            <p className="text-base-content/80">
              Our total liability shall not exceed the amount you paid us in the 12 months preceding
              the claim.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Disclaimer of Warranties</h2>
            <p className="text-base-content/80 mb-4">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
              WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc pl-6 mb-4 text-base-content/80">
              <li>Merchantability</li>
              <li>Fitness for a particular purpose</li>
              <li>Non-infringement</li>
              <li>Accuracy or reliability of results</li>
            </ul>
            <p className="text-base-content/80">
              AI-generated enhancements may not always meet expectations. Results depend on input
              image quality and other factors.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Indemnification</h2>
            <p className="text-base-content/80">
              You agree to indemnify and hold harmless PixelPerfect AI and its officers, directors,
              employees, and agents from any claims, damages, losses, or expenses arising from your
              use of the Service, violation of these Terms, or infringement of any third-party
              rights.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Termination</h2>
            <p className="text-base-content/80 mb-4">
              We may suspend or terminate your account at any time for:
            </p>
            <ul className="list-disc pl-6 mb-4 text-base-content/80">
              <li>Violation of these Terms</li>
              <li>Fraudulent or illegal activity</li>
              <li>Non-payment</li>
              <li>Extended inactivity</li>
              <li>Any other reason at our sole discretion</li>
            </ul>
            <p className="text-base-content/80">
              Upon termination, your right to use the Service ceases immediately. Unused credits are
              forfeited unless otherwise required by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. Governing Law</h2>
            <p className="text-base-content/80">
              These Terms shall be governed by the laws of the jurisdiction in which we operate,
              without regard to conflict of law provisions. Any disputes shall be resolved in the
              courts of that jurisdiction.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">14. Severability</h2>
            <p className="text-base-content/80">
              If any provision of these Terms is found unenforceable, the remaining provisions shall
              remain in full force and effect.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">15. Contact</h2>
            <p className="text-base-content/80 mb-4">For questions about these Terms:</p>
            <ul className="list-none mb-4 text-base-content/80">
              <li>
                Email:{' '}
                <a href="mailto:legal@pixelperfect.app" className="text-primary hover:underline">
                  legal@pixelperfect.app
                </a>
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-base-300">
          <Link href="/privacy" className="text-primary hover:underline">
            View Privacy Policy &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
