import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

const origin = 'https://drivecost.bxtn.dev';
const get = (path, options = {}) => fetch(`${origin}${path}`, { signal: AbortSignal.timeout(20_000), ...options });

async function verify() {
  const home = await get('/');
  assert.equal(home.status, 200, 'HTTPS homepage');
  assert.match(home.headers.get('server') || '', /cloudflare/i, 'Cloudflare hosting');
  assert.match(home.headers.get('cache-control') || '', /no-transform/, 'Disable injected analytics and detection scripts');
  assert.match(home.headers.get('content-security-policy') || '', /script-src 'self'/, 'Same-origin scripts');
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  const html = await home.text();
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  assert.equal(scripts.length, 1, 'Only the application script is present');
  assert.match(scripts[0], /src="\.\/app\.js"/);

  for (const path of ['/sw.js', '/app.js', '/domain.js', '/styles.css', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    if (path === '/sw.js') {
      assert.match(response.headers.get('cache-control') || '', /no-cache/);
      assert.equal(await response.text(), await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8'), 'Deployed release matches local verified build');
    }
    if (path === '/manifest.webmanifest') {
      const manifest = await response.json();
      assert.equal(manifest.display, 'standalone');
      assert.equal(manifest.icons.length, 2);
    }
  }
  const missing = await get('/a-page-that-does-not-exist');
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /A little off route/);
  for (const path of ['/.env', '/sst.config.ts', '/package.json']) assert.equal((await get(path)).status, 404, `Source files stay out of the public bundle: ${path}`);

  const insecure = await fetch('http://drivecost.bxtn.dev/?verify=1', { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  assert.equal(insecure.status, 301, 'HTTP redirects to HTTPS');
  assert.equal(insecure.headers.get('location'), `${origin}/?verify=1`, 'Redirect preserves path and query');
}

for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    await verify();
    console.log(`Verified ${origin}: HTTPS redirect, policies, no injected scripts, PWA assets, matching release, 404 responses, and no exposed source or environment files.`);
    break;
  } catch (error) {
    if (attempt === 4) { console.error(`Hosted verification failed: ${error.message}`); process.exitCode = 1; }
    else { console.log(`Waiting for deployment propagation (${attempt}/4).`); await setTimeout(5000); }
  }
}
