import { Metadata } from 'next';
import Link from 'next/link';
import { clientEnv } from '@shared/config/env';

export const metadata: Metadata = {
  title: `Verify Your Email | ${clientEnv.APP_NAME}`,
  description: 'Please check your email to verify your account',
};

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4">
        <div className="bg-card rounded-2xl shadow-xl p-8 text-center">
          {/* Email Icon */}
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-accent flex items-center justify-center glow-blue">
            <svg
              className="w-8 h-8 text-white"
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

          <h1 className="text-2xl font-bold text-foreground mb-2">Check Your Email</h1>

          <p className="text-muted-foreground mb-6">
            We&apos;ve sent a verification link to your email address. Please click the link to
            activate your account.
          </p>

          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Didn&apos;t receive the email?</p>
              <ul className="list-disc list-inside space-y-1 text-left">
                <li>Check your spam or junk folder</li>
                <li>Make sure you entered the correct email</li>
                <li>Wait a few minutes and try again</li>
              </ul>
            </div>

            <Link
              href="/"
              className="inline-block w-full px-4 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-accent/25 hover:shadow-xl hover:shadow-accent/30 active:scale-[0.98] glow-blue"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
