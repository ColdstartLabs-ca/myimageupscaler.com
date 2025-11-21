'use client';

import Features from '@/components/pixelperfect/Landing/Features';
import HowItWorks from '@/components/pixelperfect/Landing/HowItWorks';
import Pricing from '@/components/pixelperfect/Pricing';
import Workspace from '@/components/pixelperfect/Workspace/Workspace';
import { ArrowRight, Zap } from 'lucide-react';

export function HomePageClient(): JSX.Element {
  // Auth redirects are now handled server-side in middleware
  // Authenticated users will never reach this component - they're redirected to /dashboard

  return (
    <main className="flex-grow bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-700">
      {/* Hero Section */}
      <section className="relative pt-20 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
        {/* Background Gradients - Enhanced with dynamic light effects */}
        <div className="absolute inset-0 -z-10 h-full w-full bg-white bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-br from-indigo-200/60 via-violet-200/40 to-purple-200/60 blur-[150px] -z-10 rounded-full pointer-events-none animate-pulse-slow"></div>
        <div className="absolute top-20 right-10 w-72 h-72 bg-indigo-400/20 blur-[100px] -z-10 rounded-full pointer-events-none animate-float"></div>
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-violet-400/20 blur-[120px] -z-10 rounded-full pointer-events-none animate-float-delayed"></div>

        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8 relative">
          {/* Badge - with glassmorphism */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-md border border-indigo-200/50 shadow-lg shadow-indigo-100/50 text-xs font-semibold text-indigo-600 mb-8 animate-fade-in hover:shadow-xl hover:shadow-indigo-200/60 hover:border-indigo-300/60 transition-all duration-300 cursor-default group">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
            <span className="group-hover:scale-105 transition-transform">v2.0 Now Available</span>
            <span className="w-px h-3 bg-indigo-200/50 mx-1"></span>
            <span className="text-slate-600 group-hover:text-slate-700 transition-colors">
              Enhanced Generation
            </span>
          </div>

          <h1 className="text-6xl font-black tracking-tight text-slate-900 sm:text-7xl md:text-8xl mb-6 max-w-5xl mx-auto leading-[1.05] animate-fade-in-up">
            Upscale Images <br className="hidden sm:block" />
            <span className="relative inline-block text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 animate-gradient">
              For Professional Use
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-xl sm:text-2xl text-slate-600 leading-relaxed font-light animate-fade-in-up animation-delay-200">
            Enhance resolution, remove noise, and restore details in seconds.
            <br />
            The only upscaler designed to{' '}
            <span className="relative text-slate-900 font-bold after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-1 after:bg-gradient-to-r after:from-indigo-500 after:to-violet-500 after:rounded-full">
              preserve text and logos
            </span>{' '}
            perfectly.
          </p>

          <div className="mt-12 flex items-center justify-center gap-4 text-sm font-medium text-slate-500 animate-fade-in-up animation-delay-400">
            <div className="flex -space-x-3 hover:space-x-1 transition-all duration-300">
              {[1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 overflow-hidden shadow-md hover:scale-110 hover:z-10 transition-all duration-300"
                >
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} alt="User" />
                </div>
              ))}
            </div>
            <p className="text-base">
              <span className="font-bold text-slate-900">10,000+</span> businesses
            </p>
          </div>
        </div>
      </section>

      {/* Main Application Workspace */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-24 relative z-10 animate-fade-in-up animation-delay-600">
        {/* Visual cue pointing to workspace - enhanced */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <span className="text-xs font-semibold text-indigo-600 tracking-wide uppercase animate-pulse">
            Try it now
          </span>
          <ArrowRight className="rotate-90 text-indigo-400 animate-bounce" size={20} />
        </div>

        {/* Workspace with glassmorphism container */}
        <div className="relative p-1 rounded-3xl bg-gradient-to-br from-indigo-500/20 via-violet-500/20 to-purple-500/20">
          <div className="rounded-[22px] bg-white/95 backdrop-blur-xl shadow-2xl shadow-indigo-500/10 border border-white/50 overflow-hidden">
            <Workspace />
          </div>
        </div>
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
                Professional image enhancement for businesses. We use advanced generative models to
                reconstruct lost details while keeping brand assets intact.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-6">Product</h3>
              <ul className="space-y-4">
                <li>
                  <a href="#features" className="hover:text-indigo-400 transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-indigo-400 transition-colors">
                    How it Works
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-indigo-400 transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-indigo-400 transition-colors">
                    API Docs
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-6">Legal</h3>
              <ul className="space-y-4">
                <li>
                  <a href="#" className="hover:text-indigo-400 transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-indigo-400 transition-colors">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-indigo-400 transition-colors">
                    Cookie Policy
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-16 border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p>&copy; 2025 PixelPerfect AI. All rights reserved.</p>
            <div className="flex gap-6">{/* Social icons placeholder */}</div>
          </div>
        </div>
      </footer>
    </main>
  );
}
