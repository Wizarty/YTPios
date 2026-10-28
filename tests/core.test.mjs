import test from 'node:test';
import assert from 'node:assert/strict';
import { videoId, restore, filtered } from '../public/core.js';
import { server } from '../server.mjs';

test('recognizes official watch, mobile, short, live and share links', () => {
  for (const input of ['YE7VzlLtp-4', 'https://youtu.be/YE7VzlLtp-4?t=8', 'https://www.youtube.com/watch?v=YE7VzlLtp-4&list=abc', 'https://m.youtube.com/shorts/YE7VzlLtp-4', 'https://youtube.com/live/YE7VzlLtp-4']) assert.equal(videoId(input), 'YE7VzlLtp-4');
});
test('rejects lookalike domains, credentials, non-video URLs and script schemes', () => {
  for (const input of ['https://youtube.com.evil.test/watch?v=YE7VzlLtp-4', 'https://youtube.com@evil.test/watch?v=YE7VzlLtp-4', 'https://evil@youtube.com/watch?v=YE7VzlLtp-4', 'javascript:alert(1)', 'https://youtube.com/playlist?list=123', 'https://youtube.com/watch?v=short']) assert.equal(videoId(input), null);
});
test('restores storage defensively, deduplicates IDs and normalizes metadata', () => {
  assert.deepEqual(restore('{broken'), []);
  assert.deepEqual(restore('{}'), []);
  const items = restore(JSON.stringify([null, {id:'YE7VzlLtp-4', title:'Bunny', saved:true, viewed:12}, {id:'YE7VzlLtp-4'}, {id:'invalid'}, {id:'eRsGyueVLvQ', title:123, saved:'yes'}]));
  assert.equal(items.length, 2); assert.equal(items[1].saved, false); assert.equal(items[1].viewed, 0);
  assert.equal(filtered(items, 'saved', '').length, 1); assert.equal(filtered(items, 'history', '').length, 1); assert.equal(filtered(items, 'home', 'BUNNY')[0].id, 'YE7VzlLtp-4');
});
test('serves application assets and rejects arbitrary filesystem paths', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await fetch(base); assert.equal(html.status, 200); assert.match(await html.text(), /id="player"/);
    assert.match(html.headers.get('content-security-policy'), /frame-src https:\/\/www.youtube.com/);
    for (const path of ['/app.js','/core.js','/styles.css','/icon.svg']) assert.equal((await fetch(base + path)).status, 200);
    for (const path of ['/package.json', '/server.mjs', '/.git/config', '/%2e%2e/README.md']) assert.equal((await fetch(base + path)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
