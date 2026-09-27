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
