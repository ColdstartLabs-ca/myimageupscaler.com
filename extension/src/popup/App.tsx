/**
 * Popup App Component - With Upscale Functionality
 * Main entry point for the extension popup UI
 */

import { useEffect, useState, useCallback } from 'react';
import { getSession, isAuthenticated } from '@extension/shared/storage';
import { fileToBase64 } from '@extension/shared/image-utils';
import { upscaleImage, getCredits } from '@extension/shared/api-client';
import type { IExtensionSession, UpscaleProgress } from '@extension/shared/types';

export default function App(): JSX.Element {
  const [session, setSession] = useState<IExtensionSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [upscaleState, setUpscaleState] = useState<UpscaleProgress>({
    status: 'idle',
    progress: 0,
  });
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const currentSession = await getSession();
        setSession(currentSession);

        // Refresh credits if authenticated
        if (currentSession?.accessToken) {
          try {
            const credits = await getCredits(currentSession.accessToken);
            setSession({ ...currentSession, creditsRemaining: credits });
            await (await import('@extension/shared/storage')).updateSession({ creditsRemaining: credits });
          } catch (error) {
            console.error('Failed to fetch credits:', error);
          }
        }
      } catch (error) {
        console.error('Failed to load session:', error);
        setSession(null);
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!session?.accessToken) {
      alert('Please sign in to upscale images');
      return;
    }

    try {
      setUpscaleState({
        status: 'uploading',
        progress: 10,
        imageUrl: URL.createObjectURL(file),
      });

      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'image/png';

      setUpscaleState(prev => ({ ...prev, status: 'processing', progress: 30 }));

      // Open side panel and show processing there
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.windowId) {
          chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
            // Ignore if side panel is already open
          });
        }
      });

      // Send to side panel for progress tracking
      chrome.runtime.sendMessage({
        type: 'SHOW_UPSCALE_PROGRESS',
        imageUrl: upscaleState.imageUrl,
      });

      const result = await upscaleImage(base64, mimeType, session.accessToken, {
        qualityTier: 'auto',
        scale: 2,
      });

      setUpscaleState({
        status: 'completed',
        progress: 100,
        imageUrl: URL.createObjectURL(file),
        resultImageUrl: result.imageUrl || result.imageData,
        creditsUsed: result.processing.creditsUsed,
        creditsRemaining: result.processing.creditsRemaining,
      });

      // Update stored credits
      await (await import('@extension/shared/storage')).updateSession({
        creditsRemaining: result.processing.creditsRemaining,
      });

      // Send result to side panel
      chrome.runtime.sendMessage({
        type: 'UPSCALE_COMPLETE',
        result,
      });
    } catch (error) {
      console.error('Upscale failed:', error);
      setUpscaleState({
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Failed to upscale image',
      });
    }
  }, [session]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  if (loading) {
    return (
      <div className="popup-container">
        <div className="loading">
          <div className="spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!session?.userId) {
    return (
      <div className="popup-container">
        <div className="auth-prompt">
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#3B82F6"/>
              <path d="M16 8L20 12H18V16H14V12H12L16 8Z" fill="white"/>
              <path d="M8 24L12 20H10V16H6V20H4L8 24Z" fill="white"/>
              <path d="M24 24L20 20H22V16H26V20H28L24 24Z" fill="white"/>
            </svg>
          </div>
          <h2>MyImageUpscaler</h2>
          <p>Sign in to upscale images</p>
          <button
            onClick={() => {
              chrome.tabs.create({ url: 'https://myimageupscaler.com/extension-auth?action=signin' });
              window.close();
            }}
            className="btn-primary"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      const { clearSession } = await import('@extension/shared/storage');
      await clearSession();
      setSession(null);
    }
  };

  if (upscaleState.status === 'processing' || upscaleState.status === 'uploading') {
    return (
      <div className="popup-container">
        <div className="processing-state">
          <div className="spinner" />
          <p>
            {upscaleState.status === 'uploading' ? 'Uploading image...' : 'Processing...'}
          </p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${upscaleState.progress}%` }} />
          </div>
          <p className="progress-text">{upscaleState.progress}%</p>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="header">
        <div className="logo">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#3B82F6"/>
            <path d="M16 8L20 12H18V16H14V12H12L16 8Z" fill="white"/>
            <path d="M8 24L12 20H10V16H6V20H4L8 24Z" fill="white"/>
            <path d="M24 24L20 20H22V16H26V20H28L24 24Z" fill="white"/>
          </svg>
        </div>
        <h1>Upscale</h1>
        <div className="header-actions">
          <button
            onClick={handleSignOut}
            className="btn-icon"
            title="Sign out"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
          <div className={`credits ${session.creditsRemaining < 10 ? 'credits-low' : ''}`}>
            <span className="credits-count">{session.creditsRemaining}</span>
            <span className="credits-label">credits</span>
          </div>
        </div>
      </div>

      <div
        className={`upload-area ${dragActive ? 'drag-active' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          id="file-input"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleFileSelect(file);
            }
          }}
        />
        <label htmlFor="file-input" className="upload-button">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p>{dragActive ? 'Drop image to upscale' : 'Drag & drop or click to upload'}</p>
        </label>
      </div>

      {upscaleState.status === 'error' && (
        <div className="error-state">
          <p className="error-message">{upscaleState.error}</p>
          <button
            onClick={() => setUpscaleState({ status: 'idle', progress: 0 })}
            className="btn-secondary"
          >
            Try Again
          </button>
        </div>
      )}

      <div className="actions">
        <button
          onClick={() => {
            chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
              if (tab?.windowId) {
                chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
              }
            });
          }}
          className="btn-secondary"
        >
          Open Side Panel
        </button>
        <button
          onClick={() => {
            chrome.runtime.openOptionsPage();
            window.close();
          }}
          className="btn-link"
        >
          Settings
        </button>
        <button
          onClick={() => {
            chrome.tabs.create({ url: 'https://myimageupscaler.com/dashboard' });
            window.close();
          }}
          className="btn-link"
        >
          Dashboard
        </button>
      </div>
    </div>
  );
}
