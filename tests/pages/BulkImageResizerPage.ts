import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export type IFitMode = 'fit' | 'fill';
export type IOutputFormat = 'jpeg' | 'png' | 'webp';

export interface IResizeSettings {
  width: number;
  height: number;
  maintainAspectRatio: boolean;
  fitMode: IFitMode;
  format: IOutputFormat;
  quality: number;
}

/**
 * Bulk Image Resizer Page Object
 *
 * Page Object for the bulk image resizer tool at /tools/resize/bulk-image-resizer
 * Provides methods to interact with all UI elements including:
 * - Drag & drop upload
 * - Settings panel (width, height, format, quality, aspect ratio)
 * - Image list with progress indicators
 * - Download buttons (individual and ZIP)
 */
export class BulkImageResizerPage extends BasePage {
  // Page elements
  readonly pageTitle: Locator;
  readonly pageDescription: Locator;

  // Settings panel - use ID selectors for reliability
  readonly widthInput: Locator;
  readonly heightInput: Locator;
  readonly formatSelect: Locator;
  readonly qualitySlider: Locator;
  readonly qualityDisplay: Locator;
  readonly aspectRatioCheckbox: Locator;
  readonly fitModeSelect: Locator;

  // Upload area
  readonly uploadArea: Locator;
  readonly fileInput: Locator;
  readonly addMoreButton: Locator;

  // Action buttons
  readonly processAllButton: Locator;
  readonly downloadAllButton: Locator;
  readonly resetButton: Locator;

  // Image list container
  readonly imageListContainer: Locator;

  constructor(page: Page) {
    super(page);

    // Page header - use role-based selector for resilience against class changes
    this.pageTitle = page.getByRole('heading', { level: 1, name: /bulk image resizer/i });

    // Page description - target the hero intro paragraph (text-xl inside hero section)
    this.pageDescription = page.locator('section p.text-xl').first();

    // Settings panel - use global ID selectors (IDs are unique per page)
    this.widthInput = page.locator('input#width');
    this.heightInput = page.locator('input#height');
    this.formatSelect = page.locator('select#format');
    this.qualitySlider = page.locator('input#quality');
    this.qualityDisplay = page.locator('label[for="quality"]');
    this.aspectRatioCheckbox = page.locator('input#aspect-ratio');
    this.fitModeSelect = page.locator('select#fit-mode');

    // Upload area - target the dropzone with specific content
    this.uploadArea = page
      .locator('.border-dashed')
      .filter({ hasText: /drag & drop/i })
      .first();
    this.fileInput = page.locator('input[type="file"][accept*="image"]').first();
    this.addMoreButton = page.getByRole('button', { name: /add more images/i });

    // Action buttons
    this.processAllButton = page.getByRole('button', { name: /process all/i });
    this.downloadAllButton = page.getByRole('button', { name: /download all as zip/i });
    this.resetButton = page.getByRole('button', { name: /reset/i });

    // Image list container - the scrollable area containing image items
    this.imageListContainer = page.locator('.space-y-3.mb-6.max-h-\\[400px\\]');
  }

  /**
   * Navigate to the bulk image resizer page
   */
  async goto(): Promise<void> {
    await super.goto('/tools/resize/bulk-image-resizer');
  }

  /**
   * Wait for the page to load
   */
  async waitForLoad(): Promise<void> {
    await expect(this.pageTitle).toBeVisible({ timeout: 15000 });
    await expect(this.uploadArea).toBeVisible({ timeout: 10000 });
  }

  /**
   * Wait for a specific number of images in the list
   */
  async waitForImageCount(count: number, timeout = 10000): Promise<void> {
    await expect(this.getImageItems()).toHaveCount(count, { timeout });
  }

  /**
   * Wait for at least one image to appear in the list
   */
  async waitForImagesLoaded(): Promise<void> {
    await expect(this.getImageItems().first()).toBeVisible({ timeout: 10000 });
  }

  /**
   * Upload image(s) via the file input
   */
  async uploadImages(filePaths: string[]): Promise<void> {
    await this.fileInput.setInputFiles(filePaths);
    // Wait for images to appear in the list
    await this.waitForImagesLoaded();
  }

  /**
   * Upload a single image
   */
  async uploadImage(filePath: string): Promise<void> {
    await this.uploadImages([filePath]);
  }

  /**
   * Add more images after initial upload
   */
  async addMoreImages(filePaths: string[]): Promise<void> {
    const currentCount = await this.getImageItems().count();
    // Click the "Add More Images" button to trigger the file input
    await this.addMoreButton.click();
    // Set files on the file input
    await this.fileInput.setInputFiles(filePaths);
    // Wait for the new images to appear
    await this.waitForImageCount(currentCount + filePaths.length);
  }

  /**
   * Set width
   */
  async setWidth(width: number): Promise<void> {
    await this.widthInput.fill(width.toString());
  }

  /**
   * Set height - first disables aspect ratio if needed since height input is hidden when aspect ratio is on
   */
  async setHeight(height: number): Promise<void> {
    // Height input is conditionally rendered - only exists when aspect ratio is off
    // Check if it exists, and if not, disable aspect ratio first
    const heightExists = await this.heightInput.count();
    if (heightExists === 0) {
      await this.setMaintainAspectRatio(false);
      // Wait for the input to appear after state change
      await expect(this.heightInput).toBeVisible({ timeout: 5000 });
    }
    await this.heightInput.fill(height.toString());
    // Wait for value to be set
    await expect(this.heightInput).toHaveValue(height.toString());
  }

  /**
   * Set output format
   */
  async setFormat(format: IOutputFormat): Promise<void> {
    await this.formatSelect.selectOption(format);
    // Wait for value to be set
    await expect(this.formatSelect).toHaveValue(format);
  }

  /**
   * Set quality slider value
   */
  async setQuality(quality: number): Promise<void> {
    // Using JS to set range value directly for more reliable testing
    await this.qualitySlider.evaluate((el: HTMLInputElement, val) => {
      el.value = val.toString();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, quality);
    // Wait for value to be set
    await expect(this.qualitySlider).toHaveValue(quality.toString());
  }

  /**
   * Toggle maintain aspect ratio checkbox
   */
  async setMaintainAspectRatio(checked: boolean): Promise<void> {
    const isChecked = await this.aspectRatioCheckbox.isChecked();
    if (isChecked !== checked) {
      await this.aspectRatioCheckbox.setChecked(checked);
      // Wait for checkbox state to change
      if (checked) {
        await expect(this.aspectRatioCheckbox).toBeChecked();
      } else {
        await expect(this.aspectRatioCheckbox).not.toBeChecked();
      }
    }
  }

  /**
   * Set fit mode (only available when aspect ratio is maintained)
   */
  async setFitMode(mode: IFitMode): Promise<void> {
    // Ensure aspect ratio checkbox is checked first
    await this.setMaintainAspectRatio(true);
    await this.fitModeSelect.selectOption(mode);
    // Wait for value to be set
    await expect(this.fitModeSelect).toHaveValue(mode);
  }

  /**
   * Get current settings
   */
  async getSettings(): Promise<IResizeSettings> {
    const width = await this.widthInput.inputValue();
    const height = await this.heightInput.inputValue();
    const format = await this.formatSelect.inputValue();
    const quality = await this.qualitySlider.inputValue();
    const maintainAspectRatio = await this.aspectRatioCheckbox.isChecked();

    // Fit mode select might not be visible if aspect ratio is not maintained
    let fitMode: IFitMode = 'fit';
    try {
      if (maintainAspectRatio) {
        const fitModeValue = await this.fitModeSelect.inputValue();
        fitMode = fitModeValue as IFitMode;
      }
    } catch {
      // Fit mode select might not be visible
    }

    return {
      width: parseInt(width) || 0,
      height: parseInt(height) || 0,
      maintainAspectRatio,
      fitMode,
      format: format as IOutputFormat,
      quality: parseInt(quality) || 0,
    };
  }

  /**
   * Click "Process All" button
   */
  async clickProcessAll(): Promise<void> {
    await this.processAllButton.click();
  }

  /**
   * Click "Download All as ZIP" button
   */
  async clickDownloadAll(): Promise<void> {
    await this.downloadAllButton.click();
  }

  /**
   * Click "Reset" button
   */
  async clickReset(): Promise<void> {
    await this.resetButton.click();
  }

  /**
   * Get the image items in the list (items with file info)
   */
  private getImageItems(): Locator {
    // Image items are in the scrollable container, each has thumbnail, file name, and dimension info
    return this.imageListContainer.locator('.bg-surface-light\\/50.rounded-lg');
  }

  /**
   * Get the number of images in the list
   */
  async getImageCount(): Promise<number> {
    return await this.getImageItems().count();
  }

  /**
   * Remove an image by its index (0-based)
   */
  async removeImageByIndex(index: number): Promise<void> {
    const currentCount = await this.getImageCount();
    const item = this.getImageItems().nth(index);
    // Find the remove button (has title="Remove")
    const removeButton = item.locator('button[title="Remove"]');
    await removeButton.click();
    // Wait for the image count to decrease
    if (currentCount > 1) {
      await this.waitForImageCount(currentCount - 1);
    } else {
      // If last image, wait for upload area to reappear
      await this.assertUploadAreaVisible();
    }
  }

  /**
   * Click download button for a specific image by index
   */
  async downloadImageByIndex(index: number): Promise<void> {
    // Close any modal that might be blocking interaction
    await this.closeCTAModalIfVisible();

    const item = this.getImageItems().nth(index);
    // Find the download button (has title attribute or download icon)
    const downloadButton = item
      .locator('button')
      .filter({ has: this.page.locator('svg.lucide-download') });
    await downloadButton.click();
  }

  /**
   * Wait for processing to complete for all images
   * This also handles closing the CTA modal that appears after processing
   */
  async waitForProcessingComplete(): Promise<void> {
    // First wait for the download button to appear
    // This indicates all images have been processed
    await expect(this.downloadAllButton).toBeVisible({ timeout: 60000 });

    // Close the CTA modal if it's visible
    await this.closeCTAModalIfVisible();

    // Verify download button is still visible after closing modal
    await expect(this.downloadAllButton).toBeVisible({ timeout: 5000 });
  }

  /**
   * Check if download all button is visible
   */
  async isDownloadAllVisible(): Promise<boolean> {
    return await this.downloadAllButton.isVisible().catch(() => false);
  }

  /**
   * Assert the queue is empty (upload area visible)
   */
  async assertUploadAreaVisible(): Promise<void> {
    await expect(this.uploadArea).toBeVisible({ timeout: 5000 });
  }

  /**
   * Assert the upload area is hidden (images have been added)
   */
  async assertUploadAreaHidden(): Promise<void> {
    await expect(this.uploadArea).not.toBeVisible({ timeout: 5000 });
  }

  /**
   * Check if processing is in progress
   */
  async isProcessing(): Promise<boolean> {
    const processingIndicator = this.page
      .locator('.animate-spin')
      .or(this.page.getByText(/processing/i));
    return await processingIndicator.isVisible().catch(() => false);
  }

  /**
   * Get image info for a specific index (name, dimensions)
   */
  async getImageInfo(index: number): Promise<{ name: string | null; dimensions: string | null }> {
    const item = this.getImageItems().nth(index);

    const name = await item.locator('.text-sm.font-medium.text-text-primary').textContent();
    // Target specifically the <p> element, not buttons, for dimensions
    const dimensions = await item.locator('p.text-xs.text-text-secondary').textContent();

    return { name, dimensions };
  }

  /**
   * Close the CTA modal if it appears after processing
   * This modal appears after processing completes and blocks interaction
   */
  async closeCTAModalIfVisible(): Promise<void> {
    // Look for the modal content by its unique heading text
    const modalHeading = this.page.getByText('Images Resized Successfully').first();

    const isModalVisible = await modalHeading.isVisible().catch(() => false);

    if (isModalVisible) {
      // The close button is within the same modal container
      // Look for it near the heading by targeting the modal container first
      const modalContainer = modalHeading.locator(
        'xpath=ancestor::div[contains(@class, "max-w-md")]'
      );
      const closeButton = modalContainer
        .locator('button')
        .filter({ has: this.page.locator('svg.lucide-x') })
        .first();

      // Try clicking the close button
      await closeButton.click().catch(async () => {
        // If close button doesn't work, try pressing Escape
        await this.page.keyboard.press('Escape');
      });

      // Wait for modal to disappear
      await modalHeading.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
  }
}
