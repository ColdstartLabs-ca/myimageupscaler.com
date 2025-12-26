import { clientEnv } from '@shared/config/env';
import Link from 'next/link';
import { JSX } from 'react';

export const Footer = (): JSX.Element => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-main text-text-muted mt-auto border-t border-white/5">
      <div className="max-w-[1600px] mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-white font-black text-2xl tracking-tighter">{clientEnv.APP_NAME}<span className="text-accent">.</span></h3>
            <p className="text-sm text-text-muted font-medium leading-relaxed max-w-xs">
              AI-powered image upscaling and enhancement for professionals and creators. Precision-engineered for 2025.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">Product</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li>
                <Link href="/pricing" className="hover:text-accent transition-colors">
                  Pricing Plans
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-accent transition-colors">
                  Latest Updates
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">Support</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li>
                <Link href="/help" className="hover:text-accent transition-colors">
                  Help Center
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
                  className="hover:text-accent transition-colors"
                >
                  Contact Support
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">Legal</h4>
            <ul className="space-y-4 text-sm font-medium">
              <li>
                <Link href="/privacy" className="hover:text-accent transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-accent transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs font-medium text-text-muted">
            © {currentYear} {clientEnv.APP_NAME}. All rights reserved. Precision made for creators.
          </p>
          <div className="flex gap-8 text-xs font-black uppercase tracking-widest">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
            <Link href="/help" className="hover:text-white transition-colors">
              Help
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
