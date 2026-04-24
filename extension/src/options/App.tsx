/**
 * Extension Options/Settings Page
 * Allows users to configure default upscaling settings and sign out
 */

import { useEffect, useState } from 'react';
import type { IExtensionSettings, IExtensionSession } from '@extension/shared/types';
import { getSettings, updateSettings, getSession, clearSession } from '@extension/shared/storage';

type ScaleOption = 2 | 4 | 8;
type TierOption = 'auto' | 'quick' | 'face-restore' | 'hd-upscale' | 'ultra';

const SCALE_OPTIONS: { value: ScaleOption; label: string; description: string }[] = [
  { value: 2, label: '2x', description: 'Double the resolution' },
  { value: 4, label: '4x', description: 'Quadruple the resolution' },
  { value: 8, label: '8x', description: '8x the resolution (slower)' },
];

const TIER_OPTIONS: { value: TierOption; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto', description: 'Automatically choose the best quality tier' },
  { value: 'quick', label: 'Quick', description: 'Faster processing, good quality' },
  { value: 'face-restore', label: 'Face Restore', description: 'Optimized for faces' },
  { value: 'hd-upscale', label: 'HD Upscale', description: 'High definition upscaling' },
  { value: 'ultra', label: 'Ultra', description: 'Maximum quality (slowest)' },
];

export default function Options(): JSX.Element {
  const [settings, setSettings] = useState<IExtensionSettings | null>(null);
  const [session, setSession] = useState<IExtensionSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [currentSettings, currentSession] = await Promise.all([
          getSettings(),
          getSession(),
        ]);
        setSettings(currentSettings);
        setSession(currentSession);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await updateSettings(settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      await clearSession();
      setSession(null);
    }
  };

  if (loading) {
    return (
      <div className="options-container">
        <div className="loading">
          <div className="spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="options-container">
      <div className="header">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#3B82F6"/>
            <path d="M16 8L20 12H18V16H14V12H12L16 8Z" fill="white"/>
            <path d="M8 24L12 20H10V16H6V20H4L8 24Z" fill="white"/>
            <path d="M24 24L20 20H22V16H26V20H28L24 24Z" fill="white"/>
          </svg>
        </div>
        <h1>Settings</h1>
      </div>

      {settings && (
        <div className="settings-content">
          {/* Account Section */}
          <section className="settings-section">
            <h2>Account</h2>
            {session?.userId ? (
              <div className="account-info">
                <p className="credits-display">
                  Credits remaining: <strong>{session.creditsRemaining}</strong>
                </p>
                <button onClick={handleSignOut} className="btn-secondary">
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="account-info">
                <p>Not signed in</p>
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
          </section>

          {/* Default Scale Section */}
          <section className="settings-section">
            <h2>Default Scale</h2>
            <p className="section-description">Choose the default upscaling factor</p>
            <div className="option-group">
              {SCALE_OPTIONS.map((option) => (
                <label key={option.value} className="radio-option">
                  <input
                    type="radio"
                    name="scale"
                    value={option.value}
                    checked={settings.defaultScale === option.value}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultScale: parseInt(e.target.value) as ScaleOption })
                    }
                  />
                  <div className="radio-content">
                    <span className="radio-label">{option.label}</span>
                    <span className="radio-description">{option.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Quality Tier Section */}
          <section className="settings-section">
            <h2>Quality Tier</h2>
            <p className="section-description">Choose the default quality tier</p>
            <div className="option-group">
              {TIER_OPTIONS.map((option) => (
                <label key={option.value} className="radio-option">
                  <input
                    type="radio"
                    name="tier"
                    value={option.value}
                    checked={settings.defaultTier === option.value}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        defaultTier: e.target.value as TierOption,
                      })
                    }
                  />
                  <div className="radio-content">
                    <span className="radio-label">{option.label}</span>
                    <span className="radio-description">{option.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Notifications Section */}
          <section className="settings-section">
            <h2>Notifications</h2>
            <label className="toggle-option">
              <input
                type="checkbox"
                checked={settings.showNotifications}
                onChange={(e) => setSettings({ ...settings, showNotifications: e.target.checked })}
              />
              <span>Show notifications when upscaling completes</span>
            </label>
          </section>

          {/* Save Button */}
          <div className="actions">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
