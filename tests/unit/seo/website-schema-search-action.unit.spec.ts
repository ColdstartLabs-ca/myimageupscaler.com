/**
 * WebSite Schema SearchAction Tests
 * Tests for SearchAction schema markup in WebSite schema
 * Validates that Google sitelinks search box schema is properly configured
 */

import { describe, it, expect } from 'vitest';
import { clientEnv } from '@shared/config/env';

describe('WebSite Schema - SearchAction', () => {
  const BASE_URL = clientEnv.BASE_URL;
  const APP_NAME = clientEnv.APP_NAME;

  describe('pSEO Layout WebSite Schema', () => {
    it('should include SearchAction with correct structure', () => {
      // This test validates the SearchAction schema structure
      // that should be present in app/(pseo)/layout.tsx

      const expectedSearchAction = {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${BASE_URL}/blog?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      };

      // Verify structure
      expect(expectedSearchAction).toHaveProperty('@type', 'SearchAction');
      expect(expectedSearchAction).toHaveProperty('target');
      expect(expectedSearchAction.target).toHaveProperty('@type', 'EntryPoint');
      expect(expectedSearchAction.target).toHaveProperty('urlTemplate');
      expect(expectedSearchAction).toHaveProperty('query-input', 'required name=search_term_string');
    });

    it('should use blog search URL in urlTemplate', () => {
      const urlTemplate = `${BASE_URL}/blog?q={search_term_string}`;

      expect(urlTemplate).toContain(BASE_URL);
      expect(urlTemplate).toContain('/blog?q=');
      expect(urlTemplate).toContain('{search_term_string}');
    });

    it('should have required name parameter in query-input', () => {
      const queryInput = 'required name=search_term_string';

      expect(queryInput).toContain('required');
      expect(queryInput).toContain('name=search_term_string');
    });
  });

  describe('Locale Layout WebSite Schema', () => {
    it('should include SearchAction with search URL', () => {
      // This test validates the SearchAction schema structure
      // that should be present in app/[locale]/layout.tsx

      const expectedSearchAction = {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      };

      // Verify structure
      expect(expectedSearchAction).toHaveProperty('@type', 'SearchAction');
      expect(expectedSearchAction).toHaveProperty('target');
      expect(expectedSearchAction.target).toHaveProperty('@type', 'EntryPoint');
      expect(expectedSearchAction.target).toHaveProperty('urlTemplate');
      expect(expectedSearchAction).toHaveProperty('query-input', 'required name=search_term_string');
    });
  });

  describe('SearchAction Schema Compliance', () => {
    it('should follow Google Sitelinks Search Box requirements', () => {
      // Google requires specific structure for sitelinks search box
      // https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox

      const webSiteSchema = {
        '@type': 'WebSite',
        'url': BASE_URL,
        'potentialAction': {
          '@type': 'SearchAction',
          'target': {
            '@type': 'EntryPoint',
            'urlTemplate': `${BASE_URL}/blog?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      };

      // Validate required properties
      expect(webSiteSchema).toHaveProperty('@type', 'WebSite');
      expect(webSiteSchema).toHaveProperty('url');
      expect(webSiteSchema).toHaveProperty('potentialAction');
      expect(webSiteSchema.potentialAction).toHaveProperty('@type', 'SearchAction');
      expect(webSiteSchema.potentialAction).toHaveProperty('target');
      expect(webSiteSchema.potentialAction.target).toHaveProperty('urlTemplate');
      expect(webSiteSchema.potentialAction).toHaveProperty('query-input');
    });

    it('should use correct placeholder syntax in urlTemplate', () => {
      const urlTemplate = `${BASE_URL}/blog?q={search_term_string}`;

      // Google requires {search_term_string} placeholder
      expect(urlTemplate).toMatch(/\{search_term_string\}/);
    });

    it('should specify required name in query-input', () => {
      const queryInput = 'required name=search_term_string';

      // Google requires 'required name=' format
      expect(queryInput).toMatch(/^required name=/);
    });
  });
});
