import { expect, test } from '@playwright/test';

const proposal = {
  name: 'reviewed.example',
  registrar: 'Example Registrar',
  expirationDate: '2027-04-12',
  billingDate: null,
  renewalCostMinor: 1200,
  currency: 'USD',
  suggestedCurrency: 'USD',
  renewalIntent: 'renew',
  warnings: [],
  proposals: [],
};

async function openAiCapture(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('open-add').click();
  await page.getByTestId('capture-mode-ai').click();
}

test('late extraction cannot repopulate capture after close and sign-out unmount the review', async ({ page }) => {
  let releaseExtract!: () => void;
  let finishExtract!: () => void;
  const waiting = new Promise<void>((resolve) => { releaseExtract = resolve; });
  const extractFinished = new Promise<void>((resolve) => { finishExtract = resolve; });
  await page.route('**/api/ai/extract', async (route) => {
    try {
      await waiting;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ drafts: [proposal] }) });
    } finally {
      finishExtract();
    }
  });

  await openAiCapture(page);
  await page.getByTestId('ai-input').fill('late response fixture');
  await page.getByTestId('ai-submit').click();
  await expect(page.getByTestId('ai-submit')).toBeDisabled();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('capture-mode-ai')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByTestId('test-sign-in')).toBeVisible();
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('open-add').click();
  await page.getByTestId('capture-mode-ai').click();
  releaseExtract();
  await extractFinished;

  await expect(page.locator('article')).toHaveCount(0);
  await expect(page.getByTestId('ai-input')).toHaveValue('');
});

test('pending double Add submits once and lost response retries the same selection idempotently', async ({ page }) => {
  const batchCalls: (string | undefined)[] = [];
  let releaseFirstBatch!: () => void;
  const firstBatchGate = new Promise<void>((resolve) => { releaseFirstBatch = resolve; });
  await page.route('**/api/ai/extract', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ drafts: [proposal] }),
  }));
  await page.route('**/api/v1/domains/batch', async (route) => {
    batchCalls.push(route.request().headers()['idempotency-key']);
    if (batchCalls.length === 1) await firstBatchGate;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    if (batchCalls.length === 1) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({ response });
  });

  await openAiCapture(page);
  await page.getByTestId('ai-input').fill('domain to add once');
  await page.getByTestId('ai-submit').click();
  await expect(page.locator('article')).toContainText('reviewed.example');
  await page.getByLabel('Domain').last().fill('edited-review.example');

  const addButton = page.getByTestId('ai-add-selected');
  await addButton.dblclick();
  await expect.poll(() => batchCalls.length).toBe(1);
  await expect(addButton).toBeDisabled();
  releaseFirstBatch();
  await expect(page.getByRole('alert')).toContainText('The save outcome is unknown');
  await expect(page.getByLabel('Domain').last()).toHaveValue('edited-review.example');
  await expect(addButton).toBeEnabled();

  const firstKey = batchCalls[0];
  expect(firstKey).toBeTruthy();
  await addButton.click();
  await expect(page.getByTestId('capture-mode-ai')).toHaveCount(0);
  expect(batchCalls).toHaveLength(2);
  expect(batchCalls[1]).toBe(firstKey);

  await page.getByTestId('nav-domains').click();
  await expect(page.getByRole('button', { name: /edited-review\.example/ })).toHaveCount(1);
});

test('quick-add network failure preserves the edit and retry keeps the same idempotency key', async ({ page }) => {
  const keys: (string | undefined)[] = [];
  await page.route('**/api/v1/domains', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    if (keys.length === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByTestId('test-sign-in').click();
  await page.getByTestId('open-add').click();
  await page.getByTestId('quick-add-domain').fill('retry-create.example');
  await page.getByTestId('quick-add-date').fill('2027-05-15');
  await page.getByTestId('quick-add-save').click();

  await expect(page.getByTestId('save-status')).toContainText('The save outcome is unknown');
  await expect(page.getByTestId('quick-add-domain')).toHaveValue('retry-create.example');
  await page.getByTestId('quick-add-save').click();
  await expect(page.getByTestId('capture-mode-quick')).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  await expect(page.getByRole('button', { name: /retry-create\.example/ })).toHaveCount(1);
});
