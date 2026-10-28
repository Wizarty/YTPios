import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./public/', import.meta.url);
const files = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'],
  ['/core.js', 'core.js'], ['/styles.css', 'styles.css'], ['/icon.svg', 'icon.svg'],
  ['/youtube.js', 'youtube.js'], ['/integration.js', 'integration.js']
]);
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml' };
export const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = files.get(path);
  if (!file || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const body = await readFile(new URL(file, root));
    res.writeHead(200, {
      'Content-Type': types[file.split('.').pop()],
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style; img-src 'self' https://i.ytimg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com; connect-src 'self' https://www.googleapis.com https://accounts.google.com https://oauth2.googleapis.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cache-Control': 'no-cache'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Unable to read asset'); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => console.log(`YTPios listening on port ${port}`));
}
