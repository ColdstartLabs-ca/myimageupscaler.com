'use client';

import { useTranslations } from 'next-intl';
import Workspace from '@client/components/features/workspace/Workspace';
import { Zap, Shield, Clock, Image as ImageIcon } from 'lucide-react';

export default function DashboardPage() {
  const t = useTranslations('dashboard');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {/* Workspace with Upload Dropzone */}
      <Workspace />

      {/* Features & Tips Section */}
      <section className="border-t pt-6">
        <h2 className="text-xl font-semibold text-primary mb-4">Get the Most Out of Your Images</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">AI-Powered Enhancement</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Our advanced AI analyzes your image content to intelligently upscale and enhance
                while preserving details, text, and important elements.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Privacy-First Processing</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your images are processed securely and are never stored on our servers. All
                processing happens in real-time with enterprise-grade security.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Fast Results</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Get enhanced images in seconds, not minutes. Our optimized pipeline delivers
                professional results without the wait, perfect for batch processing.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Multiple Formats Supported</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload JPEG, PNG, WebP, and other popular formats. Download your enhanced images in
                high resolution, perfect for print, web, or professional use.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h3 className="font-medium text-foreground mb-2">Pro Tips</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Use the highest quality source image available for best results</li>
            <li>• Batch upload multiple images to save time on large projects</li>
            <li>• Experiment with different enhancement levels to find your optimal settings</li>
            <li>• For e-commerce, consistent enhancement settings improve product photo quality</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
