'use client';

import { useRestoreCart } from '@client/hooks/useRestoreCart';
import { CompletePurchaseBanner } from './CompletePurchaseBanner';

export function CheckoutRecoveryBanner(): JSX.Element | null {
  const { showRestoreBanner, pendingCart, handleRestore, handleDismiss } = useRestoreCart();

  if (!showRestoreBanner || !pendingCart) {
    return null;
  }

  return (
    <CompletePurchaseBanner
      checkout={pendingCart}
      onRestore={handleRestore}
      onDismiss={handleDismiss}
    />
  );
}
