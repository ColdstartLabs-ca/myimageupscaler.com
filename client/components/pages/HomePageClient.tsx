'use client';

import Features from '@client/components/pixelperfect/Landing/Features';
import HowItWorks from '@client/components/pixelperfect/Landing/HowItWorks';
import { Pricing } from '@client/components/pixelperfect/Pricing';
import Workspace from '@client/components/pixelperfect/Workspace/Workspace';
import { useModalStore } from '@client/store/modalStore';
import { ArrowRight, Sparkles } from 'lucide-react';
import Image from 'next/image';

export function HomePageClient(): JSX.Element {
  const { openAuthModal } = useModalStore();

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
                  <Image
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`}
                    alt={`User avatar ${i}`}
                    width={40}
                    height={40}
                    className="w-full h-full"
                    unoptimized
                  />
                </div>
              ))}
            </div>
            <p className="text-base">
              <span className="font-bold text-slate-900">10,000+</span> businesses
            </p>
          </div>

          {/* Hero CTA Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up animation-delay-600">
            <button
              onClick={() => openAuthModal('register')}
              className="group inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-700 hover:via-violet-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 shadow-xl shadow-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
              Start Free Trial
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => openAuthModal('login')}
              className="inline-flex items-center gap-2 px-8 py-4 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl transition-all duration-300 border border-slate-200 hover:border-slate-300 shadow-lg hover:shadow-xl"
            >
              Sign In
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-500 animate-fade-in-up animation-delay-600">
            No credit card required &bull; 10 free credits included
          </p>
        </div>
      </section>

      {/* Main Application Workspace */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-24 relative z-10 animate-fade-in-up animation-delay-600">
        {/* Visual cue pointing to workspace - enhanced */}
        <div
          className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          aria-hidden="true"
        >
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

      {/* Final CTA Section */}
      <section className="relative py-24 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700"></div>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.05%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-30"></div>

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Ready to Transform Your Images?
          </h2>
          <p className="text-xl text-indigo-100 mb-10 max-w-2xl mx-auto">
            Join thousands of professionals using PixelPerfect AI to enhance their images. Start
            your free trial today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => openAuthModal('register')}
              className="group inline-flex items-center gap-2 px-8 py-4 bg-white hover:bg-slate-50 text-indigo-600 font-semibold rounded-xl transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
            >
              <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
              Create Free Account
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all duration-300 border border-white/20 hover:border-white/30 backdrop-blur-sm"
            >
              View Pricing
            </a>
          </div>
          <p className="mt-6 text-sm text-indigo-200">
            No credit card required &bull; 10 free credits &bull; Cancel anytime
          </p>
        </div>
      </section>
    </main>
  );
}
