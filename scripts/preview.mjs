import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

// Exercise Cloudflare's response-header rules during production browser checks.
export async function createStaticServer(directory, overrides = new Map()) {
  const root = resolve(directory);
  const rules = [];
  let rule;
  for (const line of (await readFile(resolve(root, '_headers'), 'utf8')).split('\n')) {
    if (line.startsWith('/')) { rule = { path: line.trim(), headers: {} }; rules.push(rule); }
    else if (rule && /^\s+[^:]+:/.test(line)) {
      const colon = line.indexOf(':');
      rule.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? '/index.html' : pathname;
      const target = resolve(root, `.${relative}`);
      let status = 200;
      let extension = extname(target);
      let body;
      try {
        if (!target.startsWith(`${root}${sep}`) || relative.split('/').some(part => part.startsWith('.'))) throw new Error('Not a public asset');
        body = overrides.has(pathname) ? overrides.get(pathname) : await readFile(target);
      } catch {
        status = 404; extension = '.html'; body = await readFile(resolve(root, '404.html'));
      }
      for (const item of rules) {
        if (item.path === '/*' || item.path === pathname) {
          for (const [name, value] of Object.entries(item.headers)) response.setHeader(name, value);
        }
      }
      response.writeHead(status, { 'Content-Type': mime[extension] || 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(500); response.end('Preview could not serve this asset.');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createStaticServer(fileURLToPath(new URL('../dist/', import.meta.url)));
  server.listen(4180, '127.0.0.1', () => console.log('Production preview: http://127.0.0.1:4180'));
}
