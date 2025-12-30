import type { Metadata } from 'next';
import Link from 'next/link';
import { JSX } from 'react';
import { clientEnv } from '@shared/config/env';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `Learn how ${clientEnv.APP_NAME} collects, uses, and protects your personal information and uploaded images.`,
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPolicyPage(): JSX.Element {
  const lastUpdated = clientEnv.LAST_UPDATED_DATE;

  return (
    <main className="flex-1">
      <div className="container mx-auto py-16 px-6 max-w-4xl">
        <h1 className="text-4xl font-bold text-primary mb-4">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: {lastUpdated}</p>

        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">1. Introduction</h2>
            <p className="text-muted-foreground mb-4">
              Welcome to {clientEnv.APP_NAME} (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;).
              We are committed to protecting your privacy and ensuring the security of your personal
              information. This Privacy Policy explains how we collect, use, disclose, and safeguard
              your information when you use our AI-powered image upscaling and enhancement service.
            </p>
            <p className="text-muted-foreground">
              By using {clientEnv.APP_NAME}, you agree to the collection and use of information in
              accordance with this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">2. Information We Collect</h2>

            <h3 className="text-xl font-medium text-primary mb-3">2.1 Account Information</h3>
            <p className="text-muted-foreground mb-4">When you create an account, we collect:</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>Email address</li>
              <li>Name (if provided)</li>
              <li>Password (stored securely using industry-standard hashing)</li>
              <li>
                Authentication data from third-party providers (Google) if you choose to sign in
                with OAuth
              </li>
            </ul>

            <h3 className="text-xl font-medium text-primary mb-3">2.2 Uploaded Images</h3>
            <p className="text-muted-foreground mb-4">
              When you use our service, you upload images for processing. We:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>Process your images using AI technology to enhance or upscale them</li>
              <li>
                Do not permanently store your original or processed images on our servers after
                processing is complete
              </li>
              <li>
                Do not use your images to train AI models or for any purpose other than providing
                the requested service
              </li>
            </ul>

            <h3 className="text-xl font-medium text-primary mb-3">2.3 Payment Information</h3>
            <p className="text-muted-foreground mb-4">
              We use Stripe to process payments. We do not store your full credit card details on
              our servers. Stripe handles all payment processing and stores payment information
              according to their{' '}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Privacy Policy
              </a>
              .
            </p>

            <h3 className="text-xl font-medium text-primary mb-3">2.4 Usage Data</h3>
            <p className="text-muted-foreground mb-4">We automatically collect:</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Pages visited and time spent</li>
              <li>Device information</li>
              <li>Referring website</li>
              <li>Processing history (number of images processed, credits used)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">
              3. How We Use Your Information
            </h2>
            <p className="text-muted-foreground mb-4">We use the collected information to:</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>Provide, maintain, and improve our services</li>
              <li>Process your image enhancement requests</li>
              <li>Manage your account and credit balance</li>
              <li>Process payments and send transaction receipts</li>
              <li>Send service-related communications (password resets, account notifications)</li>
              <li>Respond to customer support requests</li>
              <li>Analyze usage patterns to improve our service</li>
              <li>Detect and prevent fraud or abuse</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">
              4. Data Sharing and Disclosure
            </h2>
            <p className="text-muted-foreground mb-4">
              We do not sell your personal information. We may share your information with:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>
                <strong>Service Providers:</strong> Third-party services that help us operate our
                platform (e.g., Stripe for payments, Supabase for authentication, Google for AI
                processing)
              </li>
              <li>
                <strong>Legal Requirements:</strong> When required by law, court order, or
                governmental authority
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection with a merger, acquisition, or
                sale of assets
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">5. Data Security</h2>
            <p className="text-muted-foreground mb-4">
              We implement industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>HTTPS encryption for all data transmission</li>
              <li>Secure password hashing</li>
              <li>Regular security audits</li>
              <li>Access controls and authentication</li>
              <li>Row-level security for database access</li>
            </ul>
            <p className="text-muted-foreground">
              While we strive to protect your information, no method of transmission over the
              Internet is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">6. Data Retention</h2>
            <p className="text-muted-foreground mb-4">
              We retain your account information for as long as your account is active. You may
              request deletion of your account and associated data at any time.
            </p>
            <p className="text-muted-foreground">
              Uploaded images are processed in real-time and are not permanently stored. Transaction
              records are retained for legal and accounting purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">7. Your Rights</h2>
            <p className="text-muted-foreground mb-4">
              Depending on your location, you may have the following rights:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>
                <strong>Access:</strong> Request a copy of the personal data we hold about you
              </li>
              <li>
                <strong>Correction:</strong> Request correction of inaccurate data
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your personal data
              </li>
              <li>
                <strong>Portability:</strong> Request a copy of your data in a portable format
              </li>
              <li>
                <strong>Objection:</strong> Object to certain processing of your data
              </li>
            </ul>
            <p className="text-muted-foreground">
              To exercise these rights, please contact us at{' '}
              <a href={`mailto:${clientEnv.PRIVACY_EMAIL}`} className="text-accent hover:underline">
                {clientEnv.PRIVACY_EMAIL}
              </a>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">8. Cookies and Tracking</h2>
            <p className="text-muted-foreground mb-4">
              We use cookies and similar technologies to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>Maintain your session and authentication</li>
              <li>Remember your preferences</li>
              <li>Analyze usage patterns (via Google Analytics and Amplitude)</li>
              <li>Improve our service</li>
            </ul>
            <p className="text-muted-foreground">
              You can control cookies through your browser settings, but disabling them may affect
              service functionality.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">9. Children&apos;s Privacy</h2>
            <p className="text-muted-foreground">
              Our service is not intended for children under 13 years of age. We do not knowingly
              collect personal information from children under 13. If you believe we have collected
              information from a child under 13, please contact us immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">
              10. International Data Transfers
            </h2>
            <p className="text-muted-foreground">
              Your information may be transferred to and processed in countries other than your
              country of residence. These countries may have different data protection laws. By
              using our service, you consent to such transfers. We ensure appropriate safeguards are
              in place to protect your data.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">11. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. We will notify you of significant
              changes by posting the new policy on this page and updating the &quot;Last
              updated&quot; date. Your continued use of the service after changes constitutes
              acceptance of the updated policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">12. Contact Us</h2>
            <p className="text-muted-foreground mb-4">
              If you have questions about this Privacy Policy or our data practices, please contact
              us:
            </p>
            <ul className="list-none mb-4 text-muted-foreground">
              <li>
                Email:{' '}
                <a
                  href={`mailto:${clientEnv.PRIVACY_EMAIL}`}
                  className="text-accent hover:underline"
                >
                  {clientEnv.PRIVACY_EMAIL}
                </a>
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <Link href="/terms" className="text-accent hover:underline">
            View Terms of Service &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
