import { JSX, useEffect } from 'react';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';

export const AuthErrorHandler = (): JSX.Element => {
  const { showToast } = useToastStore();
  const { openAuthModal } = useModalStore();

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.includes('error=')) {
        const params = new URLSearchParams(hash.slice(1));
        const error = params.get('error_description');
        if (error) {
          showToast({ message: decodeURIComponent(error), type: 'error' });
          openAuthModal('login');
          // Clear the hash to prevent showing the error again on refresh
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    };

    // Check on mount and when hash changes
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [showToast, openAuthModal]);

  return <></>;
};
