'use client';

import Link from 'next/link';
import { XCircle, ArrowLeft, HelpCircle } from 'lucide-react';
import { clientEnv } from '@shared/config/env';

export default function CanceledPage() {
  return (
    <main className="flex-1">
      <div className="container mx-auto py-16 px-6">
        <div className="max-w-lg mx-auto text-center">
          {/* Canceled Icon */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-surface-light">
              <XCircle className="h-12 w-12 text-muted-foreground" />
            </div>
          </div>

          {/* Canceled Message */}
          <h1 className="text-3xl font-bold mb-4">Payment Canceled</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Your payment was canceled and you have not been charged. If you experienced any issues,
            please don&apos;t hesitate to reach out.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pricing
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center px-6 py-3 border border-white/20 text-muted-foreground font-medium rounded-lg hover:bg-surface transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>

          {/* Help Section */}
          <div className="mt-12 p-6 bg-surface-light rounded-xl">
            <div className="flex items-center justify-center gap-2 mb-3">
              <HelpCircle className="h-5 w-5 text-accent" />
              <h3 className="font-semibold">Need Help?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              If you have questions about our pricing or need assistance with your purchase, our
              support team is here to help.
            </p>
            <a
              href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
              className="inline-flex items-center justify-center px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-surface-light rounded-lg transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
