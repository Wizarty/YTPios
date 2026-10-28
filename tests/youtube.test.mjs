import test from 'node:test';
import assert from 'node:assert/strict';
import { YouTube, READ_SCOPE, WRITE_SCOPE, oauthError } from '../public/youtube.js';
test('OAuth failures distinguish blocked popups, test-user access and wrong origins', () => {
  assert.match(oauthError('popup_failed_to_open'), /заблокировал окно/);
  assert.match(oauthError('access_denied'), /Test users/);
  assert.match(oauthError('origin_mismatch'), /https:\/\/wizarty.github.io/);
  assert.match(oauthError('disallowed_useragent'), /непосредственно в Safari/);
  assert.equal(oauthError('<untrusted provider message>').includes('<untrusted'),false);
});
const storage = () => { const data = new Map(); return {data, getItem:key => data.get(key), setItem:(key,value) => data.set(key,value)}; };
const json = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json'}});
test('published Client ID works on first visit and with old empty settings', () => {
  const saved = storage();
  const defaultClientId = 'published-client.apps.googleusercontent.com';
  assert.equal(new YouTube({storage:saved, defaultClientId}).config.clientId, defaultClientId);
  saved.setItem('ytpios.google.v1', JSON.stringify({apiKey:'',clientId:''}));
  const api = new YouTube({storage:saved, defaultClientId});
  assert.equal(api.config.clientId,defaultClientId);
  api.configure('', 'custom-client.apps.googleusercontent.com');
  assert.equal(new YouTube({storage:saved, defaultClientId}).config.clientId,'custom-client.apps.googleusercontent.com');
  api.configure('', ''); assert.equal(api.config.clientId,defaultClientId);
});
test('public search encodes queries and pagination, and persists only public configuration', async () => {
  const saved = storage(); let request;
  const api = new YouTube({storage:saved, fetcher:async (url, options) => { request = {url:new URL(url), options}; return json({items:[],nextPageToken:'next'}); }});
  api.configure('public_test_api_key_123456789', 'test-client.apps.googleusercontent.com');
  const result = await api.search('cats & dogs', 'page/2');
  assert.equal(request.url.searchParams.get('q'),'cats & dogs'); assert.equal(request.url.searchParams.get('pageToken'),'page/2');
  assert.equal(request.url.searchParams.get('videoEmbeddable'),'true'); assert.equal(result.nextPageToken,'next');
  api.acceptToken({access_token:'memory-only-test-token',expires_in:3600,scope:READ_SCOPE},READ_SCOPE);
  assert.equal([...saved.data.values()].some(value => value.includes('memory-only-test-token')),false);
  await api.subscriptions(); assert.equal(request.options.headers.Authorization,'Bearer memory-only-test-token'); assert.equal(request.url.searchParams.has('key'),false);
  api.clearSession();
});
test('writes require explicit write scope; private reads require login', async () => {
  let calls=0;
  const api = new YouTube({storage:storage(),fetcher:async () => {calls++;return new Response(null,{status:204});}});
  await assert.rejects(api.subscriptions(), /Войдите/);
  api.acceptToken({access_token:'read-test',expires_in:3600,scope:READ_SCOPE},READ_SCOPE);
  await assert.rejects(api.rate('YE7VzlLtp-4','like'), /разрешение/); assert.equal(calls,0);
  api.acceptToken({access_token:'write-test',expires_in:3600,scope:WRITE_SCOPE},WRITE_SCOPE);
  await api.rate('YE7VzlLtp-4','like'); assert.equal(calls,1); api.clearSession();
});
test('expired/rejected grants and 401 responses cannot retain an authenticated session', async () => {
  const api = new YouTube({storage:storage(),fetcher:async () => json({},401)});
  assert.throws(() => api.acceptToken({access_token:'x',expires_in:1,scope:READ_SCOPE},WRITE_SCOPE),/разрешения/);
  assert.throws(() => api.acceptToken({access_token:'x',expires_in:-1,scope:READ_SCOPE},READ_SCOPE),/срок/);
  api.acceptToken({access_token:'x',expires_in:10,scope:READ_SCOPE},READ_SCOPE);
  await assert.rejects(api.subscriptions(), /истекла/); assert.equal(api.signedIn,false); assert.equal(api.session,null);
});
test('quota errors are actionable and do not expose remote error text', async () => {
  const api = new YouTube({storage:storage(),fetcher:async () => json({error:{message:'sensitive echoed text',errors:[{reason:'quotaExceeded'}]}},403)});
  api.config.apiKey = 'public-test-key'; await assert.rejects(api.search('q'), e => /Квота/.test(e.message) && !e.message.includes('sensitive'));
});
test('playlist creation is private and comments are sent as plain text JSON', async () => {
  const requests=[];
  const api = new YouTube({storage:storage(),fetcher:async (url,options) => {requests.push({url,options});return json({id:'created'});}});
  api.acceptToken({access_token:'test-write',expires_in:60,scope:WRITE_SCOPE},WRITE_SCOPE);
  await api.createPlaylist('My playlist'); assert.equal(JSON.parse(requests[0].options.body).status.privacyStatus,'private');
  await api.comment('YE7VzlLtp-4','<b>plain text</b>'); assert.equal(JSON.parse(requests[1].options.body).snippet.topLevelComment.snippet.textOriginal,'<b>plain text</b>');
  api.clearSession();
});
