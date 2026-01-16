import { useState, useCallback, useRef, useEffect } from 'react';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { StripeService } from '@client/services/stripeService';

interface IUseCheckoutFlowOptions {
  priceId: string;
  onSelect?: () => void;
  disabled?: boolean;
}

interface IUseCheckoutFlowReturn {
  handleCheckout: () => Promise<void>;
  isProcessing: boolean;
  hasError: boolean;
  retryCount: number;
  showCheckoutModal: boolean;
  closeCheckoutModal: () => void;
  handleCheckoutSuccess: () => void;
}

const DEBOUNCE_MS = 500;
const MAX_RETRIES = 3;

/**
 * Hook that encapsulates the checkout flow logic including:
 * - Click debouncing
 * - Authentication checks
 * - Mobile vs desktop checkout routing
 * - Error handling with retry logic
 */
export function useCheckoutFlow({
  priceId,
  onSelect,
  disabled = false,
}: IUseCheckoutFlowOptions): IUseCheckoutFlowReturn {
  const { isAuthenticated } = useUserStore();
  const { openAuthModal } = useModalStore();
  const { showToast } = useToastStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    const currentTimeout = clickTimeoutRef.current;
    return () => {
      if (currentTimeout) {
        clearTimeout(currentTimeout);
      }
    };
  }, []);

  const closeCheckoutModal = useCallback(() => {
    setShowCheckoutModal(false);
  }, []);

  const handleCheckoutSuccess = useCallback(() => {
    setShowCheckoutModal(false);
    window.location.href = '/success';
  }, []);

  const handleCheckout = useCallback(async () => {
    // Prevent rapid clicking
    if (disabled || isProcessing) return;

    // Debounce rapid clicks
    const now = Date.now();
    if (now - lastClickTime < DEBOUNCE_MS) {
      return;
    }
    setLastClickTime(now);

    // Clear any existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    setIsProcessing(true);
    setHasError(false);

    try {
      // If onSelect provided, delegate to it
      if (onSelect) {
        await new Promise(resolve => setTimeout(resolve, 100));
        onSelect();
        setIsProcessing(false);
        return;
      }

      // If not authenticated, redirect to auth
      if (!isAuthenticated) {
        window.history.replaceState({}, '', `${window.location.href}?checkout_price=${priceId}`);
        openAuthModal('login');
        showToast({
          message: 'Please sign in to complete your purchase',
          type: 'info',
        });
        setIsProcessing(false);
        return;
      }

      // Check device type for best checkout UX
      const isMobile = window.innerWidth < 768;

      if (isMobile) {
        // Mobile: redirect to Stripe hosted checkout
        await StripeService.redirectToCheckout(priceId, {
          successUrl: `${window.location.origin}/success`,
          cancelUrl: window.location.href,
        });
        setIsProcessing(false);
      } else {
        // Desktop: show embedded checkout modal
        setShowCheckoutModal(true);
        setTimeout(() => setIsProcessing(false), 0);
      }
    } catch (error) {
      console.error('Error during subscription process:', error);
      setHasError(true);
      setRetryCount(prev => {
        const newCount = prev + 1;
        if (newCount >= MAX_RETRIES) {
          showToast({
            message: 'Multiple failed attempts. Please refresh the page and try again.',
            type: 'error',
          });
        }
        return newCount;
      });

      // Handle authentication errors
      if (
        error instanceof Error &&
        (error.message.includes('User not authenticated') ||
          error.message.includes('Missing authorization header') ||
          error.message.includes('Invalid authentication token'))
      ) {
        window.history.replaceState({}, '', `${window.location.href}?checkout_price=${priceId}`);
        openAuthModal('login');
        setIsProcessing(false);
        return;
      }

      // Handle different error types
      if (error instanceof Error) {
        if (error.message.includes('fetch') || error.message.includes('network')) {
          showToast({
            message: 'Network error. Please check your connection and try again.',
            type: 'error',
          });
        } else if (error.message.includes('Failed to fetch')) {
          showToast({
            message: 'Unable to connect to server. Please try again later.',
            type: 'error',
          });
        } else {
          showToast({
            message: error.message || 'Failed to initiate checkout',
            type: 'error',
          });
        }
      } else {
        showToast({
          message: 'Failed to initiate checkout',
          type: 'error',
        });
      }

      setIsProcessing(false);
    }
  }, [
    disabled,
    isProcessing,
    onSelect,
    priceId,
    isAuthenticated,
    openAuthModal,
    showToast,
    lastClickTime,
  ]);

  return {
    handleCheckout,
    isProcessing,
    hasError,
    retryCount,
    showCheckoutModal,
    closeCheckoutModal,
    handleCheckoutSuccess,
  };
}
