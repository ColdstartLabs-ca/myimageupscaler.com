import { useState, useCallback, useRef, useEffect } from 'react';
import { useUserStore } from '@client/store/userStore';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';

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
 * - Embedded checkout modal (same UX as credit packs)
 * - Error handling with retry logic
 */
export function useCheckoutFlow({
  priceId,
  onSelect,
  disabled = false,
}: IUseCheckoutFlowOptions): IUseCheckoutFlowReturn {
  const { isAuthenticated } = useUserStore();
  const { openAuthRequiredModal } = useModalStore();
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
      // Use auth required modal which lets users choose sign in or create account
      if (!isAuthenticated) {
        // Store checkout intent so user returns to checkout after auth
        prepareAuthRedirect('checkout', { context: { priceId } });

        window.history.replaceState({}, '', `${window.location.href}?checkout_price=${priceId}`);
        openAuthRequiredModal();
        showToast({
          message: 'Please sign in or create an account to complete your purchase',
          type: 'info',
        });
        setIsProcessing(false);
        return;
      }

      // Show embedded checkout modal (same UX as credit packs)
      setShowCheckoutModal(true);
      setTimeout(() => setIsProcessing(false), 0);
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
      // Use auth required modal which lets users choose sign in or create account
      if (
        error instanceof Error &&
        (error.message.includes('User not authenticated') ||
          error.message.includes('Missing authorization header') ||
          error.message.includes('Invalid authentication token'))
      ) {
        // Store checkout intent so user returns to checkout after auth
        prepareAuthRedirect('checkout', { context: { priceId } });

        window.history.replaceState({}, '', `${window.location.href}?checkout_price=${priceId}`);
        openAuthRequiredModal();
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
    openAuthRequiredModal,
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
