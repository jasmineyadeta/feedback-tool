// Deterministic fixture sites for e2e. Each fixture gets its own port so paths are preserved.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const sites = { 4601: 'static', 4602: 'spa', 4603: 'csp-xfo', 4604: 'sw', 4605: 'forms', 4606: 'anim' };
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

for (const [port, name] of Object.entries(sites)) {
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end('no'); return; }
    if (url.pathname === '/redirect-out') { res.writeHead(302, { location: 'https://example.org/' }).end(); return; }
    if (url.pathname === '/redirect-in') { res.writeHead(301, { location: '/about.html' }).end(); return; }
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    let file = path.join(dir, name, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    let body;
    try { body = await readFile(file); } catch {
      if (name === 'spa') { file = path.join(dir, name, 'index.html'); body = await readFile(file); }
      else { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    }
    const headers = { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'set-cookie': 'tracker=1; Path=/' };
    if (name === 'csp-xfo') Object.assign(headers, { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'; script-src 'none'" });
    res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : body);
  };
  // Loopback only, both stacks ("localhost" may resolve to ::1 or 127.0.0.1).
  createServer(handler).listen(Number(port), '127.0.0.1');
  createServer(handler).listen(Number(port), '::1');
}
console.info('fixtures listening on 4601-4606');
