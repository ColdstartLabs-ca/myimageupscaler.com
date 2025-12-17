'use client';

import Workspace from '@client/components/features/workspace/Workspace';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Upload and enhance your images with AI-powered upscaling
        </p>
      </div>

      {/* Workspace with Upload Dropzone */}
      <Workspace />
    </div>
  );
}
