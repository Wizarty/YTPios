import { videoId, restore, filtered } from './core.js';
import { initIntegration } from './integration.js';
import { Invidious, normalizeVideo, durationLabel } from './invidious.js';
import { NativePlayer } from './native-player.js';
import { INVIDIOUS_URL } from './config.js';
const $ = s => document.querySelector(s);
const storageKey = 'ytpios.library.v1';
let videos = [], storageAvailable = true;
try { videos = restore(localStorage.getItem(storageKey)); } catch { storageAvailable = false; }
let tab = 'home', query = '', current = null, queue = [], player = null, apiPromise, toastTimer;
let backend=null, discovered=null, feedVersion=0, feedPage=1, feedQuery='', category='Default', playVersion=0, native=null, activeStreams=[];
try { const stored=localStorage.getItem('ytpios.invidious.v1');const url=stored===null?(typeof __INVIDIOUS_URL__==='string'?__INVIDIOUS_URL__:INVIDIOUS_URL):stored;if(url)backend=new Invidious(url); }catch{}
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4000); }
function persist() { try { localStorage.setItem(storageKey, JSON.stringify(videos)); } catch { storageAvailable = false; toast('Браузер не разрешил сохранение. Подборка доступна до закрытия страницы.'); } }
function action(label, title, fn) { const b = node('button', '', label); b.type = 'button'; b.setAttribute('aria-label', title); b.title = title; b.onclick = fn; return b; }
function setTab(value) { tab = value; feedVersion++; document.querySelectorAll('.navigation [data-tab]').forEach(b => b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')); document.querySelectorAll('.filters [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab)); $('#feed-status').textContent='';$('#feed-retry').hidden=true;render();if(tab==='home'&&backend)loadFeed(); }
function ensureVideo(v){const existing=videos.find(x=>x.id===v.id);if(existing)return existing;if(videos.length>=500){toast('Видеотека заполнена. Удалите ненужные видео.');return null;}const item={...v,saved:false,viewed:0};videos.unshift(item);persist();return item;}
async function loadFeed(append=false){
  if(!backend)return;const instance=backend,ticket=++feedVersion;const page=append?feedPage+1:1;
  if(!append)discovered=[];$('#feed-status').textContent='Загрузка видео…';$('#feed-retry').hidden=true;$('#feed-more').disabled=true;render();
  try{const items=feedQuery?await instance.search(feedQuery,page):await instance.feed(category);if(ticket!==feedVersion)return;
    const old=append?discovered:[];discovered=[...old,...items.filter(v=>!old.some(x=>x.id===v.id))];feedPage=page;$('#feed-status').textContent=items.length?'':'Видео не найдены.';$('#feed-more').hidden=!feedQuery||items.length===0;render();
  }catch(e){if(ticket===feedVersion){$('#feed-status').textContent=e.message;$('#feed-retry').hidden=false;$('#feed-more').hidden=true;}}
  finally{if(ticket===feedVersion)$('#feed-more').disabled=false;}
}
function saveVideo(id) { const v = videos.find(v => v.id === id); if (!v) return; v.saved = !v.saved; persist(); render(); updateCurrent(); }
function enqueue(id) { if (!queue.includes(id)) { queue.push(id); renderQueue(); toast('Добавлено в очередь'); } else toast('Видео уже в очереди'); }
function render() {
  $('#heading').textContent = tab==='home'&&backend?(feedQuery?`Результаты: ${feedQuery}`:'Сейчас смотрят'):{home:'Главная', saved:'Избранное', history:'История открытия'}[tab];
  const remote=tab==='home'&&backend&&discovered!==null;
  const visible = remote?discovered:filtered(videos, tab, query);
  $('#video-count').textContent = visible.length ? `${visible.length} видео` : '';
  $('#empty').hidden = Boolean(backend) || videos.length > 0 || query !== '' || tab !== 'home';
  if(!remote)$('#feed-more').hidden=true;
  $('#no-results').hidden = visible.length > 0 || !$('#empty').hidden;
  const grid = $('#grid'); grid.replaceChildren();
  for (const v of visible) {
    const card = node('article', 'card');
    const thumbnail = action('', `Смотреть: ${v.title}`, () => {if(ensureVideo(v))openVideo(v.id);}); thumbnail.className = 'thumbnail';
    const img = node('img'); img.src = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`; img.alt = ''; img.loading = 'lazy';
    thumbnail.append(img, node('span', 'play-badge', '▶'));
    if(v.duration)thumbnail.append(node('span','duration',durationLabel(v.duration)));
    const body = node('div', 'card-body'), info = node('div', 'card-info');
    const title = action(v.title, `Смотреть: ${v.title}`, () => {if(ensureVideo(v))openVideo(v.id);}); title.className = 'card-title';
    info.append(title, node('p', 'card-meta', v.author||'YouTube · В вашей видеотеке'));
    if(v.views||v.published)info.append(node('p','card-meta',`${v.views?new Intl.NumberFormat('ru',{notation:'compact'}).format(v.views)+' просмотров':''}${v.views&&v.published?' · ':''}${v.published||''}`));
    const actions = node('div', 'card-actions');
    const saved=videos.find(x=>x.id===v.id)?.saved;
    const save = action(saved ? '♥ Сохранено' : '♡ Сохранить', saved ? 'Убрать из избранного' : 'Сохранить в избранное', () => {if(ensureVideo(v))saveVideo(v.id);}); save.setAttribute('aria-pressed', String(Boolean(saved)));
    const remove = action('✕', `Удалить: ${v.title}`, () => { videos = videos.filter(x => x.id !== v.id); queue = queue.filter(x => x !== v.id); if (current === v.id) closePlayer(); persist(); render(); renderQueue(); }); remove.className = 'remove';
    actions.append(save, action('＋', `В очередь: ${v.title}`, () => {if(ensureVideo(v))enqueue(v.id);}));if(!remote)actions.append(remove);info.append(actions); body.append(node('span', 'channel-mark', (v.author||'▶').slice(0,1)), info); card.append(thumbnail, body); grid.append(card);
  }
  $('#youtube-search').hidden = !query;
  $('#youtube-search').href = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
function renderQueue() {
  $('#queue-count').textContent = String(queue.length);
  const list = $('#queue-list'); list.replaceChildren();
  for (const id of queue) {
    const v = videos.find(v => v.id === id); if (!v) continue;
    const row = node('div', 'queue-item'); row.append(action(v.title, `Смотреть: ${v.title}`, () => { queue = queue.filter(x => x !== id); openVideo(id); }), action('✕', `Убрать из очереди: ${v.title}`, () => { queue = queue.filter(x => x !== id); renderQueue(); })); list.append(row);
  }
  if (!queue.length) list.append(node('p', 'queue-hint', 'Очередь пока пуста'));
}
function updateCurrent() { const v = videos.find(v => v.id === current); if (!v) return; $('#watch-title').textContent = v.title; $('#save-current').textContent = v.saved ? '♥ Сохранено' : '♡ Сохранить'; $('#save-current').setAttribute('aria-pressed', String(v.saved)); $('#open-original').href = `https://www.youtube.com/watch?v=${v.id}`; }
function loadAPI() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
    const timeout = setTimeout(() => fail(), 15000);
    function fail() { clearTimeout(timeout); script.remove(); apiPromise = null; reject(new Error('YouTube недоступен. Закройте плеер и попробуйте снова или откройте видео на YouTube.')); }
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); resolve(); };
    script.onerror = fail; document.head.append(script);
  }); return apiPromise;
}
function playerError(event) {
  const errors = {2:'Некорректная ссылка на видео.', 5:'Браузер не смог воспроизвести это видео.', 100:'Видео удалено или недоступно.', 101:'Автор запретил просмотр на других сайтах.', 150:'Автор запретил просмотр на других сайтах.', 153:'YouTube не смог подтвердить источник плеера.'};
  $('#player-status').textContent = `${errors[event.data] || 'Не удалось воспроизвести видео.'} Попробуйте открыть его на YouTube.`;
}
async function openVideo(id) {
  const v = videos.find(v => v.id === id); if (!v) return;
  const ticket=++playVersion;
  current = id; v.viewed = Date.now(); persist(); render(); updateCurrent(); renderQueue();
  $('#watch').hidden = false; $('#watch').classList.remove('mini'); $('#mini-open').hidden = true;
  $('#player-status').textContent = 'Загрузка плеера YouTube…'; $('#close-player').focus();
  $('#watch-author').textContent=v.author||'';$('#related-list').replaceChildren();$('#video-description').hidden=true;
  if(backend){
    player?.destroy?.();player=null;native?.destroy();native=null;
    $('#native-pip').hidden=false;$('#quality-label').hidden=true;$('#playback-mode').textContent='Собственный плеер · Invidious';$('#player-status').textContent='Загрузка видео…';
    const instance=backend;
    try{const data=await instance.details(id);if(ticket!==playVersion)return;
      const metadata=normalizeVideo(data);if(metadata&&metadata.id===id){Object.assign(v,{title:metadata.title,author:metadata.author,duration:metadata.duration,views:metadata.views});persist();updateCurrent();$('#watch-author').textContent=v.author;}
      $('#description-text').textContent=typeof data.description==='string'?data.description:'';$('#video-description').hidden=!data.description;
      activeStreams=instance.streams(data);
      native=new NativePlayer($('.player-frame'),{status:message=>{if(ticket===playVersion)$('#player-status').textContent=message;},onEnded:()=>{if(queue.length)openVideo(queue.shift());}});
      if(!activeStreams.length&&data.hlsUrl&&native.video.canPlayType('application/vnd.apple.mpegurl')){const url=instance.mediaURL(data.hlsUrl);if(url)activeStreams=[{url,label:'Авто (HLS)'}];}
      if(!activeStreams.length)throw new Error('Сервер не вернул совместимый поток с видео и звуком. Проверьте Invidious и его видеопрокси.');
      $('#quality').replaceChildren();activeStreams.forEach((stream,index)=>{const option=node('option','',stream.label);option.value=String(index);$('#quality').append(option);});$('#quality-label').hidden=false;
      native.setSource(activeStreams[0].url,v);
      for(const related of (data.recommendedVideos||[]).map(normalizeVideo).filter(Boolean).slice(0,12)){const row=action('','Смотреть: '+related.title,()=>{if(ensureVideo(related))openVideo(related.id);});row.className='related-card';const image=node('img');image.src=`https://i.ytimg.com/vi/${related.id}/mqdefault.jpg`;image.alt='';image.loading='lazy';const text=node('span');text.append(node('strong','',related.title),node('small','',related.author));row.append(image,text);$('#related-list').append(row);}
    }catch(e){if(ticket===playVersion)$('#player-status').textContent=e.message;}
    return;
  }
  native?.destroy();native=null;$('#native-pip').hidden=true;$('#quality-label').hidden=true;$('#playback-mode').textContent='Официальный плеер YouTube';
  try {
    await loadAPI(); if (ticket!==playVersion) return;
    if (player?.loadVideoById) { player.loadVideoById(id); $('#player-status').textContent = 'Если видео не запустилось, нажмите ▶ в плеере.'; return; }
    if (player) return;
    player = new window.YT.Player('player', {
      videoId: id, width:'100%', height:'100%', playerVars:{playsinline:1, controls:1, autoplay:1, origin:location.origin, rel:0},
      events: {
        onReady: event => {
          if (!current) return;
          if (current !== id) event.target.loadVideoById(current);
          $('#player-status').textContent = 'Если видео не запустилось, нажмите ▶ в плеере.';
        },
        onStateChange: event => { if (event.data === 1) $('#player-status').textContent = ''; if (event.data === 0 && queue.length) { const next = queue.shift(); openVideo(next); } },
        onError: playerError
      }
    });
  } catch (error) { if (current === id) $('#player-status').textContent = error.message; }
}
function closePlayer() {
  playVersion++;native?.destroy();native=null;
  current = null; player?.destroy?.(); player = null;
  const frame = $('.player-frame'); frame.replaceChildren(); const target = node('div'); target.id = 'player'; frame.append(target);
  $('#watch').hidden = true; $('#mini-open').hidden = true; $('#add-top').focus();
}
function showAdd() { $('#add-error').textContent = ''; $('#add-dialog').showModal(); $('#video-url').focus(); }
$('#add-top').onclick = showAdd; $('#add-empty').onclick = showAdd;
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { if (current) { $('#watch').classList.add('mini'); $('#mini-open').hidden = false; } if(b.dataset.tab==='home'&&b.closest('.navigation')){feedQuery='';query='';$('#search').value='';} setTab(b.dataset.tab); });
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
for (const id of ['about-button', 'about-sidebar', 'limitations']) $(`#${id}`).onclick = () => $('#about-dialog').showModal();
$('#add-form').onsubmit = event => {
  event.preventDefault(); const id = videoId($('#video-url').value);
  if (!id) { $('#add-error').textContent = 'Введите ссылку на видео YouTube или его идентификатор из 11 символов.'; return; }
  if (videos.some(v => v.id === id)) { $('#add-error').textContent = 'Это видео уже в вашей видеотеке.'; return; }
  if (videos.length >= 500) { $('#add-error').textContent = 'В видеотеке уже 500 видео. Удалите ненужные перед добавлением.'; return; }
  videos.unshift({id, title:$('#video-title').value.trim() || `Видео ${id}`, saved:false, viewed:0}); persist(); query = ''; $('#search').value = ''; setTab('home'); $('#add-dialog').close(); $('#add-form').reset(); toast('Видео добавлено');
};
$('#examples').onclick = () => { for (const [id, title] of [['YE7VzlLtp-4','Big Buck Bunny · Blender Foundation'],['eRsGyueVLvQ','Sintel · Blender Foundation'],['R6MlUcmOul8','Tears of Steel · Blender Foundation']]) if (!videos.some(v => v.id === id)) videos.push({id,title,saved:false,viewed:0}); persist(); render(); toast('Добавлены три примера. Нажмите на видео для просмотра.'); };
$('#search').oninput = event => { query = event.target.value.trim(); render(); };
$('#search-form').onsubmit = event => { event.preventDefault(); $('#search').blur();document.body.classList.remove('search-open');$('#mobile-search').setAttribute('aria-expanded','false');if(backend){feedQuery=query;setTab('home');}else{render();if(query)$('#youtube-search').click();} };
$('#save-current').onclick = () => saveVideo(current);
$('#close-player').onclick = closePlayer;
$('#minimize').onclick = () => { $('#watch').classList.add('mini'); $('#mini-open').hidden = false; $('#mini-open').focus(); };
$('#mini-open').onclick = () => { $('#watch').classList.remove('mini'); $('#mini-open').hidden = true; $('#close-player').focus(); };
$('#share-current').onclick = async () => {
  if (!current) return; const url = `https://www.youtube.com/watch?v=${current}`;
  try { if (navigator.share) await navigator.share({title:$('#watch-title').textContent, url}); else { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } } catch (e) { if (e.name !== 'AbortError') toast('Не удалось поделиться. Используйте кнопку «На YouTube».'); }
};
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.querySelector('dialog[open]') && current) closePlayer(); });
render(); renderQueue();
if (!storageAvailable) toast('Хранилище браузера недоступно. Подборка сохранится только до закрытия страницы.');
initIntegration({
  currentVideo: () => videos.find(v => v.id === current),
  importVideo: (video, play) => {
    if (!videos.some(v => v.id === video.id)) {
      if (videos.length >= 500) { toast('Видеотека заполнена. Удалите ненужные видео.'); return false; }
      videos.unshift({...video, saved:false, viewed:0}); persist(); render();
    }
    if (play) openVideo(video.id); else toast('Видео в вашей видеотеке');
    return true;
  }
});
$('#native-pip').onclick=()=>native?.pip();
$('#quality').onchange=()=>{const stream=activeStreams[Number($('#quality').value)];const v=videos.find(v=>v.id===current);if(native&&stream)native.setSource(stream.url,{...v,position:native.video.currentTime});};
$('#mobile-search').onclick=()=>{const open=document.body.classList.toggle('search-open');$('#mobile-search').setAttribute('aria-expanded',String(open));if(open)$('#search').focus();};
$('#nav-toggle').onclick=()=>{const collapsed=document.body.classList.toggle('nav-collapsed');$('#nav-toggle').setAttribute('aria-expanded',String(!collapsed));};
function serverSettings(){$('#server-url').value=backend?.base||'';$('#server-status').textContent='';$('#server-dialog').showModal();}
$('#open-server').onclick=serverSettings;$('#connect-empty').onclick=serverSettings;
$('#server-form').onsubmit=event=>{event.preventDefault();try{const next=new Invidious($('#server-url').value);if(!next.base)throw new Error('Введите адрес сервера. Для отключения используйте кнопку ниже.');localStorage.setItem('ytpios.invidious.v1',next.base);closePlayer();backend=next;discovered=null;feedQuery='';query='';$('#search').value='';$('#server-dialog').close();setTab('home');}catch(e){$('#server-status').textContent=e.message;}};
$('#disconnect-server').onclick=()=>{try{localStorage.setItem('ytpios.invidious.v1','');}catch{}closePlayer();backend=null;discovered=null;feedVersion++;$('#server-dialog').close();setTab('home');};
for(const chip of document.querySelectorAll('[data-category]'))chip.onclick=()=>{if(!backend){serverSettings();return;}category=chip.dataset.category;feedQuery='';query='';$('#search').value='';document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b===chip));setTab('home');};
$('#feed-retry').onclick=()=>loadFeed();$('#feed-more').onclick=()=>loadFeed(true);
if(backend)loadFeed();
