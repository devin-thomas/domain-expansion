import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const signInEndpoint = /https:\/\/identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithEmailLink(?:\?.*)?$/;
const invalidActionCode = {
  error: {
    code: 400,
    message: 'INVALID_OOB_CODE',
  },
};

async function stubInvalidEmailLink(page: Page, requests: Array<{ body: Record<string, unknown>; url: string }>): Promise<void> {
  await page.route(signInEndpoint, async (route: Route) => {
    requests.push({
      url: route.request().url(),
      body: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
    });
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(invalidActionCode) });
  });
}

test('strips invalid callback parameters without sending an auth request', async ({ page }) => {
  const requests: Array<{ body: Record<string, unknown>; url: string }> = [];
  await stubInvalidEmailLink(page, requests);
  await page.goto('/auth/finish?apiKey=synthetic-key&mode=resetPassword&oobCode=synthetic-invalid-code&email=spoof%40example.com&uid=spoof-user');

  await expect(page.getByRole('alert')).toContainText('Request a new link');
  await expect(page).toHaveURL('http://127.0.0.1:4173/auth/finish');
  expect(requests).toHaveLength(0);
  await expect(page.getByText(/synthetic-invalid-code|spoof@example\.com|spoof-user/)).toHaveCount(0);
});

test('stored-email link failure reports safe retry and removes the callback query', async ({ page }) => {
  const requests: Array<{ body: Record<string, unknown>; url: string }> = [];
  await stubInvalidEmailLink(page, requests);
  await page.addInitScript(() => {
    sessionStorage.setItem('domain-expansion-email-for-sign-in', 'stored@example.com');
  });
  await page.goto('/auth/finish?apiKey=synthetic-key&mode=signIn&oobCode=synthetic-expired-code');

  await expect(page.getByRole('alert')).toContainText('invalid, expired, or already used');
  await expect(page.getByRole('alert')).toContainText('Request another link');
  await expect(page).toHaveURL('http://127.0.0.1:4173/auth/finish');
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every(({ body }) => body.email === 'stored@example.com' && body.oobCode === 'synthetic-expired-code')).toBe(true);
  await expect(page.getByText(/synthetic-expired-code|stored@example\.com/)).toHaveCount(0);
});

test('cross-device flow ignores URL identity fields and sends the explicitly entered email to Firebase', async ({ page }) => {
  const requests: Array<{ body: Record<string, unknown>; url: string }> = [];
  await stubInvalidEmailLink(page, requests);
  await page.goto('/auth/finish?apiKey=synthetic-key&mode=signIn&oobCode=synthetic-reused-code&email=url-spoof%40example.com&uid=spoof-user&continueUrl=https%3A%2F%2Fattacker.example');

  const emailInput = page.getByRole('textbox', { name: 'Confirm the email that received the link' });
  await expect(emailInput).toBeVisible();
  await expect(emailInput).toHaveValue('');
  await emailInput.fill('entered@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('alert')).toContainText('Check the email address and request a new link');
  await expect(page).toHaveURL('http://127.0.0.1:4173/auth/finish');
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].body).toMatchObject({ email: 'entered@example.com', oobCode: 'synthetic-reused-code' });
  expect(requests[0].body).not.toHaveProperty('uid');
  expect(requests[0].body).not.toHaveProperty('continueUrl');
  await expect(page.getByText(/url-spoof@example\.com|spoof-user|attacker\.example|synthetic-reused-code/)).toHaveCount(0);
});
