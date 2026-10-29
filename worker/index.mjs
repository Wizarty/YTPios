// No Google credentials are accepted or forwarded. This is not a YouTube extractor.
const registry = 'https://api.invidious.io/';
let cached = [], expires = 0;
async function instances() {
  if (expires > Date.now()) return cached;
  const r = await fetch(registry, {redirect:'error', signal:AbortSignal.timeout(4000)});
  if (!r.ok) throw Error('registry');
  const rows = await r.json();
  cached = rows.filter(([host, info]) => info.api === true && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(host) && !/^[\d.]+$/.test(host) && info.uri === `https://${host}`).map(([host]) => host);
  expires = Date.now() + 300000;
  return cached;
}
async function json(host, path, params) {
  const r = await fetch(`https://${host}/api/v1/${path}?${params}`, {redirect:'error', signal:AbortSignal.timeout(4000)});
  if (!r.ok) throw Error('upstream');
  const data = await r.json();
  if (data?.error) throw Error('upstream');
  return data;
}
export function streamURL(value, host) {
  const u = new URL(value, `https://${host}`);
  if (u.protocol !== 'https:' || u.username || u.password || !(u.hostname === host || u.hostname.endsWith('.googlevideo.com'))) throw Error('stream host');
  return u;
}
export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || 'https://wizarty.github.io';
    const headers = {'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers':'Range', 'Access-Control-Expose-Headers':'Content-Range, Accept-Ranges, Content-Length', 'Vary':'Origin', 'Cache-Control':'no-store'};
    const error = (message, status) => Response.json({error:message}, {status, headers});
    if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return error('Origin not allowed',403);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (!['GET','HEAD'].includes(request.method)) return error('Method not allowed',405);
    if (request.headers.has('Authorization') || request.headers.has('Cookie')) return error('Credentials not accepted',400);
    const url = new URL(request.url);
    const media = url.pathname.match(/^\/media\/([\w-]{11})\/(\d+)$/);
    const api = url.pathname.match(/^\/api\/v1\/(trending|search|videos\/[\w-]{11})$/);
    if (!api && !media) return error('Not found',404);
    try {
      const hosts = await instances();
      if (media) {
        const host = url.searchParams.get('instance');
        if (!hosts.includes(host)) return error('Unknown instance',400);
        const data = await json(host, `videos/${media[1]}`, 'local=true');
        const format = data.formatStreams?.find(s => String(s.itag) === media[2]);
        if (!format?.url) return error('Stream unavailable',502);
        let target = streamURL(format.url,host), response;
        const outgoing = {};
        const range = request.headers.get('Range');
        if (range) {
          if (!/^bytes=\d*-\d*$/.test(range)) return error('Invalid range',416);
          outgoing.Range = range;
        }
        for (let n=0;n<4;n++) {
          response = await fetch(target.href,{method:request.method,headers:outgoing,redirect:'manual',signal:AbortSignal.timeout(10000)});
          if (![301,302,303,307,308].includes(response.status)) break;
          const location = response.headers.get('Location');
          await response.body?.cancel();
          if (!location) throw Error('redirect');
          target = streamURL(new URL(location,target).href,host);
        }
        if (![200,206,416].includes(response.status)) { await response.body?.cancel(); return error('Stream unavailable',502); }
        for (const key of ['Content-Type','Content-Length','Content-Range','Accept-Ranges']) if(response.headers.has(key)) headers[key]=response.headers.get(key);
        return new Response(response.body,{status:response.status,headers});
      }
      const params = new URLSearchParams();
      for (const key of ['q','page','type','region','sort_by']) if(url.searchParams.has(key)) params.set(key,url.searchParams.get(key).slice(0,500));
      params.set('local','true');
      // Bounded attempts keep request latency below the client's timeout.
      for (const host of hosts.slice(0,3)) {
        try {
          const data = await json(host,api[1],params);
          if (api[1].startsWith('videos/')) {
            data.formatStreams = (data.formatStreams || []).filter(s=>/^\d+$/.test(String(s.itag))).map(s=>({...s,url:`${url.origin}/media/${api[1].slice(7)}/${s.itag}?instance=${encodeURIComponent(host)}`}));
            // HLS manifests need recursive URL rewriting; do not expose a broken fallback.
            delete data.hlsUrl;
            data.adaptiveFormats = [];
            if (!data.formatStreams.length) throw Error('No combined streams');
          } else if (!Array.isArray(data)) throw Error('Invalid response');
          return Response.json(data,{headers});
        } catch { /* Try another registry-listed instance. */ }
      }
      return error('No public Invidious instance is available. Retry later.',503);
    } catch { return error('Video service unavailable. Retry later.',503); }
  }
};
