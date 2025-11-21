'use client';

import Features from '@/components/pixelperfect/Landing/Features';
import HowItWorks from '@/components/pixelperfect/Landing/HowItWorks';
import Pricing from '@/components/pixelperfect/Pricing';
import Workspace from '@/components/pixelperfect/Workspace/Workspace';
import { ArrowRight, Zap } from 'lucide-react';

export function HomePageClient(): JSX.Element {
  return (
    <main className="flex-grow bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-700">
      {/* Hero Section */}
      <section className="relative pt-20 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute inset-0 -z-10 h-full w-full bg-white bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-indigo-100/40 blur-[120px] -z-10 rounded-full pointer-events-none"></div>

        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8 relative">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-indigo-100 shadow-sm text-xs font-medium text-indigo-600 mb-8 animate-fade-in hover:border-indigo-200 transition-colors cursor-default">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500"></span>
            v2.0 Now Available
            <span className="w-px h-3 bg-indigo-100 mx-1"></span>
            <span className="text-slate-500">Enhanced Generation</span>
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl md:text-7xl mb-6 max-w-4xl mx-auto leading-[1.1]">
            Upscale Images <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">For Professional Use</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl text-slate-600 leading-relaxed">
            Enhance resolution, remove noise, and restore details in seconds.
            The only upscaler designed to <span className="text-slate-900 font-semibold">preserve text and logos</span> perfectly.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4 text-sm font-medium text-slate-500">
            <div className="flex -space-x-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 overflow-hidden">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} alt="User" />
                </div>
              ))}
            </div>
            <p>Trusted by 10,000+ businesses</p>
          </div>
        </div>
      </section>

      {/* Main Application Workspace */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-24 relative z-10">
        {/* Visual cue pointing to workspace */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-slate-300 animate-bounce">
          <ArrowRight className="rotate-90" />
        </div>
        <Workspace />
      </section>

      {/* Landing Page Sections */}
      <Features />
      <HowItWorks />
      <Pricing />

      <footer className="bg-slate-950 py-16 text-slate-400 text-sm border-t border-slate-800">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 text-white mb-6">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <Zap size={18} fill="currentColor" className="text-white" />
                </div>
                <span className="text-xl font-bold tracking-tight">PixelPerfect AI</span>
              </div>
              <p className="max-w-sm text-slate-400 leading-relaxed">
                Professional image enhancement for businesses. We use advanced generative models to reconstruct lost details while keeping brand assets intact.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-6">Product</h3>
              <ul className="space-y-4">
                <li><a href="#features" className="hover:text-indigo-400 transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-indigo-400 transition-colors">How it Works</a></li>
                <li><a href="#pricing" className="hover:text-indigo-400 transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">API Docs</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-6">Legal</h3>
              <ul className="space-y-4">
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-indigo-400 transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-16 border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p>&copy; 2025 PixelPerfect AI. All rights reserved.</p>
            <div className="flex gap-6">
              {/* Social icons placeholder */}
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
