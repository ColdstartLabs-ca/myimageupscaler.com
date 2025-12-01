import React from 'react';
import {
  Type,
  Zap,
  ShieldCheck,
  Image as ImageIcon,
  Sparkles,
  Lock,
  Cpu,
  CheckCircle2,
} from 'lucide-react';

const features = [
  {
    icon: Type,
    name: 'Text Preservation',
    description:
      'Proprietary text detection ensures logos and fonts remain sharp and readable, unlike traditional GANs.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: Zap,
    name: 'Lightning Fast',
    description: 'Optimized processing engine enhances images quickly with advanced AI technology.',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    icon: ShieldCheck,
    name: 'Ethical AI',
    description:
      'Zero-retention policy for enterprise security. We restore faithfully without altering identity or content.',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    icon: ImageIcon,
    name: 'Batch Processing',
    description:
      'Upload 50+ images at once. Smart queuing system handles bulk e-commerce catalogs efficiently.',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
];

const Features: React.FC = () => {
  return (
    <section id="features" className="py-24 bg-white relative overflow-hidden">
      {/* Decorative bg blob */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1/3 h-full bg-slate-50 -z-10 skew-x-12 opacity-50"></div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center mb-16">
          <h2 className="text-base font-bold uppercase tracking-wide text-indigo-600">
            Feature Rich
          </h2>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need for professional results
          </p>
          <p className="mt-6 text-lg text-slate-600 leading-8">
            We combine state-of-the-art generative AI with traditional computer vision to deliver
            the best of both worlds: creativity and fidelity.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map(feature => (
            <div
              key={feature.name}
              className="group relative p-8 bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div
                className={`inline-flex items-center justify-center h-12 w-12 rounded-xl mb-6 ${feature.bg} ${feature.color} group-hover:scale-110 transition-transform duration-300`}
              >
                <feature.icon size={24} strokeWidth={2.5} />
              </div>

              <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors">
                {feature.name}
              </h3>

              <p className="text-slate-600 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Secondary Feature Strip */}
        <div className="mt-20 border-t border-slate-100 pt-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 bg-slate-100 rounded-full text-slate-600">
                <Sparkles size={16} />
              </div>
              <span className="font-semibold text-slate-900">Face Enhancement</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 bg-slate-100 rounded-full text-slate-600">
                <Lock size={16} />
              </div>
              <span className="font-semibold text-slate-900">Secure Processing</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 bg-slate-100 rounded-full text-slate-600">
                <Cpu size={16} />
              </div>
              <span className="font-semibold text-slate-900">Fast Processing</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 bg-slate-100 rounded-full text-slate-600">
                <CheckCircle2 size={16} />
              </div>
              <span className="font-semibold text-slate-900">High Availability</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// eslint-disable-next-line import/no-default-export
export default Features;
