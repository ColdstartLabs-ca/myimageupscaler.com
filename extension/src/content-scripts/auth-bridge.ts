/**
 * Auth Bridge Content Script
 * Extracts auth session from the /extension-auth page and stores in chrome.storage.local
 */

import type { IExtensionSession, ExtensionMessage } from '@extension/shared/types';
import { updateSession } from '@extension/shared/storage';

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'GET_AUTH_FROM_PAGE') {
    // Try to get auth data from the page
    const authData = getAuthDataFromPage();
    if (authData) {
      sendResponse(authData);
    }
  }
  return true;
});

// Extract auth data from the page's window object
// The /extension-auth page will attach this data
function getAuthDataFromPage(): IExtensionSession | null {
  const windowWithAuth = window as typeof window & {
    __EXTENSION_AUTH__?: IExtensionSession;
  };

  if (windowWithAuth.__EXTENSION_AUTH__) {
    return windowWithAuth.__EXTENSION_AUTH__;
  }

  return null;
}

// If we're on the /extension-auth page, listen for auth completion
if (window.location.pathname.includes('/extension-auth')) {
  // Poll for auth data from the parent page (React app)
  const checkAuth = setInterval(() => {
    const authData = getAuthDataFromPage();
    if (authData && authData.accessToken) {
      clearInterval(checkAuth);

      // Store session in chrome.storage.local
      updateSession({
        userId: authData.userId,
        accessToken: authData.accessToken,
        creditsRemaining: authData.creditsRemaining,
        expiresAt: authData.expiresAt,
      }).then(() => {
        // Notify background script
        chrome.runtime.sendMessage({
          type: 'AUTH_COMPLETE',
          session: authData,
        });

        // Close this tab after a short delay
        setTimeout(() => {
          window.close();
        }, 500);
      }).catch((error) => {
        console.error('Failed to store auth session:', error);
      });
    }
  }, 100);

  // Stop polling after 30 seconds
  setTimeout(() => clearInterval(checkAuth), 30000);
}

export {};
