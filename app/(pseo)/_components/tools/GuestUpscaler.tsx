'use client';

/**
 * GuestUpscaler Component
 *
 * Provides free image upscaling (2x, real-esrgan) for guests without authentication.
 * Limited to 3 uses per day per device with multi-layer server-side protection.
 *
 * Part of the Guest Upscaler pSEO feature (Phase 2).
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Loader2, Sparkles, Lock, ArrowRight, Check, Zap, Download, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { FileUpload } from '@/app/(pseo)/_components/ui/FileUpload';
import { cn } from '@/lib/utils';
import {
  getVisitorId,
  getGuestUsage,
  canProcessAsGuest,
  incrementGuestUsage,
  getRemainingUses,
} from '@/client/utils/guest-fingerprint';

type ProcessingState = 'idle' | 'loading' | 'processing' | 'done' | 'limit-reached' | 'error';

interface IGuestUpscalerProps {
  className?: string;
}

export function GuestUpscaler({ className }: IGuestUpscalerProps): React.ReactElement {
  const [state, setState] = useState<ProcessingState>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingUses, setRemainingUses] = useState(3);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize fingerprint and check usage on mount
  useEffect(() => {
    async function init() {
      try {
        const id = await getVisitorId();
        setVisitorId(id);
        const usage = getGuestUsage();
        setRemainingUses(getRemainingUses(usage));

        if (!canProcessAsGuest(usage)) {
          setState('limit-reached');
        }
      } catch (err) {
        console.error('Fingerprint init failed:', err);
        // Allow usage without fingerprint, server will enforce limits
        setVisitorId('anonymous-' + Date.now());
      }
      setIsInitialized(true);
    }
    init();
  }, []);

  const handleFileSelect = useCallback(
    async (file: File) => {
      // Validate file size (2MB limit for guests)
      if (file.size > 2 * 1024 * 1024) {
        setError('File too large. Guest limit is 2MB. Sign up free for 64MB limit.');
        setState('error');
        return;
      }

      // Check if can process
      const usage = getGuestUsage();
      if (!canProcessAsGuest(usage)) {
        setState('limit-reached');
        return;
      }

      setError(null);
      setState('processing');

      // Create preview
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);

      try {
        // Convert to base64
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Call guest API
        const response = await fetch('/api/upscale/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: base64,
            mimeType: file.type,
            visitorId,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 429) {
            setState('limit-reached');
            return;
          }
          throw new Error(data.error?.message || 'Processing failed');
        }

        // Update usage
        if (visitorId) {
          incrementGuestUsage(visitorId);
        }
        setRemainingUses(prev => Math.max(0, prev - 1));

        setResultUrl(data.imageUrl);
        setState('done');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Processing failed. Please try again.');
        setState('error');
      }
    },
    [visitorId]
  );

  const handleReset = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setResultUrl(null);
    setError(null);

    // Check if can process again
    const usage = getGuestUsage();
    if (!canProcessAsGuest(usage)) {
      setState('limit-reached');
    } else {
      setState('idle');
    }
  }, [previewUrl]);

  // Loading state while initializing
  if (!isInitialized) {
    return (
      <div className={cn('bg-surface rounded-xl p-8 border border-border text-center', className)}>
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-accent" />
        <p className="text-sm text-text-secondary mt-3">Initializing...</p>
      </div>
    );
  }

  // Limit reached state - conversion CTA
  if (state === 'limit-reached') {
    return (
      <div
        className={cn(
          'bg-gradient-to-br from-surface to-surface-light rounded-xl p-8 border border-border text-center',
          className
        )}
      >
        <Lock className="w-12 h-12 mx-auto mb-4 text-accent" />
        <h3 className="text-2xl font-bold text-primary mb-2">Daily Limit Reached</h3>
        <p className="text-text-secondary mb-6">
          You&apos;ve used all 3 free upscales today. Create a free account to continue.
        </p>

        <div className="bg-surface rounded-lg p-4 mb-6 text-left">
          <h4 className="font-semibold text-primary mb-3">Free account includes:</h4>
          <ul className="space-y-2">
            {[
              '10 free credits every month',
              'Up to 8x upscaling',
              '64MB file uploads',
              'No watermarks',
            ].map(feature => (
              <li key={feature} className="flex items-center gap-2 text-sm text-text-secondary">
                <Check className="w-4 h-4 text-success flex-shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <Link href="/?signup=1">
          <button className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
            Create Free Account
            <ArrowRight className="w-4 h-4" />
          </button>
        </Link>

        <p className="text-xs text-text-muted mt-4">
          Or come back tomorrow for 3 more free upscales
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Usage indicator */}
      <div className="flex items-center justify-between bg-surface-light rounded-lg px-4 py-2 border border-border">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          <span className="text-sm text-text-secondary">
            <strong className="text-primary">{remainingUses}</strong> free upscales remaining today
          </span>
        </div>
        <Link href="/?signup=1" className="text-sm text-accent hover:underline">
          Get unlimited
        </Link>
      </div>

      {/* Upload area */}
      {state === 'idle' && (
        <FileUpload
          onFileSelect={handleFileSelect}
          acceptedFormats={['image/jpeg', 'image/png', 'image/webp']}
          maxFileSizeMB={2}
        />
      )}

      {/* Processing state */}
      {state === 'processing' && (
        <div className="bg-surface rounded-lg p-8 border border-border text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-accent" />
          <p className="text-lg font-medium text-primary">Upscaling your image...</p>
          <p className="text-sm text-text-secondary mt-2">This usually takes 5-10 seconds</p>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="bg-error/10 border border-error/20 rounded-lg p-6 text-center">
          <p className="text-error font-medium mb-4">{error}</p>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-text-secondary hover:bg-surface-light transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          {error?.includes('2MB') && (
            <Link href="/?signup=1" className="block text-sm text-accent hover:underline mt-3">
              Sign up free for 64MB uploads
            </Link>
          )}
        </div>
      )}

      {/* Result state */}
      {state === 'done' && previewUrl && resultUrl && (
        <div className="space-y-6">
          {/* Before/After comparison */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">Original</label>
              <div className="relative aspect-square bg-surface rounded-lg overflow-hidden border border-border">
                <Image
                  src={previewUrl}
                  alt="Original"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary mb-2 block">
                Upscaled 2x <span className="text-accent">(with AI)</span>
              </label>
              <div className="relative aspect-square bg-surface rounded-lg overflow-hidden border-2 border-accent">
                <Image src={resultUrl} alt="Upscaled" fill className="object-contain" unoptimized />
              </div>
            </div>
          </div>

          {/* Download + Upgrade CTAs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href={resultUrl}
              download="upscaled-image.png"
              className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-surface hover:bg-surface-light border border-border rounded-lg font-medium text-primary transition-colors gap-2"
            >
              <Download className="w-4 h-4" />
              Download 2x Result
            </a>
            <Link href="/?signup=1" className="flex-1">
              <button className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" />
                Unlock 4x &amp; 8x Upscaling
              </button>
            </Link>
          </div>

          {/* Upgrade benefits */}
          <div className="bg-gradient-to-r from-accent/10 to-transparent rounded-lg p-4 border border-accent/20">
            <p className="text-sm text-text-secondary">
              <strong className="text-primary">Want even better results?</strong> Sign up free to
              unlock 4x and 8x upscaling, larger file uploads, and AI-powered enhancement features.
            </p>
          </div>

          {/* Try another */}
          <button
            onClick={handleReset}
            className="w-full px-4 py-3 text-text-secondary hover:text-primary hover:bg-surface-light rounded-lg transition-colors"
          >
            Try Another Image ({remainingUses} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
