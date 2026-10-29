const CACHE='ytp-player-shell-v1';
const ASSETS=['./player.html','./player.css','./player.js','./player.webmanifest','./player-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('ytp-player-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const allowed=ASSETS.some(path=>new URL(path,self.registration.scope).href===event.request.url);
  if(!allowed)return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
