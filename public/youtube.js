import { GOOGLE_CLIENT_ID } from './config.js';
export const READ_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
export const WRITE_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
export function oauthError(code) {
  const messages = {
    popup_failed_to_open:'Safari или другой браузер заблокировал окно Google. Разрешите всплывающее окно для входа и нажмите кнопку снова. Открывайте сайт непосредственно в Safari, не внутри другого приложения.',
    popup_closed:'Окно Google закрыто до завершения входа. Нажмите «Войти через Google» снова.',
    access_denied:'Google отказал в доступе. Если приложение в режиме Testing, добавьте выбранный на телефоне аккаунт в Google Cloud → Audience → Test users.',
    disallowed_useragent:'Google не разрешает вход из встроенного браузера. Откройте сайт непосредственно в Safari.',
    origin_mismatch:'Адрес сайта не разрешён в OAuth-клиенте. Для GitHub Pages добавьте https://wizarty.github.io в Authorized JavaScript origins.',
    invalid_client:'Google не распознал OAuth-клиент. Проверьте Client ID типа Web application.',
    unauthorized_client:'Google не разрешил вход этому OAuth-клиенту. Проверьте его тип и настройки в Google Cloud.',
    admin_policy_enforced:'Вход запрещён политикой администратора Google Workspace. Используйте разрешённый аккаунт или обратитесь к администратору.'
  };
  return messages[code] || 'Google не завершил вход. Проверьте сообщение в окне Google и настройки доступа приложения.';
}
const settingsKey = 'ytpios.google.v1';
const deployedClientId = typeof __GOOGLE_CLIENT_ID__ === 'string' && __GOOGLE_CLIENT_ID__ ? __GOOGLE_CLIENT_ID__ : GOOGLE_CLIENT_ID;
const endpoints = new Set(['search', 'videos', 'channels', 'subscriptions', 'playlists', 'playlistItems', 'commentThreads', 'comments', 'videos/rate']);
export class YouTube extends EventTarget {
  constructor({fetcher = (...args) => fetch(...args), storage, defaultClientId = deployedClientId} = {}) {
    super();
    if (!storage) { try { storage = globalThis.localStorage; } catch {} }
    storage ||= {getItem:() => null, setItem:() => { throw new Error('Браузер запретил сохранение настроек. Разрешите хранение данных для сайта.'); }};
    this.defaultClientId = defaultClientId;
    this.fetcher = fetcher; this.storage = storage; this.config = {apiKey:'', clientId:defaultClientId}; this.session = null;
    try { const data = JSON.parse(storage.getItem(settingsKey)); if (data && typeof data === 'object') this.config = {apiKey:typeof data.apiKey === 'string' ? data.apiKey : '', clientId:typeof data.clientId === 'string' && data.clientId ? data.clientId : defaultClientId}; } catch {}
  }
  configure(apiKey, clientId) {
    apiKey = apiKey.trim(); clientId = clientId.trim() || this.defaultClientId;
    if (apiKey && !/^[A-Za-z0-9_-]{20,100}$/.test(apiKey)) throw new Error('Проверьте API key. Не вставляйте Client Secret или токен.');
    if (clientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Нужен Client ID типа Web application, оканчивающийся на .apps.googleusercontent.com.');
    this.storage.setItem(settingsKey, JSON.stringify({apiKey, clientId}));
    this.clearSession(); this.config = {apiKey, clientId}; this.dispatchEvent(new Event('change'));
  }
  get signedIn() { return !!this.session && this.session.expires > Date.now(); }
  clearSession() { clearTimeout(this.expiryTimer); this.session = null; this.dispatchEvent(new Event('change')); }
  acceptToken(response, requestedScope) {
    if (response.error) throw new Error(oauthError(response.error));
    if (response.error || !response.access_token || !response.scope?.split(' ').includes(requestedScope)) throw new Error('Google не предоставил необходимые разрешения.');
    const seconds = Number(response.expires_in);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Google вернул некорректный срок сессии.');
    clearTimeout(this.expiryTimer);
    this.session = {token:response.access_token, scopes:response.scope.split(' '), expires:Date.now() + Math.min(seconds, 86400) * 1000};
    this.expiryTimer = setTimeout(() => this.clearSession(), Math.min(seconds, 86400) * 1000);
    this.expiryTimer.unref?.(); this.dispatchEvent(new Event('change'));
  }
  requireAuth(write = false) {
    if (!this.signedIn) { this.clearSession(); throw new Error('Войдите через Google в настройках подключения.'); }
    if (write && !this.session.scopes.includes(WRITE_SCOPE)) throw new Error('Для этого действия включите разрешение на изменения в настройках Google.');
  }
  async request(endpoint, params = {}, {method = 'GET', body, auth = false} = {}) {
    if (!endpoints.has(endpoint)) throw new Error('Неизвестный метод YouTube.');
    const write = method !== 'GET'; if (auth || write) this.requireAuth(write);
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, value);
    const headers = {};
    if (this.signedIn) headers.Authorization = `Bearer ${this.session.token}`;
    else if (this.config.apiKey) url.searchParams.set('key', this.config.apiKey);
    else throw new Error('Добавьте YouTube API key или войдите через Google в настройках подключения.');
    if (body) headers['Content-Type'] = 'application/json';
    let response;
    try { response = await this.fetcher(url.toString(), {method, headers, body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(20000), credentials:'omit', redirect:'error'}); }
    catch { throw new Error('Не удалось связаться с YouTube. Проверьте подключение и повторите запрос.'); }
    if (response.status === 401) { this.clearSession(); throw new Error('Сессия Google истекла. Войдите снова.'); }
    if (response.status === 204) return {};
    let data; try { data = await response.json(); } catch { throw new Error('YouTube вернул неподдерживаемый ответ.'); }
    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason;
      const messages = {quotaExceeded:'Квота YouTube API исчерпана. Проверьте квоты проекта в Google Cloud.', dailyLimitExceeded:'Дневная квота YouTube API исчерпана.', commentsDisabled:'Автор отключил комментарии.', accessNotConfigured:'Включите YouTube Data API v3 в проекте Google Cloud.', keyInvalid:'Проверьте API key и его ограничения.', insufficientPermissions:'Недостаточно разрешений Google для этого действия.', forbidden:'YouTube отказал в доступе. Проверьте разрешения, ограничения ключа и настройки проекта.'};
      throw new Error(messages[reason] || `YouTube отклонил запрос (HTTP ${response.status}). Проверьте параметры и настройки доступа.`);
    }
    return data;
  }
  search(q, pageToken) { return this.request('search', {part:'snippet', q, type:'video', videoEmbeddable:'true', maxResults:24, pageToken}); }
  details(id) { return this.request('videos', {part:'snippet,contentDetails,statistics', id}); }
  subscriptions(pageToken) { return this.request('subscriptions', {part:'snippet', mine:'true', maxResults:24, order:'alphabetical', pageToken}, {auth:true}); }
  playlists(pageToken) { return this.request('playlists', {part:'snippet,contentDetails', mine:'true', maxResults:24, pageToken}, {auth:true}); }
  playlist(playlistId, pageToken) { return this.request('playlistItems', {part:'snippet', playlistId, maxResults:24, pageToken}); }
  channel(id) { return this.request('channels', {part:'snippet,contentDetails', id}); }
  myChannel() { return this.request('channels', {part:'snippet', mine:'true'}, {auth:true}); }
  comments(videoId, pageToken) { return this.request('commentThreads', {part:'snippet', videoId, textFormat:'plainText', maxResults:20, pageToken}); }
  rate(id, rating) { return this.request('videos/rate', {id, rating}, {method:'POST'}); }
  subscribe(channelId) { return this.request('subscriptions', {part:'snippet'}, {method:'POST', body:{snippet:{resourceId:{kind:'youtube#channel', channelId}}}}); }
  unsubscribe(id) { return this.request('subscriptions', {id}, {method:'DELETE'}); }
  createPlaylist(title) { return this.request('playlists', {part:'snippet,status'}, {method:'POST', body:{snippet:{title}, status:{privacyStatus:'private'}}}); }
  addToPlaylist(playlistId, videoId) { return this.request('playlistItems', {part:'snippet'}, {method:'POST', body:{snippet:{playlistId, resourceId:{kind:'youtube#video', videoId}}}}); }
  comment(videoId, textOriginal) { return this.request('commentThreads', {part:'snippet'}, {method:'POST', body:{snippet:{videoId, topLevelComment:{snippet:{textOriginal}}}}}); }
}

let gisPromise;
export function loadIdentity() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    const timer = setTimeout(fail, 15000);
    function fail() { clearTimeout(timer); script.remove(); gisPromise = null; reject(new Error('Не удалось загрузить вход Google. Проверьте сеть и блокировщики.')); }
    script.onload = () => { if (!globalThis.google?.accounts?.oauth2) return fail(); clearTimeout(timer); resolve(); };
    script.onerror = fail; document.head.append(script);
  }); return gisPromise;
}
