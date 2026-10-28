import { YouTube, loadIdentity, READ_SCOPE, WRITE_SCOPE } from './youtube.js';
const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
const button = (text, fn) => { const b = el('button', text, 'chip'); b.type = 'button'; b.onclick = fn; return b; };

export function initIntegration({importVideo, currentVideo}) {
  const api = new YouTube(); let nextPage = null, loader = null, generation = 0, view = 0, authAttempt = 0, loginPending = false;
  const status = message => $('#cloud-status').textContent = message;
  function authState() {
    $('#google-state').textContent = api.signedIn ? 'Google подключён. Сессия действует в этой вкладке.' : 'Вход Google не выполнен.';
    $('#google-disconnect').hidden = !api.signedIn;
  }
  api.addEventListener('change', () => { authState(); view++; generation++; $('#cloud-results').replaceChildren(); $('#cloud-actions').replaceChildren(); nextPage = null; $('#cloud-more').hidden = true; status('Сессия изменилась. Выберите раздел повторно.'); });
  async function prepareLogin() {
    $('#google-login').disabled = true; $('#google-write').disabled = true;
    if (!api.config.clientId) return;
    try { await loadIdentity(); $('#google-login').disabled = false; $('#google-write').disabled = false; }
    catch (e) { $('#settings-status').textContent = e.message; }
  }
  function settings() {
    $('#api-key').value = api.config.apiKey || ''; $('#client-id').value = api.config.clientId || '';
    $('#settings-status').textContent = ''; authState(); $('#settings-dialog').showModal(); prepareLogin();
  }
  $('#google-settings').onclick = settings;
  $('#about-button').onclick = settings;
  $('#settings-form').onsubmit = event => {
    event.preventDefault();
    authAttempt++; loginPending = false;
    try { api.configure($('#api-key').value, $('#client-id').value); $('#settings-status').textContent = 'Настройки сохранены в этом браузере. Для личных данных нажмите «Войти через Google».'; prepareLogin(); }
    catch (e) { $('#settings-status').textContent = e.message; }
  };
  function login(write) {
    if (loginPending) return;
    if (!api.config.clientId || !globalThis.google?.accounts?.oauth2) { $('#settings-status').textContent = 'Сначала сохраните Client ID и дождитесь загрузки Google.'; return; }
    loginPending = true;
    const attempt = ++authAttempt;
    const scope = write ? WRITE_SCOPE : READ_SCOPE;
    const done = message => { if (attempt !== authAttempt) return; loginPending = false; $('#settings-status').textContent = message; };
    try {
      const client = google.accounts.oauth2.initTokenClient({client_id:api.config.clientId, scope, include_granted_scopes:true,
        callback: response => { if (attempt !== authAttempt) return; try { api.acceptToken(response, scope); done(write ? 'Разрешение на изменения получено. Изменения выполняются только по нажатию соответствующих кнопок.' : 'Вход выполнен. Доступны подписки и плейлисты.'); } catch (e) { done(e.message); } },
        error_callback: () => done('Вход не завершён. Разрешите всплывающее окно Google и попробуйте снова.')
      }); client.requestAccessToken({prompt:'consent'});
    } catch { done('Не удалось открыть вход Google. Проверьте Client ID и origin сайта.'); }
  }
  $('#google-login').onclick = () => login(false); $('#google-write').onclick = () => login(true);
  $('#google-disconnect').onclick = () => {
    authAttempt++; loginPending = false;
    const token = api.session?.token; api.clearSession();
    if (token && globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, result => {
      $('#settings-status').textContent = result.successful ? 'Доступ отозван, локальная сессия закрыта.' : 'Локальная сессия закрыта. Отозвать доступ можно в настройках аккаунта Google.';
    });
    else $('#settings-status').textContent = 'Локальная сессия закрыта.';
  };
  $('#cloud-settings').onclick = settings;
  function open(title) {
    view++; generation++; nextPage = null; loader = null; $('#cloud-title').textContent = title;
    $('#cloud-results').replaceChildren(); $('#cloud-actions').replaceChildren(); $('#cloud-more').hidden = true; status('');
    if (!$('#cloud-dialog').open) $('#cloud-dialog').showModal();
  }
  $('#cloud-dialog').addEventListener('close', () => { view++; generation++; });
  async function page(load, append = false) {
    loader = load; const ticket = ++generation; const token = append ? nextPage : undefined;
    $('#cloud-more').disabled = true; status('Загрузка…');
    if (!append) { $('#cloud-results').replaceChildren(); nextPage = null; }
    try {
      const {data, render} = await load(token); if (ticket !== generation) return;
      for (const item of data.items || []) render(item);
      nextPage = data.nextPageToken || null; $('#cloud-more').hidden = !nextPage;
      status($('#cloud-results').childElementCount ? '' : 'Пока ничего нет.');
    } catch (e) { if (ticket === generation) status(e.message); }
    finally { if (ticket === generation) $('#cloud-more').disabled = false; }
  }
  $('#cloud-more').onclick = () => loader && page(loader, true);
  function video(item) {
    const id = typeof item.id === 'object' ? item.id.videoId : item.snippet?.resourceId?.videoId || item.id;
    if (!/^[\w-]{11}$/.test(id || '')) return;
    const card = el('article', null, 'cloud-card'); const title = item.snippet?.title || `Видео ${id}`;
    const img = el('img'); img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; img.alt = ''; img.loading = 'lazy';
    card.append(img, el('h3', title), el('p', item.snippet?.channelTitle || item.snippet?.videoOwnerChannelTitle || 'YouTube'));
    const controls = el('div', null, 'cloud-controls');
    controls.append(button('Смотреть', () => { if (importVideo({id, title}, true)) $('#cloud-dialog').close(); }), button('＋ В видеотеку', () => importVideo({id, title}, false)));
    card.append(controls); $('#cloud-results').append(card);
  }
  function search() { const q = $('#cloud-query').value.trim(); if (!q) { status('Введите поисковый запрос.'); return; } open(`Поиск: ${q}`); page(async token => ({data:await api.search(q, token), render:video})); }
  $('#cloud-search-form').onsubmit = event => { event.preventDefault(); search(); };
  $('#youtube-search').onclick = event => { event.preventDefault(); $('#cloud-query').value = $('#search').value; search(); };
  $('#open-cloud-search').onclick = () => { open('Поиск на YouTube'); $('#cloud-query').focus(); };
  async function mutation(task, success, after) {
    if ($('#cloud-actions').getAttribute('aria-busy') === 'true') return;
    const ticket = generation; $('#cloud-actions').setAttribute('aria-busy', 'true'); status('Отправка…');
    try { await task(); if (ticket === generation) { status(success); after?.(); } }
    catch (e) { if (ticket === generation) status(e.message); }
    finally { $('#cloud-actions').removeAttribute('aria-busy'); }
  }
  function listPlaylist(id, title) { open(title); page(async token => ({data:await api.playlist(id, token), render:video})); }
  function subscriptions() {
    open('Мои подписки'); page(async token => ({data:await api.subscriptions(token), render:item => {
      const card = el('article', null, 'cloud-card'); const title = item.snippet?.title || 'Канал'; const channelId = item.snippet?.resourceId?.channelId;
      card.append(el('h3', title), button('Видео канала', async () => {
        open(title); const ticket = generation; status('Загрузка…');
        try { const channel = (await api.channel(channelId)).items?.[0]; if (ticket !== generation) return; const uploads = channel?.contentDetails?.relatedPlaylists?.uploads; if (!uploads) throw new Error('Видео канала недоступны.'); listPlaylist(uploads, title); } catch (e) { if (ticket === generation) status(e.message); }
      }), button('Отписаться', () => { if (confirm(`Отписаться от канала «${title}»?`)) mutation(() => api.unsubscribe(item.id), 'Подписка удалена.', () => card.remove()); }));
      $('#cloud-results').append(card);
    }}));
  }
  $('#open-subscriptions').onclick = subscriptions; $('#cloud-subscriptions').onclick = subscriptions;
  function playlists() {
    open('Мои плейлисты');
    const form = el('form'); const name = el('input'); name.placeholder = 'Название нового приватного плейлиста'; name.required = true; name.maxLength = 150; name.setAttribute('aria-label', 'Название плейлиста');
    const submit = el('button', 'Создать', 'chip'); submit.type = 'submit'; form.append(name, submit);
    form.onsubmit = event => { event.preventDefault(); if (name.value.trim()) mutation(() => api.createPlaylist(name.value.trim()), 'Плейлист создан.', playlists); };
    $('#cloud-actions').append(form);
    page(async token => ({data:await api.playlists(token), render:item => {
      const card = el('article', null, 'cloud-card'); card.append(el('h3', item.snippet?.title || 'Плейлист'), el('p', `${item.contentDetails?.itemCount || 0} видео`), button('Открыть', () => listPlaylist(item.id, item.snippet?.title || 'Плейлист')));
      const active = currentVideo(); if (active) card.append(button('Добавить текущее видео', () => mutation(() => api.addToPlaylist(item.id, active.id), 'Видео добавлено в плейлист.')));
      $('#cloud-results').append(card);
    }}));
  }
  $('#cloud-playlists').onclick = playlists;
  $('#video-cloud').onclick = async () => {
    const active = currentVideo(); if (!active) return; open('Комментарии и действия');
    const viewTicket = view; const actions = $('#cloud-actions');
    actions.append(button('Нравится', () => mutation(() => api.rate(active.id, 'like'), 'Оценка отправлена.')), button('Не нравится', () => mutation(() => api.rate(active.id, 'dislike'), 'Оценка отправлена.')), button('Убрать оценку', () => mutation(() => api.rate(active.id, 'none'), 'Оценка удалена.')), button('В плейлист', playlists));
    const form = el('form'); const input = el('textarea'); input.required = true; input.maxLength = 10000; input.placeholder = 'Ваш публичный комментарий'; input.setAttribute('aria-label', 'Комментарий'); const submit = el('button', 'Опубликовать комментарий', 'chip'); submit.type = 'submit'; form.append(input, submit);
    form.onsubmit = event => { event.preventDefault(); if (input.value.trim()) mutation(() => api.comment(active.id, input.value.trim()), 'Комментарий опубликован.', () => { input.value = ''; }); }; actions.append(form);
    // Independent metadata failures must not hide readable comments.
    api.details(active.id).then(data => {
      if (viewTicket !== view) return;
      if (currentVideo()?.id !== active.id || !$('#cloud-dialog').open) return;
      const details = data.items?.[0]; if (!details) return;
      actions.prepend(el('p', `${details.snippet?.title || active.title} · ${details.snippet?.channelTitle || 'YouTube'}`));
      if (details.snippet?.channelId) actions.append(button('Подписаться на канал', () => mutation(() => api.subscribe(details.snippet.channelId), 'Подписка оформлена.')));
    }).catch(() => {});
    page(async token => ({data:await api.comments(active.id, token), render:item => {
      const comment = item.snippet?.topLevelComment?.snippet; if (!comment) return;
      const card = el('article', null, 'cloud-comment'); card.append(el('strong', comment.authorDisplayName), el('p', comment.textDisplay)); $('#cloud-results').append(card);
    }}));
  };
  return api;
}
