import { videoId, restore, filtered } from './core.js';
import { initIntegration } from './integration.js';
const $ = s => document.querySelector(s);
const storageKey = 'ytpios.library.v1';
let videos = [], storageAvailable = true;
try { videos = restore(localStorage.getItem(storageKey)); } catch { storageAvailable = false; }
let tab = 'home', query = '', current = null, queue = [], player = null, apiPromise, toastTimer;
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4000); }
function persist() { try { localStorage.setItem(storageKey, JSON.stringify(videos)); } catch { storageAvailable = false; toast('Браузер не разрешил сохранение. Подборка доступна до закрытия страницы.'); } }
function action(label, title, fn) { const b = node('button', '', label); b.type = 'button'; b.setAttribute('aria-label', title); b.title = title; b.onclick = fn; return b; }
function setTab(value) { tab = value; document.querySelectorAll('.navigation [data-tab]').forEach(b => b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')); document.querySelectorAll('.filters [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab)); render(); }
function saveVideo(id) { const v = videos.find(v => v.id === id); if (!v) return; v.saved = !v.saved; persist(); render(); updateCurrent(); }
function enqueue(id) { if (!queue.includes(id)) { queue.push(id); renderQueue(); toast('Добавлено в очередь'); } else toast('Видео уже в очереди'); }
function render() {
  $('#heading').textContent = {home:'Главная', saved:'Избранное', history:'История открытия'}[tab];
  const visible = filtered(videos, tab, query);
  $('#video-count').textContent = videos.length ? `${visible.length} видео` : '';
  $('#empty').hidden = videos.length > 0 || query !== '' || tab !== 'home';
  $('#no-results').hidden = visible.length > 0 || !$('#empty').hidden;
  const grid = $('#grid'); grid.replaceChildren();
  for (const v of visible) {
    const card = node('article', 'card');
    const thumbnail = action('', `Смотреть: ${v.title}`, () => openVideo(v.id)); thumbnail.className = 'thumbnail';
    const img = node('img'); img.src = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`; img.alt = ''; img.loading = 'lazy';
    thumbnail.append(img, node('span', 'play-badge', '▶'));
    const body = node('div', 'card-body'), info = node('div', 'card-info');
    const title = action(v.title, `Смотреть: ${v.title}`, () => openVideo(v.id)); title.className = 'card-title';
    info.append(title, node('p', 'card-meta', 'YouTube · В вашей видеотеке'));
    const actions = node('div', 'card-actions');
    const save = action(v.saved ? '♥ Сохранено' : '♡ Сохранить', v.saved ? 'Убрать из избранного' : 'Сохранить в избранное', () => saveVideo(v.id)); save.setAttribute('aria-pressed', String(v.saved));
    const remove = action('✕', `Удалить: ${v.title}`, () => { videos = videos.filter(x => x.id !== v.id); queue = queue.filter(x => x !== v.id); if (current === v.id) closePlayer(); persist(); render(); renderQueue(); }); remove.className = 'remove';
    actions.append(save, action('＋', `В очередь: ${v.title}`, () => enqueue(v.id)), remove); info.append(actions); body.append(node('span', 'channel-mark', '▶'), info); card.append(thumbnail, body); grid.append(card);
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
  current = id; v.viewed = Date.now(); persist(); render(); updateCurrent(); renderQueue();
  $('#watch').hidden = false; $('#watch').classList.remove('mini'); $('#mini-open').hidden = true;
  $('#player-status').textContent = 'Загрузка плеера YouTube…'; $('#close-player').focus();
  try {
    await loadAPI(); if (current !== id) return;
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
  current = null; player?.destroy?.(); player = null;
  const frame = $('.player-frame'); frame.replaceChildren(); const target = node('div'); target.id = 'player'; frame.append(target);
  $('#watch').hidden = true; $('#mini-open').hidden = true; $('#add-top').focus();
}
function showAdd() { $('#add-error').textContent = ''; $('#add-dialog').showModal(); $('#video-url').focus(); }
$('#add-top').onclick = showAdd; $('#add-empty').onclick = showAdd;
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { if (current) { $('#watch').classList.add('mini'); $('#mini-open').hidden = false; } setTab(b.dataset.tab); });
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
$('#search-form').onsubmit = event => { event.preventDefault(); $('#search').blur(); render(); };
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
