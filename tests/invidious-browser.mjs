import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {server} from '../server.mjs';
await mkdir('test-results',{recursive:true});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const fixtures=[
  ['YE7VzlLtp-4','Big Buck Bunny — короткометражный фильм','Blender Foundation',596,1200000,'#51734b'],
  ['eRsGyueVLvQ','Sintel — история одного путешествия','Blender Foundation',888,234000,'#5b6083'],
  ['R6MlUcmOul8','Tears of Steel — за кадром будущего','Blender Foundation',734,760000,'#85695d'],
  ['aqz-KE-bpKQ','Истории, которые хочется пересмотреть','Видео для тестирования',1240,92000,'#557d85'],
  ['jNQXAC9IVRw','Вдохновение в простых моментах','Видео для тестирования',347,19000,'#896151'],
  ['dQw4w9WgXcQ','Музыка и настроение: новая подборка','Видео для тестирования',213,53000,'#80627e']
].map(([videoId,title,author,lengthSeconds,viewCount,color])=>({videoId,title,author,lengthSeconds,viewCount,color,publishedText:'2 дня назад'}));
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:950}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let query, fail=false;
    await page.route('https://i.ytimg.com/**',route=>{const fixture=fixtures.find(v=>route.request().url().includes(v.videoId))||fixtures[0];return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${fixture.color}"/><circle cx="440" cy="140" r="160" fill="#ffffff12"/><path d="M0 360 220 120 430 360M290 360 480 160 640 360" fill="#0003"/><text x="32" y="305" font-family="sans-serif" font-size="20" fill="white">TEST FIXTURE · ${fixture.videoId}</text></svg>`});});
    await page.route(base+'/api/v1/**',route=>{
      const req=route.request(),url=new URL(req.url());assert.equal(req.headers().authorization,undefined);assert.equal(url.searchParams.has('key'),false);
      if(fail)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
      let data=fixtures;
      if(url.pathname.endsWith('/search')){query=url.searchParams.get('q');data=url.searchParams.get('page')==='1'?fixtures.slice(0,2):[];}
      if(url.pathname.includes('/videos/')){const id=url.pathname.split('/').pop();data={...fixtures.find(v=>v.videoId===id),description:'Описание с сервера <script>не выполняется</script>',formatStreams:[{type:'video/mp4',url:base+'/test-video.mp4',qualityLabel:'360p'}],recommendedVideos:fixtures.filter(v=>v.videoId!==id)};}
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(base);await page.locator('#open-server').click();await page.locator('#server-url').fill(base);await page.locator('#server-form .primary').click();
    await page.waitForFunction(()=>document.querySelectorAll('.card').length===6);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`test-results/invidious-feed-${width}.png`,fullPage:true});
    if(width===390)await page.locator('#mobile-search').click();await page.locator('#search').fill('тест & видео');await page.locator('#search-form').evaluate(form=>form.requestSubmit());
    await page.waitForFunction(()=>document.querySelectorAll('.card').length===2);assert.equal(query,'тест & видео');
    await page.locator('.thumbnail').first().click();await page.waitForFunction(()=>document.querySelector('#native-video')?.currentTime>0.2);
    assert.equal(await page.locator('.player-frame iframe').count(),0);assert.equal(await page.locator('#quality').inputValue(),'0');
    assert.equal(await page.locator('#description-text script').count(),0);assert.equal(await page.locator('.related-card').count(),5);
    await page.locator('#minimize').click();assert.match(await page.locator('#watch').getAttribute('class'),/mini/);await page.locator('#mini-open').click();
    await page.screenshot({path:`test-results/invidious-watch-${width}.png`,fullPage:true});
    await page.locator('#close-player').click();assert.equal(await page.locator('#native-video').count(),0);
    fail=true;await page.locator('[data-category=Music]').click();await page.waitForFunction(()=>document.getElementById('feed-status').textContent.includes('503'));
    assert.equal(await page.locator('#feed-retry').isVisible(),true);fail=false;await page.locator('#feed-retry').click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===6);
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.card').length===6);
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS Invidious ${width}px: feed, search, settings, native MP4 playback, quality, related videos, mini-player, retry, persistence and no OAuth forwarding (API stub)`);
  }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
