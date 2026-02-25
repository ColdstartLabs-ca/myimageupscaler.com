/**
 * Homepage Performance Tests
 *
 * Verifies that the hero section is server-rendered and image preloads
 * reference the correct v2 filenames. These checks guard against regressions
 * that would cause the LCP element to shift back to client-rendered JS.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd());

describe('Homepage Performance — Phase 1', () => {
  describe('Image preloads', () => {
    it('should preload bird-after-v2.webp (not the non-v2 filename)', () => {
      const layoutPath = join(ROOT, 'app/[locale]/layout.tsx');
      const source = readFileSync(layoutPath, 'utf-8');

      expect(source).toContain('bird-after-v2.webp');
      expect(source).not.toMatch(/href="\/before-after\/bird-after\.webp"/);
    });

    it('should preload bird-before-v2.webp (not the non-v2 filename)', () => {
      const layoutPath = join(ROOT, 'app/[locale]/layout.tsx');
      const source = readFileSync(layoutPath, 'utf-8');

      expect(source).toContain('bird-before-v2.webp');
      expect(source).not.toMatch(/href="\/before-after\/bird-before\.webp"/);
    });

    it('should have fetchPriority="high" on both preload links', () => {
      const layoutPath = join(ROOT, 'app/[locale]/layout.tsx');
      const source = readFileSync(layoutPath, 'utf-8');

      const preloadMatches = source.match(/rel="preload"[\s\S]*?fetchPriority="high"/g) ?? [];
      expect(preloadMatches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Server-rendered hero content', () => {
    it('should have HeroSection imported in page.tsx (server component)', () => {
      const pagePath = join(ROOT, 'app/[locale]/page.tsx');
      const source = readFileSync(pagePath, 'utf-8');

      expect(source).toContain("import { HeroSection }");
      expect(source).toContain('<HeroSection />');
    });

    it('HeroSection component should NOT have "use client" directive', () => {
      const heroPath = join(ROOT, 'client/components/landing/HeroSection.tsx');
      const source = readFileSync(heroPath, 'utf-8');

      // Must NOT be a client component — it is the server-rendered hero
      expect(source).not.toMatch(/^['"]use client['"]/m);
    });

    it('HeroSection should render an h1 element with hero title translation', () => {
      const heroPath = join(ROOT, 'client/components/landing/HeroSection.tsx');
      const source = readFileSync(heroPath, 'utf-8');

      expect(source).toContain('<h1');
      expect(source).toContain("t('heroTitle')");
    });

    it('HeroSection should use getTranslations from next-intl/server', () => {
      const heroPath = join(ROOT, 'client/components/landing/HeroSection.tsx');
      const source = readFileSync(heroPath, 'utf-8');

      expect(source).toContain("from 'next-intl/server'");
      expect(source).toContain('getTranslations');
    });

    it('HeroActions should be a client component', () => {
      const actionsPath = join(ROOT, 'client/components/landing/HeroActions.tsx');
      const source = readFileSync(actionsPath, 'utf-8');

      expect(source).toMatch(/^['"]use client['"]/m);
    });

    it('HomePageClient should not contain the hero h1 anymore', () => {
      const clientPath = join(ROOT, 'client/components/pages/HomePageClient.tsx');
      const source = readFileSync(clientPath, 'utf-8');

      // The hero h1 should have been removed from the client component
      expect(source).not.toContain("t('heroTitle')");
      expect(source).not.toContain("t('heroSubtitle')");
    });

    it('page.tsx should render HeroSection outside of Suspense (immediately visible)', () => {
      const pagePath = join(ROOT, 'app/[locale]/page.tsx');
      const source = readFileSync(pagePath, 'utf-8');

      // HeroSection must appear before any Suspense wrapping HomePageClient
      const heroPos = source.indexOf('<HeroSection />');
      const suspensePos = source.indexOf('<Suspense');

      expect(heroPos).toBeGreaterThan(-1);
      expect(suspensePos).toBeGreaterThan(-1);
      // HeroSection comes before the Suspense boundary
      expect(heroPos).toBeLessThan(suspensePos);
    });
  });

  describe('CSS animation', () => {
    it('should define heroFadeIn keyframes in index.css', () => {
      const cssPath = join(ROOT, 'client/styles/index.css');
      const source = readFileSync(cssPath, 'utf-8');

      expect(source).toContain('@keyframes heroFadeIn');
      expect(source).toContain('.animate-hero-fade-in');
    });

    it('HeroSection should apply animate-hero-fade-in CSS class', () => {
      const heroPath = join(ROOT, 'client/components/landing/HeroSection.tsx');
      const source = readFileSync(heroPath, 'utf-8');

      expect(source).toContain('animate-hero-fade-in');
    });
  });
});

describe('Homepage Performance — Phase 3', () => {
  describe('Color contrast (WCAG AA)', () => {
    it('should have WCAG AA compliant muted text color', () => {
      const cssPath = join(ROOT, 'client/styles/index.css');
      const source = readFileSync(cssPath, 'utf-8');

      // Extract --color-text-muted value (format: "R G B")
      const match = source.match(/--color-text-muted:\s*([\d]+)\s+([\d]+)\s+([\d]+)\s*;/);
      expect(match).not.toBeNull();

      const [, rStr, gStr, bStr] = match!;
      const r = parseInt(rStr, 10);
      const g = parseInt(gStr, 10);
      const b = parseInt(bStr, 10);

      // Background is --color-bg-base: 10 10 31
      const bgR = 10;
      const bgG = 10;
      const bgB = 31;

      // WCAG relative luminance formula
      const linearize = (c: number): number => {
        const sRGB = c / 255;
        return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
      };

      const luminance = (lr: number, lg: number, lb: number): number =>
        0.2126 * linearize(lr) + 0.7152 * linearize(lg) + 0.0722 * linearize(lb);

      const L_text = luminance(r, g, b);
      const L_bg = luminance(bgR, bgG, bgB);

      const lighter = Math.max(L_text, L_bg);
      const darker = Math.min(L_text, L_bg);
      const contrastRatio = (lighter + 0.05) / (darker + 0.05);

      // WCAG AA requires 4.5:1 for normal text
      expect(contrastRatio).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('Homepage Performance — Phase 4', () => {
  describe('Stripe resource hints', () => {
    it('should not have preconnect to stripe on layout (only dns-prefetch)', () => {
      const layoutPath = join(ROOT, 'app/[locale]/layout.tsx');
      const source = readFileSync(layoutPath, 'utf-8');

      // Must NOT have preconnect to stripe — preconnect opens a TCP socket immediately
      // on every page load even if the user never visits checkout, wasting resources
      // and blocking bfcache restoration.
      expect(source).not.toMatch(/rel="preconnect"[^>]*stripe/);
      expect(source).not.toMatch(/href="https:\/\/js\.stripe\.com"[^>]*rel="preconnect"/);

      // dns-prefetch is acceptable — it resolves DNS lazily without opening a socket
      expect(source).toContain('rel="dns-prefetch"');
      expect(source).toContain('https://js.stripe.com');
    });
  });
});

describe('Homepage Performance — Phase 5', () => {
  describe('Tailwind content paths', () => {
    it('should not include legacy src paths in tailwind content', () => {
      const configPath = join(ROOT, 'tailwind.config.js');
      const source = readFileSync(configPath, 'utf-8');

      // These are vestiges from a Vite template and must be removed.
      // The project is Next.js — keeping them causes Tailwind to scan a
      // non-existent directory on every build.
      expect(source).not.toContain("'./index.html'");
      expect(source).not.toContain('"./index.html"');
      expect(source).not.toContain("'./src/");
      expect(source).not.toContain('"./src/');
    });
  });

  describe('Google Fonts preconnects', () => {
    it('should not have preconnect to fonts.googleapis.com (fonts are self-hosted via next/font)', () => {
      const layoutPath = join(ROOT, 'app/[locale]/layout.tsx');
      const source = readFileSync(layoutPath, 'utf-8');

      // next/font self-hosts Inter and DM_Sans — preconnecting to Google Fonts
      // opens an unnecessary TCP connection on every page load.
      expect(source).not.toMatch(/preconnect[^>]*fonts\.googleapis\.com/);
      expect(source).not.toMatch(/fonts\.googleapis\.com[^>]*preconnect/);
    });

    it('should not have preconnect to fonts.gstatic.com (fonts are self-hosted via next/font)', () => {
      const layoutPath = join(ROOT, 'app/[locale]/layout.tsx');
      const source = readFileSync(layoutPath, 'utf-8');

      expect(source).not.toMatch(/preconnect[^>]*fonts\.gstatic\.com/);
      expect(source).not.toMatch(/fonts\.gstatic\.com[^>]*preconnect/);
    });

    it('should still use next/font for Inter and DM_Sans (self-hosted)', () => {
      const layoutPath = join(ROOT, 'app/[locale]/layout.tsx');
      const source = readFileSync(layoutPath, 'utf-8');

      expect(source).toContain("from 'next/font/google'");
      expect(source).toContain('Inter');
      expect(source).toContain('DM_Sans');
    });
  });
});

describe('Homepage Performance — Post-Audit Fixes', () => {
  describe('CSP allows analytics scripts', () => {
    it('should allow analytics.ahrefs.com in script-src', () => {
      const cspPath = join(ROOT, 'shared/config/security.ts');
      const source = readFileSync(cspPath, 'utf-8');

      expect(source).toContain('analytics.ahrefs.com');
      // Must be in the script-src section
      const scriptSrcMatch = source.match(/'script-src':\s*\[[\s\S]*?\]/);
      expect(scriptSrcMatch).not.toBeNull();
      expect(scriptSrcMatch![0]).toContain('analytics.ahrefs.com');
    });

    it('should allow analytics.ahrefs.com in connect-src (for API event calls)', () => {
      const cspPath = join(ROOT, 'shared/config/security.ts');
      const source = readFileSync(cspPath, 'utf-8');

      // Ahrefs analytics sends POST requests to analytics.ahrefs.com/api/event
      // which requires connect-src permission in addition to script-src
      const connectSrcMatch = source.match(/'connect-src':\s*\[[\s\S]*?\]/);
      expect(connectSrcMatch).not.toBeNull();
      expect(connectSrcMatch![0]).toContain('analytics.ahrefs.com');
    });

    it('should allow static.cloudflareinsights.com in script-src', () => {
      const cspPath = join(ROOT, 'shared/config/security.ts');
      const source = readFileSync(cspPath, 'utf-8');

      expect(source).toContain('static.cloudflareinsights.com');
      const scriptSrcMatch = source.match(/'script-src':\s*\[[\s\S]*?\]/);
      expect(scriptSrcMatch).not.toBeNull();
      expect(scriptSrcMatch![0]).toContain('static.cloudflareinsights.com');
    });
  });

  describe('Favicon — no 404s', () => {
    it('should not reference favicon-16x16.png (file does not exist)', () => {
      const layoutPath = join(ROOT, 'app/[locale]/layout.tsx');
      const source = readFileSync(layoutPath, 'utf-8');
      expect(source).not.toContain('favicon-16x16.png');
    });

    it('should not reference favicon-32x32.png (file does not exist)', () => {
      const layoutPath = join(ROOT, 'app/[locale]/layout.tsx');
      const source = readFileSync(layoutPath, 'utf-8');
      expect(source).not.toContain('favicon-32x32.png');
    });

    it('should not reference non-existent PNG icons in manifest.ts', () => {
      const manifestPath = join(ROOT, 'app/manifest.ts');
      const source = readFileSync(manifestPath, 'utf-8');
      expect(source).not.toContain('favicon-16x16.png');
      expect(source).not.toContain('favicon-32x32.png');
      expect(source).not.toContain('android-chrome-192x192.png');
      expect(source).not.toContain('android-chrome-512x512.png');
    });
  });

  describe('LCP anchor — server-rendered hero image', () => {
    it('should have a server-rendered img tag with the hero after image in HeroSection', () => {
      const heroPath = join(ROOT, 'client/components/landing/HeroSection.tsx');
      const source = readFileSync(heroPath, 'utf-8');

      // Native <img> (not Next.js Image) must be in server HTML for LCP
      expect(source).toContain('<img');
      expect(source).toContain('bird-after-v2.webp');
      expect(source).toContain('fetchPriority="high"');
    });

    it('should disable Next.js DevTools in production (removes 223KB unused JS chunk)', () => {
      const configPath = join(ROOT, 'next.config.js');
      const source = readFileSync(configPath, 'utf-8');

      expect(source).toContain('devIndicators: false');
    });

    it('should use webpack alias to replace next-devtools with shim in production', () => {
      const configPath = join(ROOT, 'next.config.js');
      const source = readFileSync(configPath, 'utf-8');

      // Must use webpack to alias the full DevTools bundle (800KB source) to the shim (~3KB)
      // in production client builds. devIndicators: false alone doesn't prevent bundling.
      expect(source).toContain('next/dist/compiled/next-devtools');
      expect(source).toContain('dev-overlay.shim.js');
      // Must only apply in non-dev, non-server builds
      expect(source).toContain('!dev && !isServer');
    });
  });
});

describe('Homepage Performance — Phase 2', () => {
  describe('Code-split heavy components', () => {
    it('should lazy-load AmbientBackground with next/dynamic', () => {
      const clientPath = join(ROOT, 'client/components/pages/HomePageClient.tsx');
      const source = readFileSync(clientPath, 'utf-8');

      // Must use next/dynamic, not a static import
      expect(source).not.toMatch(
        /^import\s*\{[^}]*AmbientBackground[^}]*\}\s*from\s*['"]@client\/components\/landing\/AmbientBackground['"]/m,
      );
      expect(source).toContain("import dynamic from 'next/dynamic'");
      expect(source).toContain('AmbientBackground');
      expect(source).toMatch(/dynamic\s*\(/);
      // Must be loaded with ssr: false (purely decorative, no SSR value)
      expect(source).toContain('ssr: false');
    });
  });

  describe('Bundle optimisation config', () => {
    it('should include framer-motion in optimizePackageImports', () => {
      const configPath = join(ROOT, 'next.config.js');
      const source = readFileSync(configPath, 'utf-8');

      // Verify experimental.optimizePackageImports contains framer-motion
      expect(source).toContain('optimizePackageImports');
      expect(source).toContain('framer-motion');

      // Confirm both keys appear close together (i.e. framer-motion is inside the array)
      const optimizeIdx = source.indexOf('optimizePackageImports');
      const framerIdx = source.indexOf("'framer-motion'", optimizeIdx);
      expect(framerIdx).toBeGreaterThan(optimizeIdx);
    });
  });
});
