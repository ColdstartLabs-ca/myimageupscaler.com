'use client';

import { Clock, Image } from 'lucide-react';

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">History</h1>
        <p className="text-slate-500 mt-1">
          View your previously processed images
        </p>
      </div>

      {/* History List */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Clock size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Recent Uploads</h2>
            <p className="text-sm text-slate-500">Your image processing history</p>
          </div>
        </div>

        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Image size={32} className="text-slate-400" />
          </div>
          <p className="text-slate-500">No images processed yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Your processed images will appear here
          </p>
        </div>
      </div>
    </div>
  );
}
