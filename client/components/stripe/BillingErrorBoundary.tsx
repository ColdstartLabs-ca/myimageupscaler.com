'use client';

import React from 'react';
import { AlertTriangle, CreditCard, RefreshCw, Home, HeadphonesIcon } from 'lucide-react';

interface IBillingErrorBoundaryProps {
  children: React.ReactNode;
  context?: 'checkout' | 'pricing' | 'billing-page';
}

interface IBillingErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorType: 'network' | 'payment' | 'auth' | 'general';
}

/**
 * Billing-specific error boundary for handling payment and checkout errors
 */
export class BillingErrorBoundary extends React.Component<
  IBillingErrorBoundaryProps,
  IBillingErrorBoundaryState
> {
  constructor(props: IBillingErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorType: 'general',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<IBillingErrorBoundaryState> {
    // Categorize the error type for better UX
    let errorType: IBillingErrorBoundaryState['errorType'] = 'general';

    const errorMessage = error.message.toLowerCase();

    if (
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('connection')
    ) {
      errorType = 'network';
    } else if (
      errorMessage.includes('payment') ||
      errorMessage.includes('stripe') ||
      errorMessage.includes('checkout')
    ) {
      errorType = 'payment';
    } else if (
      errorMessage.includes('auth') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('login')
    ) {
      errorType = 'auth';
    }

    return {
      hasError: true,
      error,
      errorType,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('BillingErrorBoundary caught an error:', error, errorInfo);

    // Log to error monitoring service in production
    if (typeof window !== 'undefined' && window.location?.hostname !== 'localhost') {
      // Example: Send to error monitoring service
      // reportBillingError(error, errorInfo, this.props.context);
    }
  }

  handleRetry = (): void => {
    // Clear the error and retry
    this.setState({
      hasError: false,
      error: null,
      errorType: 'general',
    });
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  handleGoToPricing = (): void => {
    window.location.href = '/pricing';
  };

  handleContactSupport = (): void => {
    // Open email client or redirect to support page
    window.location.href = 'mailto:support@example.com?subject=Billing Error';
  };

  getErrorContent(): {
    title: string;
    message: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    primaryAction: () => void;
    primaryLabel: string;
    secondaryAction: () => void;
    secondaryLabel: string;
  } {
    const { errorType, error } = this.state;
    const { context = 'general' } = this.props;

    switch (errorType) {
      case 'network':
        return {
          title: 'Connection Error',
          message:
            'Unable to connect to our payment servers. Please check your internet connection and try again.',
          icon: RefreshCw,
          primaryAction: this.handleRetry,
          primaryLabel: 'Try Again',
          secondaryAction: this.handleGoToPricing,
          secondaryLabel: 'Back to Pricing',
        };

      case 'payment':
        return {
          title: 'Payment Error',
          message:
            error?.message ||
            'There was an issue processing your payment. Please try a different payment method or contact support.',
          icon: CreditCard,
          primaryAction: this.handleRetry,
          primaryLabel: 'Try Again',
          secondaryAction: this.handleContactSupport,
          secondaryLabel: 'Contact Support',
        };

      case 'auth':
        return {
          title: 'Authentication Required',
          message: 'Please sign in to complete your purchase. Your session may have expired.',
          icon: AlertTriangle,
          primaryAction: () => {
            // Redirect to login with return URL
            const currentUrl = encodeURIComponent(window.location.href);
            window.location.href = `/auth/login?returnTo=${currentUrl}`;
          },
          primaryLabel: 'Sign In',
          secondaryAction: this.handleGoHome,
          secondaryLabel: 'Home',
        };

      default:
        return {
          title: 'Something Went Wrong',
          message:
            'An unexpected error occurred. We apologize for the inconvenience. Please try again or contact support if the problem persists.',
          icon: AlertTriangle,
          primaryAction: this.handleRetry,
          primaryLabel: 'Try Again',
          secondaryAction:
            context === 'checkout' ? this.handleGoToPricing : this.handleContactSupport,
          secondaryLabel: context === 'checkout' ? 'Back to Pricing' : 'Contact Support',
        };
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      const errorContent = this.getErrorContent();
      const Icon = errorContent.icon;

      return (
        <div className="min-h-screen bg-surface flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-surface-light rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 bg-red-100 rounded-full">
              <Icon className="w-8 h-8 text-red-600" />
            </div>

            <h1 className="text-2xl font-bold text-primary text-center mb-4">
              {errorContent.title}
            </h1>

            <p className="text-muted-foreground text-center mb-8">{errorContent.message}</p>

            <div className="space-y-3">
              <button
                onClick={errorContent.primaryAction}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors"
              >
                {errorContent.primaryAction === this.handleRetry && (
                  <RefreshCw className="w-4 h-4" />
                )}
                {errorContent.primaryLabel}
              </button>

              <button
                onClick={errorContent.secondaryAction}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-surface hover:bg-surface-hover text-muted-foreground font-medium rounded-lg transition-colors border border-border"
              >
                {errorContent.secondaryAction === this.handleContactSupport && (
                  <HeadphonesIcon className="w-4 h-4" />
                )}
                {errorContent.secondaryAction === this.handleGoHome && <Home className="w-4 h-4" />}
                {errorContent.secondaryLabel}
              </button>
            </div>

            {/* Additional help text for specific contexts */}
            {this.props.context === 'checkout' && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Need help?</strong> If you continue to experience issues, please contact
                  our support team at support@example.com or try using a different browser or
                  device.
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
