import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./public/', import.meta.url);
const files = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'],
  ['/core.js', 'core.js'], ['/styles.css', 'styles.css'], ['/icon.svg', 'icon.svg'],
  ['/youtube.js', 'youtube.js'], ['/integration.js', 'integration.js'], ['/config.js', 'config.js']
]);
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml' };
for (const file of ['player.html','player.css','player.js','player.webmanifest','player-sw.js','player-icon.png','test-video.mp4']) files.set('/'+file,file);
Object.assign(types,{webmanifest:'application/manifest+json',png:'image/png',mp4:'video/mp4'});
export const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = files.get(path);
  if (!file || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const body = await readFile(new URL(file, root));
    if(file.endsWith('.mp4')){
      const range=req.headers.range;
      if(range){
        const match=/^bytes=(\d+)-(\d*)$/.exec(range);
        const start=match?Number(match[1]):-1, end=match&&match[2]?Math.min(Number(match[2]),body.length-1):body.length-1;
        if(start<0||start>=body.length||end<start){res.writeHead(416,{'Content-Range':`bytes */${body.length}`});res.end();return;}
        res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${body.length}`,'Content-Length':end-start+1});res.end(req.method==='HEAD'?undefined:body.subarray(start,end+1));return;
      }
      res.writeHead(200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':body.length});res.end(req.method==='HEAD'?undefined:body);return;
    }
    res.writeHead(200, {
      'Content-Type': types[file.split('.').pop()],
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; media-src 'self' blob:; worker-src 'self'; manifest-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style; img-src 'self' https://i.ytimg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com; connect-src 'self' https://www.googleapis.com https://accounts.google.com https://oauth2.googleapis.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
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
