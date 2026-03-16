'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, Lock, Shield } from 'lucide-react';

interface ITrustBadgesProps {
  /**
   * Layout variant for different contexts
   * - 'horizontal': Single row of badges (default for checkout modal)
   * - 'compact': Smaller inline badges for billing page sections
   */
  variant?: 'horizontal' | 'compact';
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * TrustBadges component displays security and trust indicators
 * to reassure users during checkout and on billing pages.
 *
 * Usage:
 * ```tsx
 * <TrustBadges variant="horizontal" />
 * <TrustBadges variant="compact" className="mt-2" />
 * ```
 */
export function TrustBadges({
  variant = 'horizontal',
  className = '',
}: ITrustBadgesProps): JSX.Element {
  const t = useTranslations('stripe.trustBadges');

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-3 text-muted-foreground ${className}`}>
        <div className="flex items-center gap-1.5">
          <Lock size={14} className="text-success" />
          <span className="text-xs">{t('sslEncrypted')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Shield size={14} className="text-success" />
          <span className="text-xs">{t('gdprCompliant')}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-3 px-4 bg-surface-light/50 rounded-lg ${className}`}
    >
      <SecurityBadge icon={Lock} label={t('securePayment')} />
      <SecurityBadge icon={Shield} label={t('sslEncryption')} />
      <SecurityBadge icon={BadgeCheck} label={t('stripeSecure')} />
    </div>
  );
}

interface ISecurityBadgeProps {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
}

function SecurityBadge({ icon: Icon, label }: ISecurityBadgeProps): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon size={14} className="text-success" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
