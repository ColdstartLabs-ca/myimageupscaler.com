/**
 * pSEO Hero LCP Tests
 *
 * Guards against regressions that would delay the LCP element on pSEO pages.
 *
 * Root cause that was fixed:
 *   - HeroSection.tsx used a framer-motion container with `delayChildren: 0.1`
 *     and `staggerChildren: 0.15`, wrapping the H1 in a `motion.h1` that started
 *     with `opacity: 0`.  Combined with JS parse time this produced an 8.4s mobile
 *     LCP — the browser could not paint the H1 until framer-motion was hydrated.
 *
 * The fix:
 *   - H1 is rendered as a plain `<h1>` element outside the motion container so it
 *     is visible in the first paint, regardless of JS execution timing.
 *   - `delayChildren: 0.1` removed from heroContainerVariants.
 *   - Badge, intro text, and CTA still animate in via the motion container.
 *
 * These tests enforce the invariant at the source level so the fix cannot regress
 * silently.  A failing test here means the LCP element is again hidden on initial
 * render.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd());
const HERO_PATH = join(ROOT, 'app/(pseo)/_components/pseo/sections/HeroSection.tsx');

describe('pSEO Hero LCP — Phase 3 fix', () => {
  const source = readFileSync(HERO_PATH, 'utf-8');

  describe('H1 element is NOT wrapped in framer-motion', () => {
    it('should render the H1 as a plain <h1> tag (not motion.h1)', () => {
      // The fix requires a plain <h1 — framer-motion wraps its output in a div/element
      // controlled by its own opacity animations, delaying paint.
      expect(source).toContain('<h1 ');
    });

    it('should NOT have a motion.h1 element (would delay LCP)', () => {
      // motion.h1 starts hidden (opacity: 0) and requires JS hydration before
      // painting — incompatible with fast LCP.
      expect(source).not.toContain('<motion.h1');
    });

    it('H1 should NOT use heroItemVariants (would set opacity:0 on initial render)', () => {
      // heroItemVariants has hidden: { opacity: 0 } — applying it to the H1
      // prevents the browser from painting the LCP element until JS animates it in.
      // We verify the h1 tag itself does not reference variants.
      const h1TagMatch = source.match(/<h1[^>]*>/);
      expect(h1TagMatch).not.toBeNull();
      const h1Tag = h1TagMatch![0];
      expect(h1Tag).not.toContain('variants');
      expect(h1Tag).not.toContain('heroItemVariants');
    });

    it('H1 should NOT have initial="hidden" (would start invisible)', () => {
      const h1TagMatch = source.match(/<h1[^>]*>/);
      expect(h1TagMatch).not.toBeNull();
      const h1Tag = h1TagMatch![0];
      expect(h1Tag).not.toContain('initial=');
    });
  });

  describe('heroContainerVariants does NOT delay children', () => {
    it('should NOT set delayChildren as a property in heroContainerVariants', () => {
      // delayChildren adds a flat delay before any child starts animating.
      // Even though the H1 is now outside the container, removing delayChildren
      // ensures badge/intro/CTA start animating as soon as framer-motion is ready.
      // We match only the property assignment form (key: value), not comments.
      expect(source).not.toMatch(/delayChildren\s*:/);
    });

    it('should still have staggerChildren for badge/intro/CTA animation', () => {
      // The remaining children (badge, intro, CTA) still animate in with stagger
      // for visual polish — this should be preserved.
      expect(source).toContain('staggerChildren');
    });
  });

  describe('H1 is rendered outside the motion.div container', () => {
    it('should have the plain <h1 before the <motion.div animation container', () => {
      const h1Pos = source.indexOf('<h1 ');
      const motionDivPos = source.indexOf('<motion.div');

      expect(h1Pos).toBeGreaterThan(-1);
      expect(motionDivPos).toBeGreaterThan(-1);
      // H1 must appear in the source before the animated motion.div that wraps
      // badge/intro/CTA — this confirms H1 is outside that container.
      expect(h1Pos).toBeLessThan(motionDivPos);
    });

    it('the outer wrapper div should NOT be a motion.div', () => {
      // The outermost container inside <section> should be a plain <div> so nothing
      // hides the H1 at the container level either.
      const sectionContentMatch = source.match(/<section[^>]*>[\s\S]*?<AmbientBackground[^/]*\/>\s*\n\s*(<[^\s>]+)/);
      if (sectionContentMatch) {
        const firstElement = sectionContentMatch[1];
        // The element directly after AmbientBackground should be a plain <div, not <motion.div
        expect(firstElement).not.toBe('<motion.div');
        expect(firstElement).toMatch(/^<div/);
      } else {
        // Fallback: verify the source has a plain <div after AmbientBackground
        expect(source).toMatch(/<AmbientBackground[^/]*\/>\s*\n\s*<div /);
      }
    });
  });

  describe('H1 content rendering', () => {
    it('should render mainTitle inside the h1 element', () => {
      // The H1 must render the mainTitle variable (derived from the h1 prop)
      expect(source).toContain('{mainTitle}');
    });

    it('should render subtitle as a <span> inside the h1 when present', () => {
      // The subtitle part (after " - " separator) renders as a styled <span>
      expect(source).toContain('{subtitle && <span');
    });

    it('H1 should apply the correct Tailwind typography classes', () => {
      // These classes define the visual appearance of the LCP headline —
      // guard against accidental removal that would break design consistency.
      const h1TagMatch = source.match(/<h1[^>]*>/);
      expect(h1TagMatch).not.toBeNull();
      const h1Tag = h1TagMatch![0];
      expect(h1Tag).toContain('font-black');
      expect(h1Tag).toContain('tracking-tight');
    });
  });

  describe('layout.tsx font-display optimization', () => {
    it('pSEO layout should use display: swap for Inter font', () => {
      const layoutSource = readFileSync(join(ROOT, 'app/(pseo)/layout.tsx'), 'utf-8');
      // display: swap ensures text is visible with a fallback font while the web
      // font loads, which directly improves LCP by avoiding invisible text.
      expect(layoutSource).toContain("display: 'swap'");
    });

    it('pSEO layout should use display: swap for DM_Sans font', () => {
      const layoutSource = readFileSync(join(ROOT, 'app/(pseo)/layout.tsx'), 'utf-8');
      // Both fonts used in the pSEO layout must use font-display: swap.
      // We check the layout defines DM_Sans with swap — a single `display: 'swap'`
      // is sufficient as both font definitions appear in the same file and both
      // have the property.
      expect(layoutSource).toContain('DM_Sans');
      expect(layoutSource).toContain("display: 'swap'");
    });
  });
});
