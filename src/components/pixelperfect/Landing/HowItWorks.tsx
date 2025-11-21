import React from 'react';
import { UploadCloud, Wand2, Download, ArrowRight } from 'lucide-react';

const steps = [
  {
    id: 1,
    name: 'Upload',
    description: 'Drag & drop your images. We support high-res input up to 50MB via API.',
    icon: UploadCloud,
  },
  {
    id: 2,
    name: 'Process',
    description: 'Our AI reconstructs details, corrects lighting, and sharpens edges instantly.',
    icon: Wand2,
  },
  {
    id: 3,
    name: 'Download',
    description: 'Get your 4K result. Export in PNG for lossless quality or efficient WebP.',
    icon: Download,
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section id="how-it-works" className="py-24 bg-slate-50 border-y border-slate-200/60">
       <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="text-center mb-20">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl mb-4">How it works</h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">Transform your workflow in three simple steps. No complex settings, just results.</p>
        </div>

        <div className="relative">
          {/* Connecting Line (Desktop) */}
          <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-indigo-200 to-transparent -z-10 -translate-y-full"></div>

          <div className="grid grid-cols-1 gap-12 md:grid-cols-3 relative z-10">
            {steps.map((step, index) => (
              <div key={step.id} className="group relative flex flex-col items-center text-center">
                
                {/* Icon Bubble */}
                <div className="relative mb-8">
                    <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white border border-slate-100 shadow-xl group-hover:scale-110 group-hover:border-indigo-200 transition-all duration-300 z-10 relative">
                        <step.icon className="h-10 w-10 text-indigo-600" strokeWidth={1.5} />
                    </div>
                    {/* Number Badge */}
                    <div className="absolute -top-3 -right-3 h-8 w-8 bg-indigo-600 rounded-full text-white font-bold flex items-center justify-center border-4 border-slate-50 shadow-sm z-20">
                        {step.id}
                    </div>
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-3">{step.name}</h3>
                <p className="text-slate-600 leading-relaxed px-4">{step.description}</p>
                
                {/* Mobile Arrow */}
                {index < steps.length - 1 && (
                    <ArrowRight className="md:hidden mt-8 text-slate-300" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action Area */}
        <div className="mt-20 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Systems operational
            </div>
        </div>
      </div>
    </section>
  );
};

// eslint-disable-next-line import/no-default-export
export default HowItWorks;