import test from 'node:test';
import assert from 'node:assert/strict';
import redirect from '../infra/https-redirect.js';

test('HTTP redirect preserves the complete path and query on the canonical HTTPS host', () => {
  const response = redirect.fetch(new Request('http://drivecost.bxtn.dev/some%20path?one=1&two=2'));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://drivecost.bxtn.dev/some%20path?one=1&two=2');
});

test('redirect handler cannot create an HTTPS redirect loop', () => {
  assert.equal(redirect.fetch(new Request('https://drivecost.bxtn.dev/')).status, 404);
});
