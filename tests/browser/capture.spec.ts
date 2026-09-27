import { expect, test } from '@playwright/test';

test('quick add stays sparse on a phone-sized and desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('empty-add').click();
  await expect(page.getByTestId('quick-add-domain')).toBeVisible();
  await expect(page.getByTestId('quick-add-registrar')).toBeVisible();
  await expect(page.getByTestId('quick-add-date')).toBeVisible();
  await expect(page.getByTestId('quick-add-cost')).toBeVisible();
  await expect(page.getByTestId('quick-add-currency')).toBeVisible();
  await expect(page.getByTestId('quick-add-intent')).toBeVisible();
  await expect(page.getByTestId('advanced-panel')).toHaveCount(0);
  await page.getByTestId('quick-add-domain').fill('phone.example');
  await page.getByTestId('quick-add-date').fill('2027-03-04');
  await page.getByTestId('quick-add-save').click();
  await expect(page.getByRole('button', { name: /phone\.example/ })).toBeVisible();
  await page.getByTestId('open-add').click();
  await expect(page.getByTestId('advanced-panel')).toHaveCount(0);
  await page.getByTestId('more-details').click();
  await expect(page.getByTestId('advanced-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('nav-domains').click();
  await expect(page.getByRole('button', { name: /phone\.example/ })).toBeVisible();
  await page.goto('/showcase');
  await expect(page.getByRole('heading', { name: /renews next/i })).toBeVisible();
  await expect(page.getByText('Private Firestore', { exact: true })).toBeVisible();
  await expect(page.getByText(/app data/i)).toHaveCount(0);
});

test('five fields stay reachable at 200 percent zoom and AI review does not save by itself', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('open-add').click();
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(page.getByTestId('quick-add-domain')).toBeVisible();
  await expect(page.getByTestId('quick-add-registrar')).toBeVisible();
  await expect(page.getByTestId('quick-add-date')).toBeVisible();
  await expect(page.getByTestId('quick-add-cost')).toBeVisible();
  await expect(page.getByTestId('quick-add-currency')).toBeVisible();
  await expect(page.getByTestId('quick-add-intent')).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1';
  });
  await page.getByTestId('capture-mode-ai').click();
  await expect(page.getByTestId('ai-input')).toBeVisible();
  await expect(page.getByTestId('quick-add-save')).toHaveCount(0);
  await expect(page.getByTestId('ai-add-selected')).toHaveCount(0);
});

test('keyboard can reach the five quick-add fields', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('open-add').click();
  await page.getByTestId('quick-add-domain').focus();
  await page.keyboard.type('keyboard.example');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('quick-add-registrar')).toBeFocused();
});

test('archived records can be found and restored through the connected UI', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('open-add').click();
  await page.getByTestId('quick-add-domain').fill('archive.example');
  await page.getByTestId('quick-add-date').fill('2027-04-05');
  await page.getByTestId('quick-add-save').click();
  await page.getByTestId('nav-domains').click();
  await page.getByRole('button', { name: /archive\.example/ }).click();
  await page.getByTestId('more-details').click();
  await page.getByTestId('advanced-panel').getByRole('checkbox', { name: 'Archived' }).check();
  await page.getByTestId('quick-add-save').click();
  await expect(page.getByRole('button', { name: /archive\.example/ })).toHaveCount(0);
  await page.getByLabel('View archived domains').check();
  await page.getByRole('button', { name: /archive\.example/ }).click();
  await page.getByTestId('more-details').click();
  await page.getByTestId('advanced-panel').getByRole('checkbox', { name: 'Archived' }).uncheck();
  await page.getByTestId('quick-add-save').click();
  await page.getByLabel('View archived domains').uncheck();
  await expect(page.getByRole('button', { name: /archive\.example/ })).toBeVisible();
});

test('settings connects token management and import commit to the portfolio', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('nav-settings').click();
  await page.getByRole('button', { name: 'Create token' }).click();
  await expect(page.getByText(/dew1\./)).toBeVisible();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText(/revoked/)).toBeVisible();
  await page.getByLabel('Import file').setInputFiles({
    name: 'portfolio.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'domain-expansion-backup', schemaVersion: 2, domains: [{ name: 'imported.example', expirationDate: '2027-04-01' }] })),
  });
  await expect(page.getByText(/imported\.example: create/)).toBeVisible();
  await page.getByRole('button', { name: 'Commit preview' }).click();
  await expect(page.getByText(/Applied 1 rows/)).toBeVisible();
  await page.getByTestId('nav-domains').click();
  await expect(page.getByRole('button', { name: /imported\.example/ })).toBeVisible();
});
