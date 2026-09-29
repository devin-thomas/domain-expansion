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
  await page.getByTestId('nav-settings').click();
  await page.getByLabel('Domain for Calendar or Tasks').selectOption({ label: 'imported.example' });
  await page.getByRole('button', { name: 'Preview Calendar reminder' }).click();
  await expect(page.getByTestId('external-reminder-preview')).toContainText('primary Google Calendar');
  await expect(page.getByTestId('external-reminder-date').locator('option')).toHaveCount(4);
  await expect(page.getByText(/No Google permission is requested until you confirm/)).toBeVisible();
});

test('payment fields validate and persist even after advanced details are collapsed', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('open-add').click();
  await page.getByTestId('quick-add-domain').fill('payment.example');
  await page.getByTestId('quick-add-date').fill('2027-05-10');
  await page.getByTestId('more-details').click();
  await page.getByTestId('purchase-email').fill('not-an-email');
  await page.getByTestId('quick-add-save').click();
  await expect(page.getByTestId('purchase-email')).toBeVisible();
  expect(await page.getByTestId('purchase-email').evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);

  await page.getByTestId('purchase-email').fill('paid@example.com');
  await page.getByTestId('payment-method').fill('Personal card ending 4242');
  await page.getByTestId('more-details').click();
  await page.getByTestId('quick-add-save').click();
  await expect(page.getByRole('button', { name: /payment\.example/ })).toBeVisible();
  await page.getByRole('button', { name: /payment\.example/ }).click();
  await page.getByTestId('more-details').click();
  await expect(page.getByTestId('purchase-email')).toHaveValue('paid@example.com');
  await expect(page.getByTestId('payment-method')).toHaveValue('Personal card ending 4242');
});

test('reminders and billing-only dates survive edits', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('open-add').click();
  await page.getByTestId('quick-add-domain').fill('billing-only.example');
  await page.getByTestId('quick-add-date').fill('2027-06-11');
  await page.getByTestId('more-details').click();
  await page.getByTestId('reminder-target').selectOption('billing');
  await page.getByTestId('reminder-offsets').fill('21, 3');
  await page.getByTestId('billing-date').fill('2027-06-01');
  await page.getByTestId('quick-add-save').click();

  await page.getByTestId('nav-domains').click();
  await page.getByRole('button', { name: /billing-only\.example/ }).first().click();
  await page.getByTestId('more-details').click();
  await expect(page.getByTestId('reminder-target')).toHaveValue('billing');
  await expect(page.getByTestId('reminder-offsets')).toHaveValue('21, 3');
  await expect(page.getByTestId('billing-date')).toHaveValue('2027-06-01');
  await page.getByTestId('quick-add-date').fill('');
  await page.getByTestId('quick-add-save').click();

  await page.getByRole('button', { name: /billing-only\.example/ }).first().click();
  await expect(page.getByTestId('quick-add-date')).toHaveValue('');
  await page.getByTestId('more-details').click();
  await expect(page.getByTestId('billing-date')).toHaveValue('2027-06-01');
  await expect(page.getByTestId('reminder-target')).toHaveValue('billing');
  await expect(page.getByTestId('reminder-offsets')).toHaveValue('21, 3');
});

test('currency change explicitly clears existing costs', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('open-add').click();
  await page.getByTestId('quick-add-domain').fill('currency.example');
  await page.getByTestId('quick-add-date').fill('2027-07-12');
  await page.getByTestId('quick-add-cost').fill('15.00');
  await page.getByTestId('more-details').click();
  await page.getByLabel('Registration cost').fill('8.00');
  await page.getByTestId('quick-add-save').click();
  await page.getByTestId('nav-domains').click();
  await page.getByRole('button', { name: /currency\.example/ }).first().click();
  await page.getByTestId('quick-add-currency').selectOption('EUR');
  await expect(page.getByText(/Changing currency clears the stored amounts/)).toBeVisible();
  await page.getByLabel(/Changing currency clears/).check();
  await page.getByTestId('quick-add-save').click();
  await page.getByRole('button', { name: /currency\.example/ }).first().click();
  await expect(page.getByTestId('quick-add-cost')).toHaveValue('');
  await page.getByTestId('more-details').click();
  await expect(page.getByLabel('Registration cost')).toHaveValue('');
});

test('capture protects AI drafts and restores keyboard focus to its opener', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  const opener = page.getByTestId('open-add');
  await opener.click();
  await expect(page.getByTestId('quick-add-domain')).toBeFocused();
  await page.getByTestId('quick-add-domain').fill('keep-this-draft.example');
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByTestId('capture-mode-ai').click();
  await expect(page.getByTestId('quick-add-domain')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('capture-mode-ai').click();
  await page.getByTestId('ai-input').fill('some AI capture text');
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByTestId('capture-mode-quick').click();
  await expect(page.getByTestId('ai-input')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('capture-mode-quick').click();
  await expect(page.getByTestId('quick-add-domain')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('quick-add-save')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('delete submits once while busy and reports a failed deletion', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('open-add').click();
  await page.getByTestId('quick-add-domain').fill('delete.example');
  await page.getByTestId('quick-add-date').fill('2027-08-13');
  await page.getByTestId('quick-add-save').click();
  await page.getByTestId('nav-domains').click();
  await page.getByRole('button', { name: /delete\.example/ }).first().click();
  await page.getByRole('button', { name: 'Permanently delete delete.example' }).click();
  await page.getByLabel('Type delete.example to confirm').fill('delete.example');

  let deleteRequests = 0;
  let releaseDelete!: () => void;
  const deleteResponse = new Promise<void>((resolve) => { releaseDelete = resolve; });
  await page.route('**/api/v1/domains/**', async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    deleteRequests += 1;
    await deleteResponse;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Temporarily unavailable' } }) });
  });
  const deleteButton = page.getByTestId('delete-submit');
  await deleteButton.click();
  await expect.poll(() => deleteRequests).toBe(1);
  await expect(deleteButton).toBeDisabled();
  releaseDelete();
  await expect(page.getByTestId('save-status')).toContainText('Nothing was deleted');
  expect(deleteRequests).toBe(1);
  await expect(page.getByRole('button', { name: /delete\.example/ }).first()).toBeVisible();
});
