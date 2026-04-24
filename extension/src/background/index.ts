/**
 * Background Service Worker for MyImageUpscaler Extension
 * Handles extension lifecycle, context menus, and communication between components
 */

import type { PlasmoCSConfig } from 'plasmo';

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
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'upscale-image' && info.srcUrl) {
    // Send message to side panel or open it
    chrome.runtime.sendMessage({
      type: 'UPSCALE_IMAGE',
      imageUrl: info.srcUrl,
      tabId: tab?.id,
    });
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'upscale-last-image' && lastHoveredImageUrl) {
    chrome.runtime.sendMessage({
      type: 'UPSCALE_IMAGE',
      imageUrl: lastHoveredImageUrl,
    });
  }
});

// Track hovered images from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IMAGE_HOVERED') {
    lastHoveredImageUrl = message.imageUrl;
  } else if (message.type === 'GET_LAST_IMAGE') {
    sendResponse({ imageUrl: lastHoveredImageUrl });
  } else if (message.type === 'OPEN_SIDEPANEL') {
    chrome.sidePanel.open({ windowId: sender.tab?.windowId });
  } else if (message.type === 'UPSCALE_IMAGE') {
    // Forward to side panel
    chrome.runtime.sendMessage({
      type: 'PROCESS_UPSCALE_REQUEST',
      imageUrl: message.imageUrl,
      imageElement: message.imageElement,
    });
  }

  return true; // Keep message channel open for async response
});

export {};
