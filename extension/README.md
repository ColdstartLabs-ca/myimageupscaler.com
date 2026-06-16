# MyImageUpscaler Browser Extension

## Overview
Manifest V3 browser extension for Chrome, Edge, and Firefox that allows users to upscale images from any webpage.

## Structure
- `src/background/` - Service worker (background scripts)
- `src/popup/` - Extension popup UI
- `src/sidepanel/` - Side panel for results preview
- `src/content-scripts/` - Content scripts injected into web pages
- `src/shared/` - Shared types and utilities

## Development

### Install Dependencies
```bash
cd extension
yarn install
```

### Build
```bash
# Build for Chrome (default)
yarn build

# Build for Firefox
yarn build:firefox

# Build for Edge
yarn build:edge
```

### Load Unpacked (Chrome/Edge)
1. Run `yarn build`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `extension/dist` directory

### Load Unpacked (Firefox)
1. Run `yarn build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `extension/dist` directory

## Environment Variables

The extension requires the following environment variable to be set in the main app:

- `EXTENSION_ORIGINS` - Comma-separated list of extension origins for CORS (e.g., `chrome-extension://abcdefghijklmnoporst,moz-extension://abcdefghijklmnopqrstuvwxyz`)

## Permissions
- `activeTab` - Access to the current tab for context menu actions
- `scripting` - Execute scripts on pages
- `storage` - Store user session and settings
- `sidePanel` - Show results in a side panel

## Key Features
- Right-click context menu on images to upscale
- Drag and drop images into the popup
- Side panel for before/after preview
- Auth bridge for seamless login
- Credits display and usage tracking
