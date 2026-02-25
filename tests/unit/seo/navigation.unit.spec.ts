/**
 * Navigation Internal Links Tests
 *
 * Guards against regressions in the primary navigation that distributes
 * link equity from every page to high-value tool hub pages.
 *
 * These links are critical for internal linking SEO: removing or changing them
 * silently kills link equity flow to the target pages. Tests are the safety net.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const navBarPath = path.resolve(ROOT, 'client/components/navigation/NavBar.tsx');
const navBarSource = fs.readFileSync(navBarPath, 'utf-8');

// ============================================================================
// Primary Navigation - /tools Hub Link
// ============================================================================

describe('Primary Navigation - /tools Hub Link', () => {
  it('NavBar component file exists', () => {
    expect(fs.existsSync(navBarPath)).toBe(true);
  });

  it('Primary nav should contain a link to /tools in desktop dropdown', () => {
    // The desktop dropdown should have a link to /tools
    expect(navBarSource).toContain("href={localizedPath('/tools')}");
  });

  it('Desktop Tools dropdown should have "All Tools" as the first item', () => {
    // The dropdown should have "allTools" translation key for the /tools link
    // This should appear in the dropdown before individual tool links
    const toolsDropdownStart = navBarSource.indexOf("isToolsDropdownOpen &&");
    const imageCompressorLink = navBarSource.indexOf(
      "href={localizedPath('/tools/compress/image-compressor')}"
    );

    // Find the /tools link position
    const allToolsLink = navBarSource.indexOf("href={localizedPath('/tools')}");

    // The /tools link should exist and come before the individual tool links
    expect(allToolsLink).toBeGreaterThan(-1);
    expect(allToolsLink).toBeLessThan(imageCompressorLink);
  });

  it('Mobile menu should contain a link to /tools', () => {
    // The mobile menu should also have a link to /tools
    // Find the mobile menu section by looking for the mobile menu Tools section
    const mobileMenuSection = navBarSource.indexOf('isMobileMenuOpen &&');
    expect(mobileMenuSection).toBeGreaterThan(-1);

    // Get the mobile menu portion of the file
    const mobileMenuContent = navBarSource.slice(mobileMenuSection);

    // The mobile menu should have a link to /tools
    expect(mobileMenuContent).toContain("href={localizedPath('/tools')}");
  });

  it('Mobile menu /tools link should appear before individual tool links', () => {
    // Find the mobile menu Tools section
    const mobileMenuToolsStart = navBarSource.indexOf(
      "p className=\"px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2\""
    );
    const mobileMenuToolsSection = navBarSource.slice(mobileMenuToolsStart);

    // Find positions of links in the mobile menu Tools section
    const allToolsLink = mobileMenuToolsSection.indexOf(
      "href={localizedPath('/tools')}"
    );
    const imageCompressorLink = mobileMenuToolsSection.indexOf(
      "href={localizedPath('/tools/compress/image-compressor')}"
    );

    // /tools link should come before individual tools
    expect(allToolsLink).toBeGreaterThan(-1);
    expect(allToolsLink).toBeLessThan(imageCompressorLink);
  });

  it('NavBar uses localizedPath helper for all internal links', () => {
    // All internal navigation should use localizedPath for proper locale handling
    const internalLinks = [
      '/tools',
      '/tools/compress/image-compressor',
      '/features',
      '/pricing',
      '/blog',
    ];

    for (const link of internalLinks) {
      expect(navBarSource).toContain(`localizedPath('${link}')`);
    }
  });

  it('NavBar does not use hardcoded colors', () => {
    // Scan for hardcoded hex or rgb colors (should use Tailwind tokens)
    expect(navBarSource).not.toMatch(/#[0-9a-fA-F]{3,6}\b(?!.*\n.*\/\/.*allow)/);
    expect(navBarSource).not.toMatch(/rgb\([^)]*\)(?!.*\n.*\/\/.*allow)/);
  });
});

// ============================================================================
// Translation Keys - nav.allTools
// ============================================================================

describe('Translation Keys - nav.allTools', () => {
  const localesDir = path.resolve(ROOT, 'locales');

  const locales = ['en', 'de', 'es', 'fr', 'it', 'pt', 'ja'];

  it('NavBar uses t("allTools") translation key', () => {
    expect(navBarSource).toContain("t('allTools')");
  });

  for (const locale of locales) {
    it(`Locale ${locale} should have nav.allTools key`, () => {
      const localeFile = path.join(localesDir, locale, 'common.json');
      expect(fs.existsSync(localeFile)).toBe(true);

      const content = fs.readFileSync(localeFile, 'utf-8');
      const json = JSON.parse(content);

      expect(json.nav).toBeDefined();
      expect(json.nav.allTools).toBeDefined();
      expect(json.nav.allTools.length).toBeGreaterThan(0);
    });
  }
});
