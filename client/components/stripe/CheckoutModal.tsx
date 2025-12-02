'use client';

import { useToastStore } from '@client/store/toastStore';
import { StripeService } from '@client/services/stripeService';
import { clientEnv } from '@shared/config/env';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe, type StripeEmbeddedCheckoutOptions } from '@stripe/stripe-js';
import { useEffect, useState } from 'react';

interface ICheckoutModalProps {
  priceId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// Initialize Stripe outside of component to avoid recreating on each render
// Add validation to provide better error messages
const getStripePromise = () => {
  const publishableKey = clientEnv.STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    console.error('Stripe publishable key is not configured. Please set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in your .env file.');
    return null;
  }

  if (!publishableKey.startsWith('pk_')) {
    console.error('Invalid Stripe publishable key format. Key should start with "pk_"');
    return null;
  }

  return loadStripe(publishableKey);
};

const stripePromise = getStripePromise();

/**
 * CheckoutModal component for embedded Stripe Checkout
 *
 * Usage:
 * ```tsx
 * <CheckoutModal
 *   priceId="price_XXX"
 *   onClose={() => setShowModal(false)}
 *   onSuccess={() => handleSuccess()}
 * />
 * ```
 */
export function CheckoutModal({ priceId, onClose, onSuccess }: ICheckoutModalProps): JSX.Element {
  // Check if Stripe is properly configured
  useEffect(() => {
    if (!stripePromise) {
      setError('Stripe is not properly configured. Please contact support.');
      setLoading(false);
    }
  }, []);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToastStore();

  useEffect(() => {
    const createCheckoutSession = async () => {
      // Don't attempt to create session if Stripe isn't configured
      if (!stripePromise) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await StripeService.createCheckoutSession(priceId, {
          uiMode: 'embedded',
          successUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
        });

        if (response.clientSecret) {
          setClientSecret(response.clientSecret);
        } else {
          throw new Error('No client secret returned from checkout session');
        }
      } catch (err) {
        console.error('Failed to create checkout session:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load checkout';
        setError(errorMessage);
        showToast({
          message: errorMessage,
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    };

    createCheckoutSession();
  }, [priceId, showToast]);

  const options: StripeEmbeddedCheckoutOptions = {
    clientSecret: clientSecret || '',
    onComplete: () => {
      // Called when the checkout is complete
      if (onSuccess) {
        onSuccess();
      }
      // Close the modal after a short delay to show confirmation
      setTimeout(() => {
        onClose();
      }, 1500);
    },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[95vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-slate-400 hover:text-slate-600 transition-colors bg-white rounded-full shadow-md"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Content */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                <p className="text-slate-600">Loading checkout...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-8">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-red-800 font-semibold mb-2">Error</h3>
                <p className="text-red-600">{error}</p>
                <button
                  onClick={onClose}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {!loading && !error && clientSecret && (
            <div className="min-h-[600px]">
              <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
