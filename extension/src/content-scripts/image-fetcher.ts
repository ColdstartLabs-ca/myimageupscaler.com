/**
 * Image Fetcher Content Script
 * Injected programmatically to fetch images from web pages
 * Runs in the page context to handle same-origin images
 */

import type { ExtensionMessage } from '@extension/shared/types';

// Listen for fetch requests from background script
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'FETCH_IMAGE_FROM_PAGE' && message.imageUrl) {
    fetchImageFromPage(message.imageUrl)
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  return false;
});

/**
 * Fetch an image from the current page
 * This runs in page context, so it can access same-origin images
 */
async function fetchImageFromPage(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    // If fetch fails (likely CORS), return the URL as-is
    // The background script will handle it via extension permissions
    console.warn('Direct fetch failed, returning URL:', error);
    return imageUrl;
  }
}

// Notify background script that content script is ready
chrome.runtime.sendMessage({
  type: 'IMAGE_FETCHER_READY',
});

export {};
