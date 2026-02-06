/**
 * Meta Tag Generator and Validation Module
 * Based on PRD-PSEO-04 Section 3.1: Meta Tag Patterns
 * Provides patterns and validation for meta titles and descriptions
 */

import type { PSEOCategory } from './url-utils';
import { clientEnv } from '@shared/config/env';

const APP_NAME = clientEnv.APP_NAME;

export interface IMetaPattern {
  title: string;
  description: string;
  titleMaxLength: number;
  descriptionMaxLength: number;
}

export interface IMetaValidation {
  valid: boolean;
  issues: string[];
  titleLength: number;
  descriptionLength: number;
}

/**
 * Meta tag patterns by category
 * Variables in {braces} should be replaced with actual values
 */
export const META_PATTERNS: Record<PSEOCategory, IMetaPattern> = {
  tools: {
    title: `{ToolName} - {Benefit} Free | ${APP_NAME}`,
    description:
      '{Action} with AI. Free online {ToolType} that {UniqueValue}. No watermarks, fast processing. Try ${APP_NAME} now.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  formats: {
    title: `Upscale {Format} Images to {Resolution} | ${APP_NAME}`,
    description:
      'Upscale {Format} images with AI. Free online {Format} upscaler that preserves quality. Convert low-res {Format} to HD instantly.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  compare: {
    title: `${APP_NAME} vs {Competitor}: Which {ToolType} is Best?`,
    description: `Compare ${APP_NAME} and {Competitor} for {UseCase}. See features, pricing, pros & cons. Find the best {ToolType} for your needs.`,
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  alternatives: {
    title: `Best {Competitor} Alternatives in 2025 | ${APP_NAME}`,
    description: `Looking for {Competitor} alternatives? Compare top {ToolType} tools including ${APP_NAME}. Free options, pricing, and features compared.`,
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  'use-cases': {
    title: `{Industry} Image Enhancement - {UseCase} | ${APP_NAME}`,
    description:
      'Enhance {Industry} images with AI. Perfect for {UseCase}. Upscale product photos, listings, and more. Free to start.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  guides: {
    title: `How to {Action} - Step-by-Step Guide | ${APP_NAME}`,
    description:
      'Learn how to {Action} with this comprehensive guide. {Benefit}. Free tips and tools included.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  free: {
    title: `Free {ToolName} - No Registration Required | ${APP_NAME}`,
    description:
      'Use our free {ToolName} online. No watermarks, no sign-up required. {Benefit}. Try it now!',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  scale: {
    title: `Upscale Images to {Scale} - Free {Resolution} Upscaler | ${APP_NAME}`,
    description:
      'Upscale images to {Scale} resolution with AI. Free online tool for {Resolution} enhancement. Perfect for {UseCase}.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  'bulk-tools': {
    title: `Free {ToolName} - Process Multiple Images at Once | ${APP_NAME}`,
    description:
      '{Action} multiple images at once with our free {ToolName}. Batch process up to {MaxFiles} images. Works in your browser - no upload required.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  platforms: {
    title: `{Platform} Image Enhancement - AI Upscaling | ${APP_NAME}`,
    description:
      'Enhance {Platform} images with AI. Upscale and improve quality from {Platform} exports. Perfect for {UseCase}.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  content: {
    title: `Upscale {ContentType} - AI Enhancement Free | ${APP_NAME}`,
    description:
      'Upscale and enhance {ContentType} with AI. Improve quality, restore details, and get professional results. Free online tool.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  'ai-features': {
    title: `{FeatureName} - AI-Powered {FeatureType} | ${APP_NAME}`,
    description:
      '{FeatureName} using advanced AI technology. {Description}. Free online tool with instant results.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  'device-use': {
    title: `{Device} {UseCase} Upscaler - Free Online Tool | ${APP_NAME}`,
    description:
      'Upscale images on {Device} for {UseCase}. AI-powered enhancement optimized for {Device} workflows. Free to try.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  'format-scale': {
    title: `{Format} {ScaleFactor} Upscaler - Free Online Tool | ${APP_NAME}`,
    description:
      'Upscale {Format} images by {ScaleFactor} with AI. {FormatDescription} Free online tool for {ScaleExpectations}.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  'platform-format': {
    title: `{Platform} {Format} Upscaler - Free Enhancement Tool | ${APP_NAME}`,
    description:
      'Enhance {Platform} images in {Format} format. {PlatformDescription} Free online tool for {FormatDescription}.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  'photo-restoration': {
    title: `{RestorationType} - AI Photo Restoration Free | ${APP_NAME}`,
    description:
      '{Description} Restore old, faded, or damaged photos with AI. Free online photo restoration tool.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  'camera-raw': {
    title: `{CameraBrand} {RawFormat} Upscaler - AI Enhancement | ${APP_NAME}`,
    description:
      '{Description} Enhance {RawFormat} files from {CameraBrand} cameras. AI-powered RAW processing.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  'industry-insights': {
    title: `{Industry} Image Enhancement - AI Solutions | ${APP_NAME}`,
    description:
      '{Description} AI-powered image enhancement for {Industry} applications. Improve quality and efficiency.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
  'device-optimization': {
    title: `{Platform} Image Optimization - Performance Solutions | ${APP_NAME}`,
    description:
      '{Description} Optimize images for {Platform} devices. Improve loading times and user experience.',
    titleMaxLength: 60,
    descriptionMaxLength: 160,
  },
};

/**
 * Truncate text to max length with ellipsis
 * Preserves word boundaries when possible
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Try to truncate at word boundary
  const truncated = text.substring(0, maxLength - 3);
  const lastSpaceIndex = truncated.lastIndexOf(' ');

  if (lastSpaceIndex > maxLength * 0.7) {
    // If we found a space in the last 30% of the string, truncate there
    return truncated.substring(0, lastSpaceIndex) + '...';
  }

  // Otherwise truncate at exact length
  return truncated + '...';
}

/**
 * Enforce meta title and description length limits
 * Truncates if necessary to stay within SEO best practices
 */
export function enforceMetaLengths(
  title: string,
  description: string
): { title: string; description: string } {
  return {
    title: truncateText(title, 60),
    description: truncateText(description, 160),
  };
}

/**
 * Validate meta title and description
 * Returns validation result with issues if any
 */
export function validateMeta(title: string, description: string): IMetaValidation {
  const issues: string[] = [];

  // Title validation
  if (title.length < 30) {
    issues.push('Title too short (min 30 chars)');
  }
  if (title.length > 60) {
    issues.push(`Title too long: ${title.length}/60 chars`);
  }

  // Description validation
  if (description.length < 120) {
    issues.push('Description too short (min 120 chars)');
  }
  if (description.length > 160) {
    issues.push(`Description too long: ${description.length}/160 chars`);
  }

  return {
    valid: issues.length === 0,
    issues,
    titleLength: title.length,
    descriptionLength: description.length,
  };
}

/**
 * Get recommended meta length ranges
 */
export function getMetaLengthRanges(): {
  title: { min: number; ideal: number; max: number };
  description: { min: number; ideal: number; max: number };
} {
  return {
    title: { min: 30, ideal: 50, max: 60 },
    description: { min: 120, ideal: 155, max: 160 },
  };
}
