/**
 * Side Panel App Component - With Results Display
 * Shows before/after preview of upscaled images
 * Handles upscaling from both popup and context menu
 */

import { useEffect, useState, useCallback } from 'react';
import type { UpscaleProgress, ExtensionMessage, IExtensionSession } from '@extension/shared/types';
import { getSession, updateSession } from '@extension/shared/storage';
import { upscaleImage } from '@extension/shared/api-client';

export default function SidePanel(): JSX.Element {
  const [session, setSession] = useState<IExtensionSession | null>(null);
  const [upscaleState, setUpscaleState] = useState<UpscaleProgress>({
    status: 'idle',
    progress: 0,
  });

  useEffect(() => {
    // Load session on mount
    getSession().then(setSession);
  }, []);

  // Handle upscaling from context menu
  const handleUpscale = useCallback(
    async (imageUrl: string) => {
      if (!session?.accessToken) {
        setUpscaleState({
          status: 'signin_required',
          progress: 0,
          imageUrl,
        });
        return;
      }

      try {
        setUpscaleState({
          status: 'processing',
          progress: 30,
          imageUrl,
        });

        const mimeType = imageUrl.startsWith('data:')
          ? imageUrl.substring(imageUrl.indexOf(':') + 1, imageUrl.indexOf(';'))
          : 'image/png';

        const result = await upscaleImage(imageUrl, mimeType, session.accessToken, {
          qualityTier: 'auto',
          scale: 2,
        });

        setUpscaleState({
          status: 'completed',
          progress: 100,
          imageUrl,
          resultImageUrl: result.imageUrl || result.imageData,
          creditsUsed: result.processing.creditsUsed,
          creditsRemaining: result.processing.creditsRemaining,
        });

        // Update stored credits
        await updateSession({
          creditsRemaining: result.processing.creditsRemaining,
        });
      } catch (error) {
        console.error('Upscale failed:', error);
        setUpscaleState({
          status: 'error',
          progress: 0,
          error: error instanceof Error ? error.message : 'Failed to upscale image',
        });
      }
    },
    [session]
  );

  useEffect(() => {
    // Listen for upscale requests from background or popup
    const handleMessage = (message: ExtensionMessage) => {
      if (message.type === 'PROCESS_UPSCALE_REQUEST') {
        setUpscaleState({
          status: 'uploading',
          progress: 10,
          imageUrl: message.imageUrl,
        });
      } else if (message.type === 'SHOW_UPSCALE_PROGRESS') {
        setUpscaleState({
          status: 'processing',
          progress: 30,
          imageUrl: message.imageUrl,
        });
      } else if (message.type === 'UPSCALE_COMPLETE') {
        setUpscaleState({
          status: 'completed',
          progress: 100,
          imageUrl: message.result.imageUrl || message.result.imageData,
          resultImageUrl: message.result.imageUrl || message.result.imageData,
          creditsUsed: message.result.processing.creditsUsed,
          creditsRemaining: message.result.processing.creditsRemaining,
        });
      } else if (message.type === 'START_UPSCALE' && message.imageUrl) {
        // Start upscaling from context menu
        handleUpscale(message.imageUrl);
      } else if (message.type === 'UPSCALE_ERROR') {
        setUpscaleState({
          status: 'error',
          progress: 0,
          error: message.error,
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleUpscale]);

  const handleDownload = () => {
    if (upscaleState.resultImageUrl) {
      const link = document.createElement('a');
      link.href = upscaleState.resultImageUrl;
      link.download = `upscaled-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleReset = () => {
    setUpscaleState({ status: 'idle', progress: 0 });
  };

  return (
    <div className="sidepanel-container">
      <div className="header">
        <h1>Upscale Result</h1>
        <button onClick={() => window.close()} className="btn-close" aria-label="Close">
          ×
        </button>
      </div>

      {upscaleState.status === 'idle' && (
        <div className="empty-state">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <h2>No image selected</h2>
          <p>Right-click on any image and select &ldquo;Upscale with MyImageUpscaler&rdquo;</p>
          <p className="hint">Or open the popup to drag and drop an image</p>
        </div>
      )}

      {upscaleState.status === 'signin_required' && (
        <div className="signin-required">
          <div className="logo">
            <svg
              width="48"
              height="48"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="32" height="32" rx="8" fill="#3B82F6" />
              <path d="M16 8L20 12H18V16H14V12H12L16 8Z" fill="white" />
              <path d="M8 24L12 20H10V16H6V20H4L8 24Z" fill="white" />
              <path d="M24 24L20 20H22V16H26V20H28L24 24Z" fill="white" />
            </svg>
          </div>
          <h2>Sign In Required</h2>
          <p>You need to sign in to upscale images</p>
          <button
            onClick={() => {
              chrome.tabs.create({
                url: 'https://myimageupscaler.com/extension-auth?action=signin',
              });
            }}
            className="btn-primary"
          >
            Sign In
          </button>
        </div>
      )}

      {(upscaleState.status === 'uploading' || upscaleState.status === 'processing') && (
        <div className="processing-state">
          <div className="spinner" />
          <p>
            {upscaleState.status === 'uploading' ? 'Uploading image...' : 'Processing with AI...'}
          </p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${upscaleState.progress}%` }} />
          </div>
          <p className="progress-text">{upscaleState.progress}%</p>
          <p className="progress-hint">This may take 10-30 seconds...</p>
        </div>
      )}

      {upscaleState.status === 'completed' && upscaleState.resultImageUrl && (
        <div className="result-container">
          <div className="comparison-view">
            <div className="image-group">
              <h3>Before</h3>
              <img src={upscaleState.imageUrl!} alt="Original" />
            </div>
            <div className="image-group">
              <h3>After</h3>
              <img src={upscaleState.resultImageUrl} alt="Upscaled" />
            </div>
          </div>

          {upscaleState.creditsUsed !== undefined && (
            <>
              <div
                className={`credits-info ${upscaleState.creditsRemaining !== undefined && upscaleState.creditsRemaining < 10 ? 'credits-low' : ''}`}
              >
                <span>
                  Credits used: <strong>{upscaleState.creditsUsed}</strong>
                </span>
                <span>
                  Remaining: <strong>{upscaleState.creditsRemaining}</strong>
                </span>
              </div>
              {upscaleState.creditsRemaining !== undefined &&
                upscaleState.creditsRemaining < 10 && (
                  <div className="credits-cta">
                    <p className="credits-warning">Low credits remaining!</p>
                    <button
                      onClick={() => {
                        chrome.tabs.create({ url: 'https://myimageupscaler.com/pricing' });
                      }}
                      className="btn-primary btn-small"
                    >
                      Get More Credits
                    </button>
                  </div>
                )}
            </>
          )}

          <div className="result-actions">
            <button onClick={handleDownload} className="btn-primary">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </button>
            <button onClick={handleReset} className="btn-secondary">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
                <polyline points="17 8 12 4 7 8" />
              </svg>
              Upscale Another
            </button>
          </div>
        </div>
      )}

      {upscaleState.status === 'error' && (
        <div className="error-state">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <h2>Upscale Failed</h2>
          <p>{upscaleState.error}</p>
          <button onClick={handleReset} className="btn-secondary">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
