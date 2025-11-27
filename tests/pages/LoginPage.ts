import { expect } from '@playwright/test';

import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  async openLoginModal(): Promise<void> {
    // Wait for the header/navbar to be loaded (using header element)
    await this.page.locator('header').waitFor({ state: 'visible', timeout: 15000 });

    // Wait for auth state to load and login button to be visible
    const loginButton = this.page.getByRole('button', { name: /sign in/i });
    await loginButton.waitFor({ state: 'visible', timeout: 15000 });
    await loginButton.click();

    // Wait for modal to appear
    const modal = this.page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10000 });
  }

  async login(email: string, password: string): Promise<void> {
    await this.openLoginModal();

    // Use placeholder selectors since the LoginForm uses placeholders
    const modal = this.page.locator('div[role="dialog"]');
    await modal.getByPlaceholder(/email/i).fill(email);
    await modal.getByPlaceholder(/password/i).fill(password);
    await modal.getByRole('button', { name: /sign in/i }).click();
  }

  async assertModalVisible(): Promise<void> {
    const modal = this.page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Verify the modal title - the title is in an h3 element within #modal-title
    const modalTitle = modal.locator('#modal-title h3', { hasText: 'Sign In' });
    await expect(modalTitle).toBeVisible();
  }

  async assertLoginSuccess(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  }
}
