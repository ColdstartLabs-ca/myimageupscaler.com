'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Lock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { useModalStore } from '@client/store/modalStore';
import { useUserStore } from '@client/store/userStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';
import { CREDIT_COSTS } from '@shared/config/credits.config';

interface IGuestUpscalerProps {
  className?: string;
}

export function GuestUpscaler({ className }: IGuestUpscalerProps): React.ReactElement {
  const { isPaywalled, isLoading } = useRegionTier();
  const { isAuthenticated } = useUserStore();
  const { openAuthModal } = useModalStore();

  const handleViewPlans = React.useCallback(() => {
    if (isAuthenticated) {
      window.location.href = '/pricing';
      return;
    }

    prepareAuthRedirect('paywall_pricing', { returnTo: '/pricing' });
    openAuthModal('register');
  }, [isAuthenticated, openAuthModal]);

  if (isLoading) {
    return (
      <div className={cn('bg-surface rounded-xl p-8 border border-border text-center', className)}>
        <p className="text-sm text-text-secondary">Loading availability...</p>
      </div>
    );
  }

  if (isPaywalled) {
    return (
      <div className={cn('text-center py-8 space-y-4', className)}>
        <Lock className="w-12 h-12 mx-auto mb-4 text-accent" />
        <h3 className="text-2xl font-bold text-primary">Subscription Required</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Image upscaling requires a subscription in your region. Get started with our affordable
          plans and use the authenticated workspace for uploads.
        </p>
        <button
          onClick={handleViewPlans}
          className="inline-flex items-center justify-center px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors gap-2"
        >
          View plans
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const features = [
    `${CREDIT_COSTS.DEFAULT_FREE_CREDITS} free credits on signup`,
    'Authenticated uploads only',
    'Higher file limits and batch processing',
    'No public guest endpoint',
  ];

  return (
    <div
      className={cn(
        'bg-gradient-to-br from-surface to-surface-light rounded-xl p-8 border border-border text-center space-y-6',
        className
      )}
    >
      <Sparkles className="w-12 h-12 mx-auto text-accent" />
      <div className="space-y-3">
        <h3 className="text-2xl font-bold text-primary">
          {isAuthenticated ? 'Open The Workspace' : 'Create A Free Account To Upscale'}
        </h3>
        <p className="text-sm text-text-secondary max-w-md mx-auto">
          Public guest uploads are disabled. Use the authenticated workspace for all image uploads
          and processing.
        </p>
      </div>

      <div className="bg-surface rounded-lg p-4 text-left">
        <h4 className="font-semibold text-primary mb-3">
          {isAuthenticated ? 'Workspace access includes:' : 'Free account includes:'}
        </h4>
        <ul className="space-y-2">
          {features.map(feature => (
            <li key={feature} className="flex items-center gap-2 text-sm text-text-secondary">
              <Check className="w-4 h-4 text-success flex-shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {isAuthenticated ? (
        <Link
          href="/workspace"
          className="inline-flex items-center justify-center px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors gap-2"
        >
          Open workspace
          <ArrowRight className="w-4 h-4" />
        </Link>
      ) : (
        <Link
          href="/?signup=1"
          className="inline-flex items-center justify-center px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors gap-2"
        >
          Create free account
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
