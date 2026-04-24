/**
 * Background Service Worker for MyImageUpscaler Extension
 * Handles extension lifecycle, context menus, and communication between components
 */

// Keep track of the last hovered image for keyboard shortcut
let lastHoveredImageUrl: string | null = null;

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open welcome page on first install
    chrome.tabs.create({ url: 'https://myimageupscaler.com/extension-auth?action=install' });
  } else if (details.reason === 'update') {
    console.log('Extension updated to version:', chrome.runtime.getManifest().version);
  }

  // Create context menu
  chrome.contextMenus.create({
    id: 'upscale-image',
    title: 'Upscale with MyImageUpscaler',
    contexts: ['image'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'upscale-image' && info.srcUrl && tab?.id) {
    await handleImageUpscale(info.srcUrl, tab.id);
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'upscale-last-image' && lastHoveredImageUrl) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      await handleImageUpscale(lastHoveredImageUrl, tab.id);
    }
  }
});

/**
 * Handle image upscaling from context menu or keyboard shortcut
 */
async function handleImageUpscale(imageUrl: string, tabId: number) {
  try {
    // Open side panel for progress display
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
        // Ignore if side panel is already open
      });
    }

    // Send initial message to side panel
    chrome.runtime.sendMessage({
      type: 'PROCESS_UPSCALE_REQUEST',
      imageUrl,
    });

    // Inject image fetcher content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content-scripts/image-fetcher.ts'],
    });

    // Wait a bit for the content script to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send message to content script to fetch the image
    chrome.tabs.sendMessage(tabId, {
      type: 'FETCH_IMAGE_FROM_PAGE',
      imageUrl,
    }, (response) => {
      if (response?.success && response.data) {
        // Forward fetched image data to side panel for upscaling
        chrome.runtime.sendMessage({
          type: 'START_UPSCALE',
          imageUrl: response.data,
          originalUrl: imageUrl,
        });
      } else if (response?.error) {
        // Handle error
        chrome.runtime.sendMessage({
          type: 'UPSCALE_ERROR',
          error: response.error,
        });
      }
    });
  } catch (error) {
    console.error('Failed to handle image upscale:', error);
    chrome.runtime.sendMessage({
      type: 'UPSCALE_ERROR',
      error: error instanceof Error ? error.message : 'Failed to upscale image',
    });
  }
}

// Track hovered images from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IMAGE_HOVERED') {
    lastHoveredImageUrl = message.imageUrl;
  } else if (message.type === 'GET_LAST_IMAGE') {
    sendResponse({ imageUrl: lastHoveredImageUrl });
  } else if (message.type === 'OPEN_SIDEPANEL') {
    if (sender.tab?.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
    }
  } else if (message.type === 'IMAGE_FETCHER_READY') {
    // Content script is ready
    console.log('Image fetcher content script ready');
  }

  return true; // Keep message channel open for async response
});

export {};
