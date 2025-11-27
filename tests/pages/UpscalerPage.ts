import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export type UpscaleMode = 'upscale' | 'enhance' | 'both';

export class UpscalerPage extends BasePage {
  // Page elements
  readonly pageTitle: Locator;
  readonly pageDescription: Locator;

  // Workspace - Empty state (Dropzone)
  readonly dropzone: Locator;
  readonly dropzoneTitle: Locator;
  readonly fileInput: Locator;

  // Workspace - Active state
  readonly workspace: Locator;
  readonly batchSidebar: Locator;
  readonly previewArea: Locator;
  readonly queueStrip: Locator;

  // Config controls
  readonly modeSelector: Locator;
  readonly scaleSelector: Locator;

  // Action buttons
  readonly processButton: Locator;
  readonly clearButton: Locator;
  readonly downloadButton: Locator;
  readonly retryButton: Locator;

  // Status indicators
  readonly progressIndicator: Locator;
  readonly errorMessage: Locator;
  readonly successIndicator: Locator;

  constructor(page: Page) {
    super(page);

    // Page header
    this.pageTitle = page.getByRole('heading', { name: 'AI Image Upscaler' });
    this.pageDescription = page.getByText('Enhance and upscale your images');

    // Dropzone (empty state)
    this.dropzone = page.locator('.border-dashed');
    this.dropzoneTitle = page.getByText('Click or drag images');
    this.fileInput = page.locator('input[type="file"]');

    // Workspace sections
    this.workspace = page.locator('.bg-white.rounded-2xl.shadow-xl');
    this.batchSidebar = page.locator('[class*="BatchSidebar"]').or(page.locator('.md\\:w-72'));
    this.previewArea = page.locator('[class*="PreviewArea"]').or(page.locator('.flex-grow.p-6'));
    this.queueStrip = page.locator('[class*="QueueStrip"]').or(page.locator('.border-t'));

    // Config controls - locate by associated labels/text
    this.modeSelector = page.getByRole('combobox').first();
    this.scaleSelector = page.locator('select').filter({ hasText: /2x|4x/i });

    // Action buttons - "Process All" is the main action button
    this.processButton = page.getByRole('button', { name: /process all/i });
    this.clearButton = page.getByRole('button', { name: /clear queue/i });
    this.downloadButton = page.getByRole('button', { name: 'Download Result' });
    this.retryButton = page.getByRole('button', { name: /try again/i });

    // Status indicators - be specific to avoid matching Next.js internal elements
    this.progressIndicator = page
      .locator('[role="progressbar"]')
      .or(page.locator('.animate-pulse'));
    this.errorMessage = page.locator('.text-red-600').first();
    this.successIndicator = page.getByText('Processing Complete');
  }

  /**
   * Navigate to the upscaler page
   */
  async goto(): Promise<void> {
    await super.goto('/upscaler');
  }

  /**
   * Wait for the page to load
   */
  async waitForLoad(): Promise<void> {
    await expect(this.pageTitle).toBeVisible({ timeout: 15000 });
    await expect(this.workspace).toBeVisible();
  }

  /**
   * Upload an image file via the file input
   */
  async uploadImage(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
    // Wait for the file to be processed and added to queue
    await this.page.waitForTimeout(500);
  }

  /**
   * Upload multiple images
   */
  async uploadImages(filePaths: string[]): Promise<void> {
    await this.fileInput.setInputFiles(filePaths);
    await this.page.waitForTimeout(500);
  }

  /**
   * Check if the dropzone (empty state) is visible
   */
  async isDropzoneVisible(): Promise<boolean> {
    return await this.dropzoneTitle.isVisible();
  }

  /**
   * Check if the workspace has files (active state)
   */
  async hasFilesInQueue(): Promise<boolean> {
    // When files are added, the dropzone title changes
    const dropzoneVisible = await this.dropzoneTitle.isVisible();
    return !dropzoneVisible;
  }

  /**
   * Select an upscale mode
   */
  async selectMode(mode: UpscaleMode): Promise<void> {
    // Look for mode selection buttons/tabs
    const modeButton = this.page.getByRole('button', { name: new RegExp(mode, 'i') });
    if (await modeButton.isVisible()) {
      await modeButton.click();
    } else {
      // Try select dropdown if buttons aren't visible
      await this.modeSelector.selectOption(mode);
    }
  }

  /**
   * Click the process/upscale button
   */
  async clickProcess(): Promise<void> {
    await this.processButton.click();
  }

  /**
   * Wait for processing to start
   */
  async waitForProcessingStart(): Promise<void> {
    // Wait for loading state or progress indicator with multiple fallback selectors
    const maxWaitTime = 5000;
    const checkInterval = 200;
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      const progressVisible = await this.progressIndicator.isVisible().catch(() => false);
      const spinnerVisible = await this.page
        .locator('.animate-spin')
        .isVisible()
        .catch(() => false);
      const processingTextVisible = await this.page
        .locator(':has-text("Processing")')
        .isVisible()
        .catch(() => false);

      if (progressVisible || spinnerVisible || processingTextVisible) {
        return;
      }

      await this.page.waitForTimeout(checkInterval);
      elapsedTime += checkInterval;
    }

    // If no processing indicators appeared, check if processing completed very quickly
    const downloadVisible = await this.downloadButton.isVisible().catch(() => false);
    const errorVisible = await this.errorMessage.isVisible().catch(() => false);

    if (downloadVisible || errorVisible) {
      // Processing completed before we could detect it started
      return;
    }

    // Try the original expect as a fallback
    await expect(
      this.progressIndicator
        .or(this.page.locator('.animate-spin'))
        .or(this.page.locator(':has-text("Processing")'))
    ).toBeVisible({ timeout: 1000 });
  }

  /**
   * Wait for processing to complete (success or error)
   */
  async waitForProcessingComplete(): Promise<void> {
    // Wait for either success (download button visible) or error message or success indicator
    // Use Promise.race to wait for any of them, but with better error handling
    try {
      await Promise.race([
        expect(this.downloadButton).toBeVisible({ timeout: 30000 }),
        expect(this.errorMessage).toBeVisible({ timeout: 30000 }),
        expect(this.successIndicator).toBeVisible({ timeout: 30000 }),
      ]);
    } catch (error) {
      // If the explicit expectations fail, do a fallback check with more lenient selectors
      const downloadVisible = await this.downloadButton.isVisible().catch(() => false);
      const errorVisible = await this.errorMessage.isVisible().catch(() => false);
      const hasImageResult = await this.page
        .locator('img[src*="data:image"]')
        .isVisible()
        .catch(() => false);

      if (!downloadVisible && !errorVisible && !hasImageResult) {
        throw new Error(
          `Processing did not complete within timeout. Last error: ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
    }

    // Give a small buffer for UI to stabilize
    await this.page.waitForTimeout(500);
  }

  /**
   * Assert the result is visible after processing
   */
  async assertResultVisible(): Promise<void> {
    // Result should show a preview image or download button
    await expect(
      this.downloadButton
        .or(this.page.locator('img[src*="data:image"]'))
        .or(this.page.locator('.preview-result'))
        .or(this.page.getByText('Enhanced Successfully'))
    ).toBeVisible({ timeout: 10000 });
  }

  /**
   * Assert download button is available
   */
  async assertDownloadAvailable(): Promise<void> {
    await expect(this.downloadButton).toBeVisible();
    await expect(this.downloadButton).toBeEnabled();
  }

  /**
   * Click download button
   */
  async clickDownload(): Promise<void> {
    await this.downloadButton.click();
  }

  /**
   * Assert an error message is displayed
   */
  async assertErrorVisible(expectedText?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    if (expectedText) {
      await expect(this.errorMessage).toContainText(expectedText);
    }
  }

  /**
   * Clear the queue
   */
  async clearQueue(): Promise<void> {
    if (await this.clearButton.isVisible()) {
      await this.clearButton.click();
    }
  }

  /**
   * Get the number of items in the queue
   */
  async getQueueCount(): Promise<number> {
    // Look for queue items in the strip with multiple selectors
    const queueItems = this.page
      .locator('[data-testid="queue-item"]')
      .or(this.queueStrip.locator('img'))
      .or(this.page.locator('.border-t img'))
      .or(this.page.locator('[class*="queue"] img'));

    const count = await queueItems.count();
    return count;
  }

  /**
   * Assert the queue is empty (dropzone visible)
   */
  async assertQueueEmpty(): Promise<void> {
    await expect(this.dropzoneTitle).toBeVisible({ timeout: 5000 });
    // Also verify no queue items exist
    const queueCount = await this.getQueueCount();
    expect(queueCount).toBe(0);
  }

  /**
   * Assert the upgrade modal appears (for insufficient credits)
   */
  async assertUpgradeModalVisible(): Promise<void> {
    const upgradeModal = this.page
      .locator('[role="dialog"]')
      .filter({ hasText: /upgrade|pricing|credits/i });
    await expect(upgradeModal).toBeVisible({ timeout: 5000 });
  }

  /**
   * Check if processing is in progress
   */
  async isProcessing(): Promise<boolean> {
    const spinner = this.page.locator('.animate-spin').first();
    const processingButton = this.page.getByRole('button', { name: /processing/i });
    return (await spinner.isVisible()) || (await processingButton.isVisible());
  }

  /**
   * Get the completion count text
   */
  async getCompletedCount(): Promise<string> {
    const countText = this.page
      .locator(':has-text("completed")')
      .or(this.page.locator('[data-testid="completed-count"]'));
    return (await countText.textContent()) || '';
  }
}
