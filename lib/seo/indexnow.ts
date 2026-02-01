/**
 * IndexNow API Integration
 *
 * Submits URLs to IndexNow for faster indexing by search engines.
 * Documentation: https://www.indexnow.org/documentation.html
 *
 * IndexNow is a protocol that allows websites to easily notify search engines
 * about changes to their content. Participating search engines include:
 * - Bing (Microsoft)
 * - Yandex
 * - Google (since November 2021)
 * - Naver (since November 2021)
 * - Seznam.cz (since April 2022)
 * - Yep (since 2023)
 *
 * Usage:
 * ```typescript
 * import { submitUrl, submitBatch, getSubmissionStatus } from '@lib/seo/indexnow';
 *
 * // Submit single URL
 * await submitUrl('https://myimageupscaler.com/blog/new-post');
 *
 * // Submit batch
 * await submitBatch([
 *   'https://myimageupscaler.com/blog/post-1',
 *   'https://myimageupscaler.com/blog/post-2',
 * ]);
 *
 * // Get submission status
 * const status = await getSubmissionStatus();
 * ```
 */

import { serverEnv } from '@shared/config/env';

// =============================================================================
// Constants
// =============================================================================

/**
 * IndexNow endpoint URLs
 * Using Bing as the primary endpoint (it distributes to other participating engines)
 */
const INDEXNOW_ENDPOINTS = {
  bing: 'https://www.bing.com/indexnow',
  yandex: 'https://yandex.com/indexnow',
} as const;

/**
 * Default batch size for submissions
 * IndexNow allows up to 10,000 URLs per POST request
 */
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Minimum and maximum key length requirements
 */
const KEY_MIN_LENGTH = 8;
const KEY_MAX_LENGTH = 128;

/**
 * Valid characters for IndexNow key
 */
const KEY_VALID_CHARS = /^[a-zA-Z0-9-]+$/;

// =============================================================================
// Types
// =============================================================================

/**
 * IndexNow submission result
 */
export interface IIndexNowResult {
  success: boolean;
  statusCode?: number;
  message: string;
  urlCount?: number;
  timestamp: string;
}

/**
 * IndexNow submission status
 */
export interface IIndexNowStatus {
  totalSubmitted: number;
  lastSubmission?: string;
  keyLocation?: string;
  isEnabled: boolean;
}

/**
 * IndexNow batch submission options
 */
export interface IIndexNowBatchOptions {
  /**
   * Custom batch size (default: 1000, max: 10000)
   */
  batchSize?: number;

  /**
   * Delay between batches in milliseconds (default: 1000)
   */
  delayMs?: number;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;
}

/**
 * IndexNow submission request payload
 */
interface IIndexNowPayload {
  host: string;
  key: string;
  keyLocation?: string;
  urlList: string[];
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get the IndexNow API key from environment variables
 * Generates a warning if not configured
 */
function getIndexNowKey(): string {
  const key = serverEnv.INDEXNOW_KEY || '';

  if (!key) {
    console.warn('[IndexNow] INDEXNOW_KEY not configured. Submissions will be skipped.');
    return '';
  }

  // Validate key format
  if (key.length < KEY_MIN_LENGTH || key.length > KEY_MAX_LENGTH) {
    console.warn(
      `[IndexNow] Invalid key length: ${key.length}. Must be between ${KEY_MIN_LENGTH} and ${KEY_MAX_LENGTH} characters.`
    );
    return '';
  }

  if (!KEY_VALID_CHARS.test(key)) {
    console.warn(
      '[IndexNow] Key contains invalid characters. Only a-z, A-Z, 0-9, and hyphens are allowed.'
    );
    return '';
  }

  return key;
}

/**
 * Get the host from URL
 */
function getHostFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.host;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Get the key location URL
 * Defaults to https://host/{key}.txt at root
 */
function getKeyLocation(host: string, key: string): string {
  return `https://${host}/${key}.txt`;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Validate URL format
 */
function validateUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Submit a single URL to IndexNow
 *
 * @param url - The URL to submit (must be absolute URL with http/https)
 * @returns Promise with submission result
 *
 * @example
 * ```typescript
 * const result = await submitUrl('https://myimageupscaler.com/blog/new-post');
 * if (result.success) {
 *   console.log('URL submitted successfully');
 * }
 * ```
 */
export async function submitUrl(url: string): Promise<IIndexNowResult> {
  const key = getIndexNowKey();

  if (!key) {
    return {
      success: false,
      message: 'IndexNow not configured: missing INDEXNOW_KEY',
      timestamp: new Date().toISOString(),
    };
  }

  // Validate URL
  if (!validateUrl(url)) {
    return {
      success: false,
      message: `Invalid URL: ${url}`,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    // Build query parameters for single URL submission
    const params = new URLSearchParams({
      url,
      key,
    });

    const endpoint = `${INDEXNOW_ENDPOINTS.bing}?${params.toString()}`;

    console.log(`[IndexNow] Submitting single URL: ${url}`);

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'MyImageUpscaler-IndexNow/1.0',
      },
    });

    // HTTP 200 indicates the search engine received the URL
    if (response.ok) {
      console.log(`[IndexNow] Successfully submitted: ${url}`);
      return {
        success: true,
        statusCode: response.status,
        message: 'URL submitted successfully',
        urlCount: 1,
        timestamp: new Date().toISOString(),
      };
    }

    // Handle error responses
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(`[IndexNow] Submission failed with status ${response.status}: ${errorText}`);

    return {
      success: false,
      statusCode: response.status,
      message: `Submission failed: ${errorText}`,
      urlCount: 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[IndexNow] Error submitting URL:', errorMessage);

    return {
      success: false,
      message: `Error: ${errorMessage}`,
      urlCount: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Submit multiple URLs to IndexNow as a batch
 *
 * @param urls - Array of URLs to submit (must be absolute URLs)
 * @param options - Batch submission options
 * @returns Promise with submission result
 *
 * @example
 * ```typescript
 * const result = await submitBatch([
 *   'https://myimageupscaler.com/blog/post-1',
 *   'https://myimageupscaler.com/blog/post-2',
 * ], { batchSize: 100 });
 * ```
 */
export async function submitBatch(
  urls: string[],
  options: IIndexNowBatchOptions = {}
): Promise<IIndexNowResult> {
  const key = getIndexNowKey();

  if (!key) {
    return {
      success: false,
      message: 'IndexNow not configured: missing INDEXNOW_KEY',
      timestamp: new Date().toISOString(),
    };
  }

  // Validate input
  if (!Array.isArray(urls) || urls.length === 0) {
    return {
      success: false,
      message: 'URLs must be a non-empty array',
      timestamp: new Date().toISOString(),
    };
  }

  // Validate all URLs
  const validUrls = urls.filter(validateUrl);
  if (validUrls.length === 0) {
    return {
      success: false,
      message: 'No valid URLs provided',
      timestamp: new Date().toISOString(),
    };
  }

  if (validUrls.length !== urls.length) {
    console.warn(
      `[IndexNow] Filtered out ${urls.length - validUrls.length} invalid URLs out of ${urls.length} total`
    );
  }

  // Determine batch size
  const batchSize = Math.min(Math.max(options.batchSize || DEFAULT_BATCH_SIZE, 1), 10000);

  const delayMs = options.delayMs || 1000;

  console.log(`[IndexNow] Submitting ${validUrls.length} URLs in batches of ${batchSize}`);

  let totalSubmitted = 0;
  let failedBatches = 0;
  const results: IIndexNowResult[] = [];

  // Get host from first URL
  const host = getHostFromUrl(validUrls[0]!);
  const keyLocation = getKeyLocation(host, key);

  // Process in batches
  for (let i = 0; i < validUrls.length; i += batchSize) {
    // Check for cancellation
    if (options.signal?.aborted) {
      return {
        success: false,
        message: 'Submission aborted',
        urlCount: totalSubmitted,
        timestamp: new Date().toISOString(),
      };
    }

    const batch = validUrls.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(validUrls.length / batchSize);

    console.log(
      `[IndexNow] Processing batch ${batchNumber}/${totalBatches} (${batch.length} URLs)`
    );

    try {
      const payload: IIndexNowPayload = {
        host,
        key,
        keyLocation,
        urlList: batch,
      };

      const response = await fetch(INDEXNOW_ENDPOINTS.bing, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MyImageUpscaler-IndexNow/1.0',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        totalSubmitted += batch.length;
        console.log(
          `[IndexNow] Batch ${batchNumber}/${totalBatches} submitted successfully (${batch.length} URLs)`
        );

        results.push({
          success: true,
          statusCode: response.status,
          message: `Batch ${batchNumber} submitted successfully`,
          urlCount: batch.length,
          timestamp: new Date().toISOString(),
        });
      } else {
        failedBatches++;
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(
          `[IndexNow] Batch ${batchNumber}/${totalBatches} failed with status ${response.status}: ${errorText}`
        );

        results.push({
          success: false,
          statusCode: response.status,
          message: `Batch ${batchNumber} failed: ${errorText}`,
          urlCount: 0,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      failedBatches++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[IndexNow] Error in batch ${batchNumber}:`, errorMessage);

      results.push({
        success: false,
        message: `Batch ${batchNumber} error: ${errorMessage}`,
        urlCount: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // Add delay between batches (except for last batch)
    if (i + batchSize < validUrls.length) {
      await sleep(delayMs);
    }
  }

  // Return summary
  const success = failedBatches === 0;

  return {
    success,
    message: `Submitted ${totalSubmitted}/${validUrls.length} URLs (${failedBatches} batches failed)`,
    urlCount: totalSubmitted,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get IndexNow submission status
 *
 * @returns Current IndexNow configuration and status
 */
export async function getSubmissionStatus(): Promise<IIndexNowStatus> {
  const key = getIndexNowKey();

  return {
    totalSubmitted: 0, // Track this in a database if needed
    lastSubmission: undefined,
    keyLocation: key ? getKeyLocation(serverEnv.DOMAIN_NAME, key) : undefined,
    isEnabled: !!key,
  };
}

/**
 * Submit URLs from a CSV file
 * Useful for bulk submission from SEO audit files
 *
 * @param csvContent - CSV file content with URLs (one per line or comma-separated)
 * @returns Promise with submission result
 *
 * @example
 * ```typescript
 * const csv = 'https://myimageupscaler.com/page1\nhttps://myimageupscaler.com/page2';
 * const result = await submitFromCSV(csv);
 * ```
 */
export async function submitFromCSV(csvContent: string): Promise<IIndexNowResult> {
  // Parse CSV - handle both newline and comma-separated values
  const urls = csvContent
    .split(/[\n,]+/)
    .map(url => url.trim())
    .filter(url => url.length > 0 && validateUrl(url));

  if (urls.length === 0) {
    return {
      success: false,
      message: 'No valid URLs found in CSV content',
      timestamp: new Date().toISOString(),
    };
  }

  console.log(`[IndexNow] Parsed ${urls.length} URLs from CSV content`);

  return submitBatch(urls);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sleep utility for delays between batches
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a valid IndexNow key
 * Useful for generating a new key during setup
 *
 * @param length - Length of the key to generate (default: 32)
 * @returns A valid IndexNow key
 */
export function generateIndexNowKey(length: number = 32): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';

  for (let i = 0; i < length; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }

  return key;
}

/**
 * Validate IndexNow key format
 *
 * @param key - The key to validate
 * @returns True if the key is valid
 */
export function validateIndexNowKey(key: string): boolean {
  if (key.length < KEY_MIN_LENGTH || key.length > KEY_MAX_LENGTH) {
    return false;
  }

  return KEY_VALID_CHARS.test(key);
}

/**
 * Get the content for the IndexNow key file
 * This should be saved as a .txt file in the public directory
 *
 * @returns The key file content
 */
export function getKeyFileContent(): string {
  const key = getIndexNowKey();
  return key || '';
}

// =============================================================================
// Export types
// =============================================================================

// Note: Types are already exported inline with their interface declarations
// Re-exporting here for convenience if needed
export type { IIndexNowPayload };
