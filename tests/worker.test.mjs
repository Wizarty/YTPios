import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {streamURL} from '../worker/index.mjs';
test('worker blocks credentials, foreign origins and arbitrary proxy paths',async()=>{
  for(const [path,headers,status] of [['/api/v1/trending',{Authorization:'Bearer test'},400],['/api/v1/trending',{Origin:'https://other.example'},403],['/anything',{},404]]) {
    const r=await worker.fetch(new Request('https://worker.example'+path,{headers}),{});
    assert.equal(r.status,status);
  }
  assert.throws(()=>streamURL('https://evil.example/video','instance.example'));
  assert.throws(()=>streamURL('https://user:pass@instance.example/video','instance.example'));
  assert.equal(streamURL('https://r1.googlevideo.com/videoplayback','instance.example').protocol,'https:');
});
test('worker discovers instances, rewrites streams and forwards Range without credentials',async()=>{
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push([String(url),options]);
    if(String(url)==='https://api.invidious.io/')return Response.json([['instance.example',{api:true,uri:'https://instance.example'}]]);
    if(String(url).includes('/api/v1/videos/'))return Response.json({formatStreams:[{itag:18,url:'https://instance.example/videoplayback',type:'video/mp4'}]});
    return new Response('bytes',{status:206,headers:{'Content-Range':'bytes 0-4/10','Content-Type':'video/mp4'}});
  };
  try{
    const r=await worker.fetch(new Request('https://worker.example/api/v1/videos/abcdefghijk'),{});
    const data=await r.json();assert.match(data.formatStreams[0].url,/worker.example\/media\/abcdefghijk\/18/);
    const media=await worker.fetch(new Request(data.formatStreams[0].url,{headers:{Range:'bytes=0-4'}}),{});
    assert.equal(media.status,206);assert.equal(media.headers.get('Content-Range'),'bytes 0-4/10');
    assert.deepEqual(calls.at(-1)[1].headers,{Range:'bytes=0-4'});
  }finally{globalThis.fetch=original;}
});
