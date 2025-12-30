'use client';

import { BookOpen, Mail, MessageCircle } from 'lucide-react';
import { clientEnv } from '@shared/config/env';

export default function SupportPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">Help & Support</h1>
        <p className="text-muted-foreground mt-1">Get help with {clientEnv.APP_NAME}</p>
      </div>

      {/* Support Options */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Documentation */}
        <div className="bg-surface rounded-xl border border-white/10 p-6 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/10 transition-all">
          <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-4">
            <BookOpen size={24} className="text-accent" />
          </div>
          <h2 className="font-semibold text-white mb-2">Documentation</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Learn how to use {clientEnv.APP_NAME} with our comprehensive guides
          </p>
          <button className="text-accent text-sm font-medium hover:text-accent-hover">
            Browse docs
          </button>
        </div>

        {/* FAQ */}
        <div className="bg-surface rounded-xl border border-white/10 p-6 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/10 transition-all">
          <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-4">
            <MessageCircle size={24} className="text-accent" />
          </div>
          <h2 className="font-semibold text-white mb-2">FAQ</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Find answers to commonly asked questions
          </p>
          <button className="text-accent text-sm font-medium hover:text-accent-hover">
            View FAQ
          </button>
        </div>
      </div>

      {/* Contact Support */}
      <div className="bg-surface rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center">
            <Mail size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Contact Support</h2>
            <p className="text-sm text-muted-foreground">Get in touch with our team</p>
          </div>
        </div>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1">Subject</label>
            <input
              type="text"
              placeholder="What do you need help with?"
              className="w-full px-4 py-2 bg-surface-light border border-white/10 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent text-white placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">Message</label>
            <textarea
              rows={4}
              placeholder="Describe your issue or question..."
              className="w-full px-4 py-2 bg-surface-light border border-white/10 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent resize-none text-white placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Send Message
          </button>
        </form>
      </div>
    </div>
  );
}
