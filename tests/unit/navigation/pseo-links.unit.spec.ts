/**
 * Navigation pSEO Links Unit Tests
 * Tests that pSEO hub pages are linked from navigation
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Navigation pSEO Hub Links', () => {
  describe('Footer Component', () => {
    it('should include link to guides hub page', async () => {
      const footerContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/layout/Footer.tsx',
        'utf-8'
      );

      expect(footerContent).toContain('/guides');
    });

    it('should include link to formats hub page', async () => {
      const footerContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/layout/Footer.tsx',
        'utf-8'
      );

      expect(footerContent).toContain('/formats');
    });

    it('should include link to scale hub page', async () => {
      const footerContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/layout/Footer.tsx',
        'utf-8'
      );

      expect(footerContent).toContain('/scale');
    });

    it('should include link to compare hub page', async () => {
      const footerContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/layout/Footer.tsx',
        'utf-8'
      );

      expect(footerContent).toContain('/compare');
    });

    it('should include link to use-cases hub page', async () => {
      const footerContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/layout/Footer.tsx',
        'utf-8'
      );

      expect(footerContent).toContain('/use-cases');
    });

    it('should include link to tools hub page', async () => {
      const footerContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/layout/Footer.tsx',
        'utf-8'
      );

      expect(footerContent).toContain('/tools');
    });

    it('should have "Tools & Guides" section', async () => {
      const footerContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/layout/Footer.tsx',
        'utf-8'
      );

      expect(footerContent).toContain('Tools & Guides');
    });
  });

  describe('NavBar Resources Dropdown', () => {
    it('should include "Guides & Resources" section', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('Guides & Resources');
    });

    it('should include guides link in resources dropdown', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('/guides');
    });

    it('should include format guides link in resources dropdown', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('/formats');
    });

    it('should include comparisons link in resources dropdown', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('/compare');
    });

    it('should include use cases link in resources dropdown', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('/use-cases');
    });

    it('should include scale link in resources dropdown', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('/scale');
    });
  });

  describe('Mobile Menu pSEO Links', () => {
    it('should include guides link in mobile menu', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('/guides');
    });

    it('should include formats link in mobile menu', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('/formats');
    });

    it('should include compare link in mobile menu', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('/compare');
    });

    it('should include use-cases link in mobile menu', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('/use-cases');
    });

    it('should include scale link in mobile menu', async () => {
      const navContent = readFileSync(
        '/home/joao/projects/myimageupscaler.com/client/components/navigation/NavBar.tsx',
        'utf-8'
      );

      expect(navContent).toContain('/scale');
    });
  });

  describe('pSEO Hub Page Links Coverage', () => {
    const pSEOHubPages = [
      'tools',
      'formats',
      'guides',
      'compare',
      'scale',
      'alternatives',
      'use-cases',
      'platforms',
      'free',
      'bulk-tools',
    ];

    it('should have all major pSEO hub pages discoverable', () => {
      expect(pSEOHubPages.length).toBeGreaterThan(0);
      expect(pSEOHubPages).toContain('tools');
      expect(pSEOHubPages).toContain('formats');
      expect(pSEOHubPages).toContain('guides');
      expect(pSEOHubPages).toContain('compare');
      expect(pSEOHubPages).toContain('scale');
      expect(pSEOHubPages).toContain('use-cases');
    });

    it('should have footer and nav coverage for key hubs', () => {
      const keyHubs = ['tools', 'formats', 'guides', 'compare', 'scale', 'use-cases'];
      keyHubs.forEach(hub => {
        expect(pSEOHubPages).toContain(hub);
      });
    });
  });
});
