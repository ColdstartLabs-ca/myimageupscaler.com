import type { CrxManifest } from '@crxjs/vite-plugin';

const manifest: CrxManifest = {
  manifest_version: 3,
  name: 'MyImageUpscaler - AI Image Upscaler',
  version: '1.0.0',
  description: 'Upscale images from anywhere on the web with AI',
  permissions: [
    'activeTab',
    'scripting',
    'storage',
    'sidePanel',
  ],
  host_permissions: [
    'http://localhost:3000/*',
    'https://myimageupscaler.com/*',
    'https://*.myimageupscaler.com/*',
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'icon-16.png',
      '32': 'icon-32.png',
      '48': 'icon-48.png',
      '128': 'icon-128.png',
    },
  },
  icons: {
    '16': 'icon-16.png',
    '32': 'icon-32.png',
    '48': 'icon-48.png',
    '128': 'icon-128.png',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  content_scripts: [
    {
      matches: ['http://localhost:3000/extension-auth*', 'https://myimageupscaler.com/extension-auth*'],
      js: ['src/content-scripts/auth-bridge.ts'],
      run_at: 'document_end',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['src/content-scripts/*'],
      matches: ['http://localhost:3000/*', 'https://myimageupscaler.com/*'],
    },
  ],
  commands: {
    'upscale-last-image': {
      suggested_key: {
        default: 'Ctrl+Shift+U',
        mac: 'Command+Shift+U',
      },
      description: 'Upscale the last hovered image',
    },
  },
};

export default manifest;
