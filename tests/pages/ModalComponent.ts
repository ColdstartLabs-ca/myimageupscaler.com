import { Page, Locator, expect } from '@playwright/test';

export interface IModalOptions {
  timeout?: number;
  waitForVisible?: boolean;
  checkAccessibility?: boolean;
}

/**
 * Reusable modal interaction component
 *
 * Provides standardized methods for interacting with modals across the application,
 * including opening, closing, verification, and content interaction.
 */
export class ModalComponent {
  constructor(
    private page: Page,
    private modalSelector: string = 'div[role="dialog"], .modal, [data-modal]'
  ) {}

  /**
   * Gets the modal element locator
   */
  get modal(): Locator {
    return this.page.locator(this.modalSelector).first();
  }

  /**
   * Gets the modal title element
   */
  get title(): Locator {
    return this.modal.locator('h1, h2, h3, .modal-title, [data-modal-title]').first();
  }

  /**
   * Gets the modal close button
   */
  get closeButton(): Locator {
    return this.modal
      .locator('button[aria-label="Close"], .close-button, [data-close], .modal-close')
      .first();
  }

  /**
   * Gets modal content area
   */
  get content(): Locator {
    return this.modal.locator('.modal-body, .modal-content, [data-modal-content]').first();
  }

  /**
   * Gets modal footer with action buttons
   */
  get footer(): Locator {
    return this.modal.locator('.modal-footer, .modal-actions, [data-modal-footer]').first();
  }

  /**
   * Gets overlay/background element
   */
  get overlay(): Locator {
    return this.page.locator('.modal-backdrop, .modal-overlay, [data-modal-overlay]').first();
  }

  /**
   * Waits for modal to appear and verifies its structure
   *
   * @param options - Modal waiting options
   */
  async waitForOpen(options: IModalOptions = {}): Promise<void> {
    const { timeout = 10000, waitForVisible = true, checkAccessibility = true } = options;

    if (waitForVisible) {
      await expect(this.modal).toBeVisible({ timeout });
    }

    // Verify modal is properly positioned and interactive
    await expect(this.modal).toBeEnabled();

    // Check accessibility if requested
    if (checkAccessibility) {
      await this.checkAccessibility();
    }
  }

  /**
   * Waits for modal to be hidden/closed
   *
   * @param timeout - Optional timeout
   */
  async waitForClosed(timeout = 5000): Promise<void> {
    await expect(this.modal).toBeHidden({ timeout });
  }

  /**
   * Checks if modal is currently visible
   *
   * @returns True if modal is visible
   */
  async isVisible(): Promise<boolean> {
    return await this.modal.isVisible();
  }

  /**
   * Opens modal by clicking a trigger element
   *
   * @param trigger - Element that triggers modal opening
   * @param options - Modal waiting options
   */
  async open(trigger: Locator | string, options: IModalOptions = {}): Promise<void> {
    const triggerElement = typeof trigger === 'string' ? this.page.locator(trigger) : trigger;

    // Ensure trigger is visible and clickable
    await expect(triggerElement).toBeVisible();
    await triggerElement.click();

    // Wait for modal to appear
    await this.waitForOpen(options);
  }

  /**
   * Closes modal using close button
   *
   * @param timeout - Optional timeout for modal to close
   */
  async close(timeout = 5000): Promise<void> {
    if (await this.closeButton.isVisible()) {
      await this.closeButton.click();
    } else {
      // Fallback to escape key
      await this.page.keyboard.press('Escape');
    }

    await this.waitForClosed(timeout);
  }

  /**
   * Closes modal using escape key
   *
   * @param timeout - Optional timeout for modal to close
   */
  async closeWithEscape(timeout = 5000): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.waitForClosed(timeout);
  }

  /**
   * Closes modal by clicking overlay
   *
   * @param timeout - Optional timeout for modal to close
   */
  async closeByOverlay(timeout = 5000): Promise<void> {
    if (await this.overlay.isVisible()) {
      await this.overlay.click();
      await this.waitForClosed(timeout);
    }
  }

  /**
   * Gets modal title text
   *
   * @returns Modal title text
   */
  async getTitle(): Promise<string> {
    return (await this.title.textContent()) || '';
  }

  /**
   * Gets modal content text
   *
   * @returns Modal content text
   */
  async getContent(): Promise<string> {
    return (await this.content.textContent()) || '';
  }

  /**
   * Clicks a button within the modal
   *
   * @param buttonText - Button text or regex
   * @param waitForClose - Whether to wait for modal to close after click
   */
  async clickButton(buttonText: string | RegExp, waitForClose = true): Promise<void> {
    const button = this.modal.getByRole('button', { name: buttonText });
    await expect(button).toBeVisible();
    await button.click();

    if (waitForClose) {
      await this.waitForClosed();
    }
  }

  /**
   * Fills a form field within the modal
   *
   * @param fieldLabel - Field label or placeholder
   * @param value - Value to fill
   */
  async fillField(fieldLabel: string | RegExp, value: string): Promise<void> {
    const field = this.modal.getByLabel(fieldLabel).or(this.modal.getByPlaceholder(fieldLabel));
    await expect(field).toBeVisible();
    await field.fill(value);
  }

  /**
   * Selects an option from a dropdown within the modal
   *
   * @param label - Dropdown label
   * @param option - Option to select
   */
  async selectOption(label: string | RegExp, option: string): Promise<void> {
    const dropdown = this.modal.getByLabel(label);
    await expect(dropdown).toBeVisible();
    await dropdown.selectOption(option);
  }

  /**
   * Checks a checkbox within the modal
   *
   * @param label - Checkbox label
   */
  async checkCheckbox(label: string | RegExp): Promise<void> {
    const checkbox = this.modal.getByLabel(label);
    await expect(checkbox).toBeVisible();
    await checkbox.check();
  }

  /**
   * Unchecks a checkbox within the modal
   *
   * @param label - Checkbox label
   */
  async uncheckCheckbox(label: string | RegExp): Promise<void> {
    const checkbox = this.modal.getByLabel(label);
    await expect(checkbox).toBeVisible();
    await checkbox.uncheck();
  }

  /**
   * Verifies modal structure and accessibility
   */
  async checkAccessibility(): Promise<void> {
    // Check modal has proper role
    await expect(this.modal).toHaveAttribute('role', 'dialog');

    // Check modal has a title or aria-label
    const hasTitle = await this.title.isVisible();
    const hasAriaLabel = await this.modal.getAttribute('aria-label');

    if (!hasTitle && !hasAriaLabel) {
      console.warn('Modal missing accessible title or aria-label');
    }

    // Check for close button or escape functionality
    const hasCloseButton = await this.closeButton.isVisible();
    if (!hasCloseButton) {
      console.warn('Modal missing visible close button');
    }

    // Check focus is trapped within modal (basic check)
    const focusableElements = this.modal.locator(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const hasFocusableElements = (await focusableElements.count()) > 0;

    if (!hasFocusableElements) {
      console.warn('Modal appears to have no focusable elements');
    }
  }

  /**
   * Takes a screenshot of the modal
   *
   * @param name - Screenshot name
   * @param options - Screenshot options
   */
  async screenshot(name: string, options?: { fullPage?: boolean }): Promise<void> {
    if (await this.isVisible()) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}-${timestamp}.png`;
      await this.modal.screenshot({
        path: `test-results/screenshots/${filename}`,
        ...options,
      });
    }
  }

  /**
   * Waits for content to appear within modal
   *
   * @param content - Content text to wait for
   * @param timeout - Optional timeout
   */
  async waitForContent(content: string | RegExp, timeout = 5000): Promise<void> {
    await expect(this.content).toContainText(content, { timeout });
  }

  /**
   * Checks if modal contains specific content
   *
   * @param content - Content to check for
   * @returns True if content is found
   */
  async hasContent(content: string | RegExp): Promise<boolean> {
    const contentText = await this.getContent();

    if (typeof content === 'string') {
      return contentText.includes(content);
    } else {
      return content.test(contentText);
    }
  }

  /**
   * Checks if modal has specific title
   *
   * @param title - Title to check for
   * @returns True if title matches
   */
  async hasTitle(title: string | RegExp): Promise<boolean> {
    const titleText = await this.getTitle();

    if (typeof title === 'string') {
      return titleText.includes(title);
    } else {
      return title.test(titleText);
    }
  }

  /**
   * Gets all buttons within the modal
   *
   * @returns Array of button locators
   */
  async getButtons(): Promise<Locator[]> {
    const buttons = this.modal.getByRole('button');
    const count = await buttons.count();
    const result: Locator[] = [];

    for (let i = 0; i < count; i++) {
      result.push(buttons.nth(i));
    }

    return result;
  }

  /**
   * Gets button text for all visible buttons
   *
   * @returns Array of button texts
   */
  async getButtonTexts(): Promise<string[]> {
    const buttons = await this.getButtons();
    const texts: string[] = [];

    for (const button of buttons) {
      const text = await button.textContent();
      if (text) {
        texts.push(text.trim());
      }
    }

    return texts;
  }

  /**
   * Submits modal form (looks for submit button or presses Enter)
   *
   * @param waitForClose - Whether to wait for modal to close
   */
  async submit(waitForClose = true): Promise<void> {
    // Try to find submit button first
    const submitButton = this.modal
      .locator('button[type="submit"], .btn-primary, [data-submit]')
      .first();

    if (await submitButton.isVisible()) {
      await submitButton.click();
    } else {
      // Fallback to Enter key
      await this.page.keyboard.press('Enter');
    }

    if (waitForClose) {
      await this.waitForClosed();
    }
  }

  /**
   * Dismisses modal (cancels operation)
   *
   * @param waitForClose - Whether to wait for modal to close
   */
  async dismiss(waitForClose = true): Promise<void> {
    // Try to find cancel/close button
    const cancelButton = this.modal
      .locator('button[type="button"], .btn-secondary, .cancel-button, [data-cancel]')
      .first();

    if (await cancelButton.isVisible()) {
      await cancelButton.click();
    } else {
      // Fallback to escape key
      await this.closeWithEscape();
    }

    if (waitForClose) {
      await this.waitForClosed();
    }
  }
}
