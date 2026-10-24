import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const source = new URL('../site/', import.meta.url);
const output = new URL('../dist/', import.meta.url);

// Only the public site directory is copied. Credentials and SST state never enter dist/.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

const hash = createHash('sha256');
for (const entry of (await readdir(source)).sort()) {
  if (entry.startsWith('.')) throw new Error(`Unexpected hidden file in public site directory: ${entry}`);
  hash.update(entry);
  hash.update(await readFile(new URL(entry, source)));
}
const revision = hash.digest('hex').slice(0, 16);
const workerPath = new URL('sw.js', output);
const worker = await readFile(workerPath, 'utf8');
if (!/^const CACHE = '[^']+';/m.test(worker)) throw new Error('Service worker cache version marker is missing.');
await writeFile(workerPath, worker.replace(/^const CACHE = '[^']+';/m, `const CACHE = 'drive-cost-${revision}';`));
console.log(`Built ${fileURLToPath(output)} · release ${revision}`);
