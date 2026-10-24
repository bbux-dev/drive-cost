import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-24T14:00:00-07:00') });
  await page.goto('/');
});

async function gasPrice(page, value = '4.50') {
  await page.getByRole('button', { name: 'One thing to get started' }).click();
  await page.getByRole('spinbutton', { name: 'Gas price per gallon' }).fill(value);
  await page.getByRole('button', { name: 'Save gas price' }).click();
}

test('starts empty and stays phone-sized on desktop and phone', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'What did that drive cost?' })).toBeVisible();
  await expect(page.locator('.hero-value')).toHaveText('$0.00');
  await expect(page.getByText('Same drive, fewer taps.')).toBeVisible();
  await expect(page.getByText(/Camp/i)).toHaveCount(0);
  expect(await page.locator('.app-shell').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(430);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.getByRole('link', { name: 'Calculator' })).toBeVisible();
});

test('loads without injected third-party scripts or browser policy errors', async ({ page }) => {
  const errors = [];
  const externalScripts = [];
  const origin = new URL(page.url()).origin;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (request.resourceType() === 'script' && new URL(request.url()).origin !== origin) externalScripts.push(request.url()); });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'What did that drive cost?' })).toBeVisible();
  await page.getByRole('link', { name: 'Calculator' }).click();
  await expect(page.getByRole('heading', { name: 'Before you hit the road.' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(externalScripts).toEqual([]);
});

test('logs electric-only use, persists after reload, and can delete it', async ({ page }) => {
  await page.getByRole('button', { name: 'Log a trip' }).click();
  await page.getByRole('textbox', { name: 'Trip name' }).fill('School pickup');
  await page.getByRole('spinbutton', { name: 'Electric used' }).fill('5');
  await expect(page.locator('#live-estimate .result-value')).toHaveText('$0.21');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.locator('.hero-value')).toHaveText('$0.21');
  await page.reload();
  await page.getByRole('button', { name: /School pickup/ }).click();
  await expect(page.getByText('Saved with 46 MPG')).toBeVisible();
  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  await page.getByRole('button', { name: 'Tap again to delete', exact: true }).click();
  await expect(page.locator('.hero-value')).toHaveText('$0.00');
});

test('missing-price setup preserves a mixed-trip draft', async ({ page }) => {
  await page.getByRole('button', { name: 'Log a trip' }).click();
  await page.getByRole('textbox', { name: 'Trip name' }).fill('Out of town');
  await page.getByRole('spinbutton', { name: 'Electric used' }).fill('25');
  await page.getByRole('spinbutton', { name: 'Gas used' }).fill('50');
  await expect(page.locator('#live-estimate')).toContainText('Add your gas price');
  await page.getByRole('button', { name: 'Set starting gas price' }).click();
  await page.getByRole('spinbutton', { name: 'Gas price per gallon' }).fill('4.50');
  await page.getByRole('button', { name: 'Save gas price' }).click();
  await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue('Out of town');
  await expect(page.locator('#live-estimate .result-value')).toHaveText('$5.92');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.locator('.hero-value')).toHaveText('$5.92');
});

test('fill-up determines new gas price and calculator never alters range', async ({ page }) => {
  await page.getByRole('link', { name: 'Fill-ups' }).click();
  await page.getByRole('button', { name: 'Log a fill-up' }).click();
  await page.getByRole('spinbutton', { name: 'Odometer' }).fill('50000');
  await page.getByRole('spinbutton', { name: 'Gallons added' }).fill('8');
  await page.getByRole('spinbutton', { name: 'Total paid' }).fill('36');
  await expect(page.locator('#fillup-price')).toContainText('$4.50 per gallon');
  await page.getByRole('button', { name: 'Save fill-up' }).click();
  await page.getByRole('link', { name: 'Calculator' }).click();
  await expect(page.locator('#calculator-result .result-value')).toHaveText('$8.36');
  await page.getByRole('spinbutton', { name: 'Total distance' }).fill('5');
  await expect(page.locator('#calculator-result .result-value')).toHaveText('$0.21');
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('drive-cost-v1')));
  expect(data.trips).toHaveLength(0);
  expect(data.range.electric).toBeNull();
  await page.reload();
  await expect(page.locator('#calculator-result .result-value')).toHaveText('$8.36');
});

test('active trip survives reload and handles increasing dashboard range', async ({ page }) => {
  await gasPrice(page);
  await page.getByRole('button', { name: 'Start a trip' }).click();
  await page.getByRole('textbox', { name: 'Trip name' }).fill('Drive home');
  await page.getByRole('spinbutton', { name: 'Electric range' }).fill('25');
  await page.getByRole('spinbutton', { name: 'Gas range' }).fill('150');
  await page.getByRole('button', { name: 'Start trip', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Finish trip', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Remaining electric range' }).fill('26');
  await page.getByRole('spinbutton', { name: 'Remaining gas range' }).fill('100');
  await page.getByRole('button', { name: 'Finish & save trip' }).click();
  await expect(page.locator('.form-error')).toContainText('A range increased');
  await page.getByRole('spinbutton', { name: 'Remaining electric range' }).fill('0');
  await expect(page.locator('#live-estimate .result-value')).toHaveText('$5.92');
  await page.getByRole('button', { name: 'Finish & save trip' }).click();
  await expect(page.getByText('Trip in progress')).toHaveCount(0);
  await expect(page.getByText('0 electric miles reported')).toBeVisible();
  await expect(page.locator('.hero-value')).toHaveText('$5.92');
});

test('shortcut is user-created and opens an editable trip before saving', async ({ page }) => {
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('textbox', { name: 'Shortcut name' }).fill('School');
  await page.getByRole('spinbutton', { name: 'Electric used' }).fill('5');
  await page.getByRole('button', { name: 'Save shortcut' }).click();
  await page.getByRole('button', { name: /^School 5 electric/ }).click();
  await expect(page.getByRole('spinbutton', { name: 'Electric used' })).toHaveValue('5');
  await page.getByRole('spinbutton', { name: 'Electric used' }).fill('6');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.locator('.hero-value')).toHaveText('$0.25');
  await expect(page.getByRole('button', { name: /^School 5 electric/ })).toBeVisible();
});

test('saved trip prices stay fixed after a new fill-up and edits', async ({ page }) => {
  await gasPrice(page);
  await page.getByRole('button', { name: 'Log a trip' }).click();
  await page.getByRole('textbox', { name: 'Trip name' }).fill('Gas drive');
  await page.getByRole('spinbutton', { name: 'Electric used' }).fill('0');
  await page.getByRole('spinbutton', { name: 'Gas used' }).fill('46');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await page.getByRole('link', { name: 'Fill-ups' }).click();
  await page.getByRole('button', { name: 'Log a fill-up' }).click();
  await page.getByRole('spinbutton', { name: 'Odometer' }).fill('60000');
  await page.getByRole('spinbutton', { name: 'Gallons added' }).fill('10');
  await page.getByRole('spinbutton', { name: 'Total paid' }).fill('60');
  await page.getByRole('button', { name: 'Save fill-up' }).click();
  await page.getByRole('link', { name: 'Trips', exact: true }).click();
  await page.getByRole('button', { name: /Gas drive/ }).click();
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Gas used' }).fill('92');
  await expect(page.locator('#live-estimate .result-value')).toHaveText('$9.00');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.hero-value')).toHaveText('$9.00');
});

test('offline reload retains the app and can save a new trip', async ({ page, context }) => {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'What did that drive cost?' })).toBeVisible();
  await page.getByRole('button', { name: 'Log a trip' }).click();
  await page.getByRole('spinbutton', { name: 'Electric used' }).fill('5');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await expect(page.locator('.hero-value')).toHaveText('$0.21');
});

test('electric-only trip can acquire gas miles after a price is entered', async ({ page }) => {
  await page.getByRole('button', { name: 'Log a trip' }).click();
  await page.getByRole('textbox', { name: 'Trip name' }).fill('Errand');
  await page.getByRole('spinbutton', { name: 'Electric used' }).fill('5');
  await page.getByRole('button', { name: 'Save trip', exact: true }).click();
  await gasPrice(page);
  await page.getByRole('button', { name: /Errand/ }).click();
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Gas used' }).fill('46');
  await expect(page.locator('#live-estimate .result-value')).toHaveText('$4.71');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.hero-value')).toHaveText('$4.71');
});

test('keyboard focus stays in sheets and narrow screens have no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('link', { name: 'Calculator' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
