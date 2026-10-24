import { spawnSync } from 'node:child_process';
import { preflight } from './cloudflare.mjs';

try {
  await preflight();
  for (const args of [['check'], ['test'], ['build'], ['e2e:production'], ['exec', 'sst', 'deploy', '--stage', 'prod'], ['verify']]) {
    const result = spawnSync('pnpm', args, { stdio: 'inherit', env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
