/**
 * Auth Bridge Content Script
 * Listens for auth session data from the /extension-auth page via postMessage
 * and stores it in chrome.storage.local. This avoids exposing the token as a
 * global variable on the window object.
 */

import type { IExtensionSession, ExtensionMessage } from '@extension/shared/types';
import { updateSession } from '@extension/shared/storage';

interface IAuthSessionMessage {
  type: 'EXTENSION_AUTH_SESSION';
  session: IExtensionSession;
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'GET_AUTH_FROM_PAGE') {
    // No longer reading from window globals — session is captured via postMessage
    sendResponse(null);
  }
  return true;
});

// If we're on the /extension-auth page, listen for the postMessage from the React app
if (window.location.pathname.includes('/extension-auth')) {
  const handleMessage = (event: MessageEvent) => {
    const data = event.data as IAuthSessionMessage;
    if (event.origin !== window.location.origin) return;
    if (data?.type !== 'EXTENSION_AUTH_SESSION' || !data.session?.accessToken) return;

    const authData = data.session;
    window.removeEventListener('message', handleMessage);

    // Store session in chrome.storage.local
    updateSession({
      userId: authData.userId,
      accessToken: authData.accessToken,
      creditsRemaining: authData.creditsRemaining,
      expiresAt: authData.expiresAt,
    })
      .then(() => {
        // Notify background script
        chrome.runtime.sendMessage({
          type: 'AUTH_COMPLETE',
          session: authData,
        });

        // Close this tab after a short delay
        setTimeout(() => {
          window.close();
        }, 500);
      })
      .catch(error => {
        console.error('Failed to store auth session:', error);
      });
  };

  window.addEventListener('message', handleMessage);

  // Stop listening after 30 seconds
  setTimeout(() => window.removeEventListener('message', handleMessage), 30000);
}

export {};
