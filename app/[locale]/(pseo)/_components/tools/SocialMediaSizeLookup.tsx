'use client';

import React, { useState } from 'react';

interface IPlatformSize {
  type: string;
  dimensions: string;
  aspectRatio: string;
}

interface IPlatform {
  name: string;
  sizes: IPlatformSize[];
}

const PLATFORMS: IPlatform[] = [
  {
    name: 'Instagram',
    sizes: [
      { type: 'Square Post', dimensions: '1080x1080', aspectRatio: '1:1' },
      { type: 'Portrait Post', dimensions: '1080x1350', aspectRatio: '4:5' },
      { type: 'Landscape Post', dimensions: '1080x566', aspectRatio: '1.91:1' },
      { type: 'Story/Reel', dimensions: '1080x1920', aspectRatio: '9:16' },
      { type: 'Profile Picture', dimensions: '320x320', aspectRatio: '1:1' },
    ],
  },
  {
    name: 'Facebook',
    sizes: [
      { type: 'Shared Image', dimensions: '1200x630', aspectRatio: '1.91:1' },
      { type: 'Square Post', dimensions: '1200x1200', aspectRatio: '1:1' },
      { type: 'Cover Photo', dimensions: '820x312', aspectRatio: '2.63:1' },
      { type: 'Profile Picture', dimensions: '170x170', aspectRatio: '1:1' },
      { type: 'Story', dimensions: '1080x1920', aspectRatio: '9:16' },
    ],
  },
  {
    name: 'Twitter/X',
    sizes: [
      { type: 'In-Stream Image', dimensions: '1600x900', aspectRatio: '16:9' },
      { type: 'Single Image', dimensions: '1200x675', aspectRatio: '16:9' },
      { type: 'Profile Picture', dimensions: '400x400', aspectRatio: '1:1' },
      { type: 'Header', dimensions: '1500x500', aspectRatio: '3:1' },
    ],
  },
  {
    name: 'LinkedIn',
    sizes: [
      { type: 'Shared Image', dimensions: '1200x627', aspectRatio: '1.91:1' },
      { type: 'Company Cover', dimensions: '1128x191', aspectRatio: '5.9:1' },
      { type: 'Profile Picture', dimensions: '400x400', aspectRatio: '1:1' },
      { type: 'Background', dimensions: '1584x396', aspectRatio: '4:1' },
    ],
  },
  {
    name: 'TikTok',
    sizes: [
      { type: 'Video/Photo', dimensions: '1080x1920', aspectRatio: '9:16' },
      { type: 'Profile Picture', dimensions: '200x200', aspectRatio: '1:1' },
    ],
  },
  {
    name: 'Pinterest',
    sizes: [
      { type: 'Standard Pin', dimensions: '1000x1500', aspectRatio: '2:3' },
      { type: 'Long Pin', dimensions: '1000x2100', aspectRatio: '1:2.1' },
      { type: 'Square Pin', dimensions: '1000x1000', aspectRatio: '1:1' },
    ],
  },
  {
    name: 'YouTube',
    sizes: [
      { type: 'Thumbnail', dimensions: '1280x720', aspectRatio: '16:9' },
      { type: 'Channel Banner', dimensions: '2560x1440', aspectRatio: '16:9' },
      { type: 'Channel Icon', dimensions: '800x800', aspectRatio: '1:1' },
    ],
  },
];

export function SocialMediaSizeLookup(): React.ReactElement {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('Instagram');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const platform = PLATFORMS.find(p => p.name === selectedPlatform);

  const copyToClipboard = async (text: string, index: number): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className="rounded-xl border border-border-primary bg-surface-secondary p-6">
      <h3 className="mb-4 text-xl font-semibold text-text-primary">Social Media Size Reference</h3>

      {/* Platform Selection */}
      <div className="mb-6 flex flex-wrap gap-2">
        {PLATFORMS.map(p => (
          <button
            key={p.name}
            onClick={() => setSelectedPlatform(p.name)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedPlatform === p.name
                ? 'bg-accent-primary text-white'
                : 'bg-surface-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Size Table */}
      {platform && (
        <div className="overflow-hidden rounded-lg border border-border-primary">
          <table className="w-full">
            <thead className="bg-surface-tertiary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                  Dimensions
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                  Ratio
                </th>
                <th className="w-20 px-4 py-3 text-right text-sm font-medium text-text-secondary">
                  Copy
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary bg-surface-primary">
              {platform.sizes.map((size, index) => (
                <tr key={size.type} className="hover:bg-surface-secondary">
                  <td className="px-4 py-3 text-sm text-text-primary">{size.type}</td>
                  <td className="px-4 py-3 font-mono text-sm text-accent-primary">
                    {size.dimensions}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">{size.aspectRatio}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => copyToClipboard(size.dimensions, index)}
                      className="rounded px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
                    >
                      {copiedIndex === index ? 'Copied!' : 'Copy'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-text-muted">
        Click &ldquo;Copy&rdquo; to copy dimensions. Sizes updated December 2025.
      </p>
    </div>
  );
}

export default SocialMediaSizeLookup;
