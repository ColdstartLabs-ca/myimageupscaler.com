'use client';

import { BookOpen, Mail, MessageCircle } from 'lucide-react';

export default function SupportPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Help & Support</h1>
        <p className="text-slate-500 mt-1">
          Get help with PixelPerfect AI
        </p>
      </div>

      {/* Support Options */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Documentation */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 hover:border-indigo-200 hover:shadow-md transition-all">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
            <BookOpen size={24} className="text-indigo-600" />
          </div>
          <h2 className="font-semibold text-slate-900 mb-2">Documentation</h2>
          <p className="text-sm text-slate-500 mb-4">
            Learn how to use PixelPerfect AI with our comprehensive guides
          </p>
          <button className="text-indigo-600 text-sm font-medium hover:text-indigo-700">
            Browse docs
          </button>
        </div>

        {/* FAQ */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 hover:border-indigo-200 hover:shadow-md transition-all">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-4">
            <MessageCircle size={24} className="text-purple-600" />
          </div>
          <h2 className="font-semibold text-slate-900 mb-2">FAQ</h2>
          <p className="text-sm text-slate-500 mb-4">
            Find answers to commonly asked questions
          </p>
          <button className="text-indigo-600 text-sm font-medium hover:text-indigo-700">
            View FAQ
          </button>
        </div>
      </div>

      {/* Contact Support */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <Mail size={20} className="text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Contact Support</h2>
            <p className="text-sm text-slate-500">Get in touch with our team</p>
          </div>
        </div>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              placeholder="What do you need help with?"
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Message
            </label>
            <textarea
              rows={4}
              placeholder="Describe your issue or question..."
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Send Message
          </button>
        </form>
      </div>
    </div>
  );
}
