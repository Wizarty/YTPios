import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { server } from '../server.mjs';

await mkdir('test-results', {recursive:true});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  for (const viewport of [{width:390,height:844}, {width:1440,height:1000}]) {
    const context = await browser.newContext({viewport});
    await context.route('https://i.ytimg.com/**', route => route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#222"/></svg>'}));
    // A controlled provider stub tests our integration, not YouTube playback.
    await context.route('https://www.youtube.com/iframe_api', route => route.fulfill({contentType:'text/javascript',body:`
      window.YT={Player:class {
        constructor(id,options){this.options=options;this.element=document.getElementById(id);this.element.textContent='YouTube test double';window.testPlayer=this;setTimeout(()=>options.events.onReady({target:this}),0)}
        loadVideoById(id){window.loadedVideo=id}
        destroy(){this.element.remove()}
      }};window.onYouTubeIframeAPIReady();
    `}));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    assert.equal(await page.locator('#empty').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path:`test-results/home-${viewport.width}.png`,fullPage:true});
    await page.locator('#add-top').click();
    await page.locator('#video-url').fill('https://youtube.com.evil.test/watch?v=YE7VzlLtp-4');
    await page.locator('#add-form .primary').click();
    assert.match(await page.locator('#add-error').textContent(), /Введите ссылку/);
    await page.locator('#video-url').fill('https://youtu.be/YE7VzlLtp-4');
    await page.locator('#video-title').fill('<img src=x onerror=alert(1)>');
    await page.locator('#add-form .primary').click();
    assert.equal(await page.locator('.card').count(), 1);
    assert.equal(await page.locator('.card-title img').count(), 0);
    await page.getByRole('button',{name:'Сохранить в избранное', exact:true}).click();
    await page.reload();
    assert.equal(await page.locator('.card-actions [aria-pressed=true]').count(),1);
    await page.locator('#search').fill('несуществующий запрос');
    assert.equal(await page.locator('.card').count(),0);
    assert.equal(await page.locator('#youtube-search').isVisible(),true);
    await page.locator('#search').fill('');
    await page.locator('.thumbnail').click();
    await page.waitForFunction(() => window.testPlayer);
    assert.equal(await page.locator('#watch').isVisible(),true);
    await page.locator('#minimize').click();
    assert.match(await page.locator('#watch').getAttribute('class'),/mini/);
    await page.locator('#mini-open').click();
    await page.evaluate(() => window.testPlayer.options.events.onError({data:101}));
    assert.match(await page.locator('#player-status').textContent(),/Автор запретил/);
    await page.locator('#close-player').click();
    await page.locator('.navigation [data-tab=history]').click();
    assert.equal(await page.locator('.card').count(),1);
    await page.locator('.card-actions .remove').click();
    await page.locator('.navigation [data-tab=home]').click();
    await page.locator('#examples').click();
    assert.equal(await page.locator('.card').count(),3);
    await page.locator('.card-actions button:nth-child(2)').nth(1).click();
    await page.locator('.thumbnail').first().click();
    await page.waitForFunction(() => window.testPlayer);
    await page.evaluate(() => window.testPlayer.options.events.onStateChange({data:0}));
    await page.waitForFunction(() => window.loadedVideo === 'eRsGyueVLvQ');
    assert.equal(await page.locator('#queue-count').textContent(),'0');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`PASS ${viewport.width}px: add, validation, safe titles, persistence, favorites, search, history, player controls, errors, queue, layout`);
  }
  const page = await browser.newPage();
  await page.route('https://www.youtube.com/iframe_api', route => route.abort());
  await page.route('https://i.ytimg.com/**', route => route.abort());
  await page.goto(base); await page.locator('#examples').click(); await page.locator('.thumbnail').first().click();
  await page.waitForFunction(() => document.getElementById('player-status').textContent.includes('YouTube недоступен'));
  console.log('PASS unavailable provider: actionable fallback displayed');
  const standalone = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const preview = await browser.newPage({viewport:{width:390,height:844}});
  const unexpectedRequests = [];
  await preview.route('**/*', route => {
    if (route.request().url() === base + '/nested/preview.html') return route.fulfill({contentType:'text/html',body:standalone});
    unexpectedRequests.push(route.request().url()); return route.abort();
  });
  await preview.goto(base + '/nested/preview.html');
  assert.equal(await preview.locator('.topbar').evaluate(el => getComputedStyle(el).position),'fixed');
  assert.equal(await preview.locator('.brand img').evaluate(el => el.complete && el.naturalWidth > 0),true);
  await preview.locator('#add-top').click();
  assert.equal(await preview.locator('#add-dialog').isVisible(),true);
  await preview.locator('#add-dialog [data-close]').click();
  assert.deepEqual(unexpectedRequests,[]);
  await preview.screenshot({path:'test-results/standalone-390.png',fullPage:true});
  console.log('PASS standalone preview: CSS, icons and interactions work without separate asset requests at a nested URL');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
