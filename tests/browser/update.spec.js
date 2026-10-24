import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../../scripts/preview.mjs';

test('a new release waits for an explicit update and preserves saved trips offline', async ({ page, context }) => {
  const directory = fileURLToPath(new URL('../../site/', import.meta.url));
  const worker = await readFile(new URL('../../site/sw.js', import.meta.url), 'utf8');
  const overrides = new Map([['/sw.js', worker.replace(/^const CACHE = '[^']+';/m, "const CACHE = 'drive-cost-release-one';")]]);
  const server = await createStaticServer(directory, overrides);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    await page.getByRole('button', { name: 'Log a trip' }).click();
    await page.getByRole('textbox', { name: 'Trip name' }).fill('Keep this trip');
    await page.getByRole('spinbutton', { name: 'Electric used' }).fill('5');
    await page.getByRole('button', { name: 'Save trip', exact: true }).click();
    overrides.set('/sw.js', worker.replace(/^const CACHE = '[^']+';/m, "const CACHE = 'drive-cost-release-two';"));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect(page.getByText('A fresh version is ready.')).toBeVisible();
    await page.getByRole('button', { name: 'Log a trip' }).click();
    await page.getByRole('textbox', { name: 'Trip name' }).fill('Unsaved draft');
    await expect(page.getByRole('textbox', { name: 'Trip name' })).toHaveValue('Unsaved draft');
    const cachesBefore = await page.evaluate(() => caches.keys());
    expect(cachesBefore).toContain('drive-cost-release-one');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('#update-banner')).toBeHidden();
    await expect(page.getByRole('button', { name: /Keep this trip/ })).toBeVisible();
    expect(await page.evaluate(() => caches.keys())).toEqual(['drive-cost-release-two']);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: /Keep this trip/ })).toBeVisible();
    await expect(page.getByText('Unsaved draft')).toHaveCount(0);
  } finally {
    await page.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
