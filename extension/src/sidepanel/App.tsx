/**
 * Side Panel App Component
 * Shows before/after preview of upscaled images
 */

import { useEffect, useState } from 'react';
import type { UpscaleProgress } from '@extension/shared/types';

export default function SidePanel(): JSX.Element {
  const [upscaleState, setUpscaleState] = useState<UpscaleProgress>({
    status: 'idle',
    progress: 0,
  });

  useEffect(() => {
    // Listen for upscale requests from background or popup
    const handleMessage = (message: any) => {
      if (message.type === 'PROCESS_UPSCALE_REQUEST') {
        setUpscaleState({
          status: 'uploading',
          progress: 10,
          imageUrl: message.imageUrl,
        });
        // Will implement actual upscale in Phase 3
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  return (
    <div className="sidepanel-container">
      <div className="header">
        <h1>Upscale Result</h1>
        <button
          onClick={() => chrome.sidePanel.setOptions({ open: false })}
          className="btn-close"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {upscaleState.status === 'idle' && (
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <h2>No image selected</h2>
          <p>Right-click on any image and select "Upscale with MyImageUpscaler"</p>
        </div>
      )}

      {upscaleState.status === 'uploading' && (
        <div className="processing-state">
          <div className="spinner" />
          <p>Uploading image...</p>
        </div>
      )}

      {upscaleState.status === 'completed' && upscaleState.resultImageUrl && (
        <div className="result-container">
          <div className="comparison-view">
            <div className="image-group">
              <h3>Before</h3>
              <img src={upscaleState.imageUrl} alt="Original" />
            </div>
            <div className="image-group">
              <h3>After</h3>
              <img src={upscaleState.resultImageUrl} alt="Upscaled" />
            </div>
          </div>
          <div className="result-actions">
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = upscaleState.resultImageUrl!;
                link.download = `upscaled-${Date.now()}.png`;
                link.click();
              }}
              className="btn-primary"
            >
              Download
            </button>
            <button
              onClick={() => setUpscaleState({ status: 'idle', progress: 0 })}
              className="btn-secondary"
            >
              Upscale Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
