/**
 * Background Service Worker for MyImageUpscaler Extension
 * Handles extension lifecycle, context menus, and communication between components
 */

// Keep track of the last hovered image for keyboard shortcut
let lastHoveredImageUrl: string | null = null;

// Initialize extension on install
chrome.runtime.onInstalled.addListener(async details => {
  if (details.reason === 'install') {
    // Open welcome page on first install
    chrome.tabs.create({ url: 'https://myimageupscaler.com/extension-auth?action=install' });
  } else if (details.reason === 'update') {
    console.log('Extension updated to version:', chrome.runtime.getManifest().version);
  }

  // Remove existing menus to prevent duplicates on update/reload
  await chrome.contextMenus.removeAll();
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
chrome.commands.onCommand.addListener(async command => {
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

    // Fetch image directly in the page context via injected function
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (url: string) => {
        return fetch(url)
          .then(r => {
            if (!r.ok) throw new Error(`Failed to fetch image: ${r.statusText}`);
            return r.blob();
          })
          .then(
            blob =>
              new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              })
          )
          .catch(() => url); // Fallback to URL if fetch fails (e.g. CORS)
      },
      args: [imageUrl],
    });

    const imageData = results[0]?.result as string | undefined;

    if (imageData) {
      chrome.runtime.sendMessage({
        type: 'START_UPSCALE',
        imageUrl: imageData,
        originalUrl: imageUrl,
      });
    } else {
      chrome.runtime.sendMessage({
        type: 'UPSCALE_ERROR',
        error: 'Failed to fetch image from page',
      });
    }
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
  }

  return true; // Keep message channel open for async response
});

export {};
