import { useCallback, useEffect, useState } from 'react';

const DISMISSED_KEY = 'pwa_install_dismissed';

interface IBeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface IPwaInstall {
  canInstall: boolean;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
}

export function usePwaInstall(): IPwaInstall {
  const [deferredPrompt, setDeferredPrompt] = useState<IBeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Skip if already installed in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Skip if previously dismissed
    if (localStorage.getItem(DISMISSED_KEY)) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as IBeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
    setDeferredPrompt(null);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === 'dismissed') dismiss();
  }, [deferredPrompt, dismiss]);

  return {
    canInstall: !!deferredPrompt && !dismissed,
    promptInstall,
    dismiss,
  };
}
