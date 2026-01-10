import { SubscriptionConfirmedClient } from './SubscriptionConfirmedClient';

// Force dynamic rendering - this page uses search params and i18n
export const dynamic = 'force-dynamic';

export default function SubscriptionConfirmedPage() {
  return <SubscriptionConfirmedClient />;
}
