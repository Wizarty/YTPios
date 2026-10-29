import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.mjs';
test('PWA resources and byte-range video delivery work',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const file of ['player.html','player.js','player.css','player-sw.js','player-icon.png'])assert.equal((await fetch(`${base}/${file}`)).status,200);
    const manifest=await(await fetch(`${base}/player.webmanifest`)).json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./player.html');
    const part=await fetch(`${base}/test-video.mp4`,{headers:{Range:'bytes=0-1023'}});assert.equal(part.status,206);assert.equal((await part.arrayBuffer()).byteLength,1024);assert.match(part.headers.get('content-range'),/^bytes 0-1023\//);
    assert.equal((await fetch(`${base}/test-video.mp4`,{headers:{Range:'bytes=999999999-'}})).status,416);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
