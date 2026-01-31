'use client';

import { useState } from 'react';
import { SupportModal } from '@client/components/modal/support/SupportModal';

export function ContactOptions(): JSX.Element {
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  return (
    <>
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
          <p className="text-muted-foreground mb-6">
            Send us an email and we&apos;ll get back to you within 24 hours.
          </p>
          <button
            onClick={() => setIsSupportModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-accent text-white font-bold rounded-xl transition-all duration-300 gradient-cta shine-effect shadow-lg shadow-accent/20"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
              />
            </svg>
            Email Support
          </button>
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
          <p className="text-muted-foreground mb-6">
            Browse our documentation for answers to common questions.
          </p>
          <a
            href="/help"
            className="inline-flex items-center gap-2 px-6 py-3 bg-secondary text-white font-semibold rounded-xl hover:bg-secondary/90 transition-all duration-300"
          >
            Visit Help Center →
          </a>
        </div>
      </div>

      <SupportModal isOpen={isSupportModalOpen} onClose={() => setIsSupportModalOpen(false)} />
    </>
  );
}
