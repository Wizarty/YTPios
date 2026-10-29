import test from 'node:test';
import assert from 'node:assert/strict';
import {Invidious,instanceURL,normalizeVideo,durationLabel} from '../public/invidious.js';
test('instance URL validation permits TLS APIs but rejects credentials and query tricks',()=>{
  assert.equal(instanceURL('https://video.example/api/v1/'),'https://video.example/');
  assert.equal(instanceURL('http://localhost:3333'),'http://localhost:3333/');
  for(const url of ['http://video.example','https://user:password@video.example','https://video.example?key=secret','javascript:alert(1)'])assert.throws(()=>instanceURL(url));
});
test('Invidious requests never attach OAuth credentials and correctly encode search',async()=>{
  let call;
  const api=new Invidious('https://video.example',async(url,options)=>{call={url:new URL(url),options};return new Response(JSON.stringify([{videoId:'YE7VzlLtp-4',title:'Video',lengthSeconds:720}]));});
  const videos=await api.search('a & b',2);
  assert.equal(call.url.pathname,'/api/v1/search');assert.equal(call.url.searchParams.get('q'),'a & b');assert.equal(call.url.searchParams.get('page'),'2');assert.equal(call.options.credentials,'omit');assert.equal(call.options.headers,undefined);assert.equal(videos[0].id,'YE7VzlLtp-4');
  await api.feed('Music');assert.equal(call.url.searchParams.get('type'),'music');
});
test('selects combined MP4 streams, rejecting unsafe URLs and video-only adaptive formats',()=>{
  const api=new Invidious('https://video.example');
  const streams=api.streams({formatStreams:[{type:'video/mp4',url:'/stream?id=x',qualityLabel:'360p'},{type:'video/mp4',url:'https://r1.googlevideo.com/videoplayback',qualityLabel:'720p'},{type:'video/mp4',url:'javascript:alert(1)'},{type:'video/mp4',url:'https://tracker.example/video.mp4'},{type:'video/mp4'}],adaptiveFormats:[{type:'video/mp4',url:'/video-only',qualityLabel:'1080p'}]});
  assert.equal(streams.length,2);assert.equal(streams[0].label,'720p');assert.equal(streams[1].url,'https://video.example/stream?id=x');
  assert.equal(api.mediaURL('https://name:password@video.example/v'),null);
});
test('invalid API responses and unsupported items fail explicitly',async()=>{
  assert.equal(normalizeVideo({videoId:'<bad>'}),null);assert.equal(durationLabel(3661),'1:01:01');
  const api=new Invidious('https://video.example',async()=>new Response('<html>site</html>'));
  await assert.rejects(api.feed(),/JSON API/);
});
