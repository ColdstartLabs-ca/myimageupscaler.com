import { Page } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string): Promise<void> {
    const url = path.startsWith('http') ? path : `http://localhost:3000${path}`;
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForURL(url: string | RegExp): Promise<void> {
    await this.page.waitForURL(url);
  }
}
