'use client';

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { clientEnv } from '@shared/config/env';
import { useTranslations } from 'next-intl';

// Extend Window interface for baselime monitoring
interface IBaselimeLogger {
  logError: (error: Error, context: Record<string, unknown>) => void;
}

interface IWindowWithBaselime extends Window {
  baselime?: IBaselimeLogger;
}

interface IErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, resetError: () => void) => ReactNode;
}

interface IErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary component that catches React errors and displays a fallback UI
 * Prevents blank pages when components crash
 */
class ErrorBoundaryInner extends Component<
  IErrorBoundaryProps & { t: ReturnType<typeof useTranslations> },
  IErrorBoundaryState
> {
  constructor(props: IErrorBoundaryProps & { t: ReturnType<typeof useTranslations> }) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<IErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });

    // Log to monitoring service if available
    if (typeof window !== 'undefined' && (window as IWindowWithBaselime).baselime) {
      const baselimeLogger = (window as IWindowWithBaselime).baselime;
      if (baselimeLogger) {
        baselimeLogger.logError(error, {
          componentStack: errorInfo.componentStack,
          boundary: 'ErrorBoundary',
        });
      }
    }
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface px-4">
          <div className="max-w-md w-full bg-surface rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-error/10 rounded-full">
              <AlertTriangle className="h-6 w-6 text-error" />
            </div>

            <div className="mt-6 text-center">
              <h1 className="text-2xl font-bold text-text-primary">
                {this.props.t('errors.boundary.title')}
              </h1>
              <p className="mt-2 text-text-secondary">{this.props.t('errors.boundary.message')}</p>

              {clientEnv.ENV === 'development' && this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm text-text-secondary hover:text-text-muted">
                    {this.props.t('errors.boundary.detailsLabel')}
                  </summary>
                  <div className="mt-2 p-3 bg-surface-light rounded text-xs font-mono overflow-auto max-h-48">
                    <p className="font-bold text-error">{this.state.error.toString()}</p>
                    {this.state.errorInfo && (
                      <pre className="mt-2 text-text-secondary whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                </details>
              )}
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.resetError}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-accent hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {this.props.t('errors.boundary.retryButton')}
              </button>
              <a
                href="/"
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-border rounded-lg shadow-sm text-sm font-medium text-text-secondary bg-surface hover:bg-surface focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
              >
                <Home className="h-4 w-4 mr-2" />
                {this.props.t('errors.boundary.homeButton')}
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary(props: IErrorBoundaryProps): JSX.Element {
  const t = useTranslations();
  return <ErrorBoundaryInner {...props} t={t} />;
}
