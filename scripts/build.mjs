import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { GOOGLE_CLIENT_ID } from '../public/config.js';

const root = new URL('../', import.meta.url);
// Public OAuth application identifier only. Never pass client secrets or tokens.
const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim() || GOOGLE_CLIENT_ID;
if (clientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
  throw new Error('GOOGLE_CLIENT_ID must be a public Web application Client ID ending in .apps.googleusercontent.com');
}
const [template, css, icon, bundle] = await Promise.all([
  readFile(new URL('public/index.html', root), 'utf8'),
  readFile(new URL('public/styles.css', root), 'utf8'),
  readFile(new URL('public/icon.svg', root)),
  build({entryPoints:[new URL('public/app.js', root).pathname], bundle:true, write:false, format:'iife', target:'safari16.4', minify:true, define:{__GOOGLE_CLIENT_ID__:JSON.stringify(clientId)}})
]);
const iconURL = `data:image/svg+xml;base64,${icon.toString('base64')}`;
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = template
  .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="./app.js"></script>', '')
  .replaceAll('"./icon.svg"', `"${iconURL}"`)
  .replace('</body>', () => `<script>${js}</script>\n</body>`);
await mkdir(new URL('dist/', root), {recursive:true});
await writeFile(new URL('dist/index.html', root), html);
console.log('Built dist/index.html: bundled scripts, styles and local icons. YouTube still requires network access.');
