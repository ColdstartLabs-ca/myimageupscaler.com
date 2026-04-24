/**
 * Popup App Component
 * Main entry point for the extension popup UI
 */

import { useEffect, useState } from 'react';
import { getSession, isAuthenticated } from '@extension/shared/storage';
import type { IExtensionSession } from '@extension/shared/types';

export default function App(): JSX.Element {
  const [session, setSession] = useState<IExtensionSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      try {
        const currentSession = await getSession();
        setSession(currentSession);
      } catch (error) {
        console.error('Failed to load session:', error);
        setSession(null);
      } finally {
        setLoading(false);
      }
    }
    loadSession();
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
        <div className="credits">
          <span className="credits-count">{session.creditsRemaining}</span>
          <span className="credits-label">credits</span>
        </div>
      </div>

      <div className="upload-area">
        <input
          type="file"
          id="file-input"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              // Handle file upload - will be implemented in Phase 3
              console.log('File selected:', file.name);
            }
          }}
        />
        <label htmlFor="file-input" className="upload-button">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p>Drop image or click to upload</p>
        </label>
      </div>

      <div className="actions">
        <button
          onClick={() => chrome.sidePanel.open()}
          className="btn-secondary"
        >
          Open Side Panel
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
