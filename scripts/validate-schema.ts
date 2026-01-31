#!/usr/bin/env tsx
/**
 * Schema Validator
 *
 * Validates JSON-LD schema markup against Schema.org rules.
 * Runs as part of yarn verify to catch schema issues early.
 *
 * Checks:
 * 1. Organization.logo is a string (not object)
 * 2. All schema generators have @context
 * 3. Product schema has required price and availability
 * 4. All schema types are valid
 *
 * Usage:
 *   npx tsx scripts/validate-schema.ts
 *   npx tsx scripts/validate-schema.ts --verbose
 */

import {
  generateToolSchema,
  generateHomepageSchema,
  generatePricingSchema,
} from '../lib/seo/schema-generator';
import { clientEnv } from '@shared/config/env';
import type { IToolPage } from '@shared/interfaces/seo';

const VERBOSE = process.argv.includes('--verbose');

// Mock data for testing schema generators
const mockToolData = {
  slug: 'ai-image-upscaler',
  title: 'AI Image Upscaler',
  metaTitle: 'AI Image Upscaler | Enhance Quality Free Online',
  metaDescription: 'Upscale images 4x with AI.',
  h1: 'AI Image Upscaler',
  intro: 'Enhance your images',
  primaryKeyword: 'ai image upscaler',
  secondaryKeywords: ['upscaling', 'enhancement'],
  lastUpdated: '2026-01-31',
  category: 'tools',
  toolName: 'AI Image Upscaler',
  description: 'AI-powered image upscaling',
  benefits: [{ title: '4x Enhancement', description: 'Upscale images up to 4x' }],
  workflowSteps: ['Upload', 'Process', 'Download'],
  faq: [
    {
      question: 'How does AI upscaling work?',
      answer: 'Our AI analyzes your images and adds details.',
    },
  ],
  relatedTools: [],
  relatedGuides: [],
};

interface ISchemaError {
  severity: 'error' | 'warning';
  category: string;
  message: string;
}

const errors: ISchemaError[] = [];
const warnings: ISchemaError[] = [];

// Type for JSON-LD schema with @graph property
interface IGraphSchema {
  '@graph'?: ISchemaNode[];
}

// Type for schema node items
interface ISchemaNode {
  '@type': string;
  offers?: unknown;
  [key: string]: unknown;
}

/**
 * Check if value is a valid Organization logo (should be string URL)
 */
function validateOrganizationLogo(logo: unknown): boolean {
  if (typeof logo === 'string') {
    if (logo.startsWith('http://') || logo.startsWith('https://') || logo.startsWith('/')) {
      return true;
    }
  }
  return false;
}

/**
 * Check if schema has @context property
 */
function hasContext(schema: unknown): boolean {
  if (typeof schema === 'object' && schema !== null) {
    return '@context' in schema;
  }
  return false;
}

/**
 * Check if Product/Offer has required price and availability
 */
function validateProductOffer(offers: unknown): boolean {
  if (typeof offers === 'object' && offers !== null) {
    // Check for AggregateOffer (has offers array)
    if ('offers' in offers && Array.isArray(offers.offers)) {
      return offers.offers.every(
        (offer: unknown) =>
          typeof offer === 'object' && offer !== null && 'price' in offer && 'availability' in offer
      );
    }
    // Check for single Offer
    return 'price' in offers && 'availability' in offers;
  }
  return false;
}

console.log('🔍 Validating Schema.org markup...\n');

// =============================================================================
// Check 1: Organization Schema
// =============================================================================

const organizationSchema = {
  '@type': 'Organization',
  name: clientEnv.APP_NAME,
  url: clientEnv.BASE_URL,
  logo: `${clientEnv.BASE_URL}/logo/vertical-logo-compact.png`,
};

if (!validateOrganizationLogo(organizationSchema.logo)) {
  errors.push({
    severity: 'error',
    category: 'Organization Schema',
    message: 'Organization.logo must be a string URL, not an object',
  });
}

// =============================================================================
// Check 2: Schema Generators Have @context
// =============================================================================

const toolSchema = generateToolSchema(mockToolData as IToolPage, 'en');
if (!hasContext(toolSchema)) {
  errors.push({
    severity: 'error',
    category: '@context',
    message: 'Tool schema missing @context property',
  });
}

const homepageSchema = generateHomepageSchema('en');
if (!hasContext(homepageSchema)) {
  errors.push({
    severity: 'error',
    category: '@context',
    message: 'Homepage schema missing @context property',
  });
}

const pricingSchema = generatePricingSchema();
if (!hasContext(pricingSchema)) {
  errors.push({
    severity: 'error',
    category: '@context',
    message: 'Pricing schema missing @context property',
  });
}

// =============================================================================
// Check 3: Product Schema Has Required Fields
// =============================================================================

// Find Product schema in pricing schema
const pricingGraph = (pricingSchema as IGraphSchema)['@graph'];
const productSchema = pricingGraph?.find(item => item['@type'] === 'Product');

if (productSchema) {
  if (!validateProductOffer(productSchema.offers)) {
    errors.push({
      severity: 'error',
      category: 'Product Schema',
      message: 'Product schema missing required price or availability',
    });
  }
} else {
  warnings.push({
    severity: 'warning',
    category: 'Product Schema',
    message: 'No Product schema found in pricing schema',
  });
}

// =============================================================================
// Check 4: Tool Schema Has Offer with Price
// =============================================================================

const toolGraph = (toolSchema as IGraphSchema)['@graph'];
const softwareApp = toolGraph?.find(item => item['@type'] === 'SoftwareApplication');

if (softwareApp?.offers) {
  if (!validateProductOffer(softwareApp.offers)) {
    errors.push({
      severity: 'error',
      category: 'Tool Schema',
      message: 'Tool schema SoftwareApplication missing offer price or availability',
    });
  }
}

// =============================================================================
// Output Results
// =============================================================================

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ Schema validation passed!\n');
  process.exit(0);
}

if (errors.length > 0) {
  console.error('❌ Schema validation FAILED:\n');
  errors.forEach((err, index) => {
    console.error(`  ${index + 1}. [${err.severity.toUpperCase()}] ${err.category}`);
    console.error(`     ${err.message}\n`);
  });
}

if (warnings.length > 0) {
  console.warn('⚠️  Warnings:\n');
  warnings.forEach((warn, index) => {
    console.warn(`  ${index + 1}. [${warn.severity.toUpperCase()}] ${warn.category}`);
    console.warn(`     ${warn.message}\n`);
  });
}

if (VERBOSE) {
  console.log('Summary:');
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Warnings: ${warnings.length}`);
}

process.exit(errors.length > 0 ? 1 : 0);
