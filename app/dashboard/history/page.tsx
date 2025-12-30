'use client';

import { Clock, Image } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">History</h1>
        <p className="text-muted-foreground mt-1">View your previously processed images</p>
      </div>

      {/* History List */}
      <div className="bg-surface rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <Clock size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-primary">Recent Uploads</h2>
            <p className="text-sm text-muted-foreground">Your image processing history</p>
          </div>
        </div>

        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-surface-light flex items-center justify-center mx-auto mb-4">
            <Image size={32} className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">No images processed yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your processed images will appear here
          </p>
        </div>
      </div>
    </div>
  );
}
