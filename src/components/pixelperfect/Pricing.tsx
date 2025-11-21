import React from 'react';
import { Check } from 'lucide-react';
import Button from './Button';

const tiers = [
  {
    name: 'Free Tier',
    price: '$0',
    period: '/mo',
    description: 'For testing and personal use.',
    features: [
      '10 images per month',
      '2x & 4x Upscaling',
      'Basic Enhancement',
      'No watermark',
      '5MB file limit',
    ],
    cta: 'Start for Free',
    variant: 'outline' as const,
  },
  {
    name: 'Starter',
    price: '$9',
    period: '/mo',
    description: 'For hobbyists and occasional sellers.',
    features: [
      '100 images per month',
      'All Upscaling Options',
      'Full Enhancement Suite',
      'Priority Queue',
      '64MP file support',
    ],
    cta: 'Start Free Trial',
    variant: 'secondary' as const,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mo',
    description: 'For power sellers and creators.',
    features: [
      '500 images per month',
      'Batch processing (up to 50)',
      'Text Preservation Mode',
      'Credit rollover',
      'API Access (Beta)',
    ],
    recommended: true,
    cta: 'Get Started',
    variant: 'primary' as const,
  },
];

const Pricing: React.FC = () => {
  return (
    <section id="pricing" className="py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Professional quality enhancement at prosumer prices.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {tiers.map(tier => (
            <div
              key={tier.name}
              className={`
                relative flex flex-col p-8 bg-white rounded-2xl shadow-sm border 
                ${tier.recommended ? 'border-indigo-600 ring-2 ring-indigo-600 ring-opacity-50 scale-105 z-10' : 'border-slate-200'}
              `}
            >
              {tier.recommended && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-medium uppercase tracking-wide">
                  Target Tier
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-slate-900">{tier.name}</h3>
                <p className="text-slate-500 text-sm mt-2">{tier.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-slate-900">{tier.price}</span>
                <span className="text-slate-500">{tier.period}</span>
              </div>

              <ul className="space-y-4 mb-8 flex-1">
                {tier.features.map(feature => (
                  <li key={feature} className="flex items-start text-slate-600">
                    <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button variant={tier.variant} className="w-full">
                {tier.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// eslint-disable-next-line import/no-default-export
export default Pricing;
