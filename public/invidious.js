export function instanceURL(value) {
  if (!value?.trim()) return '';
  let url; try { url = new URL(value.trim()); } catch { throw new Error('Укажите полный HTTPS-адрес сервера Invidious.'); }
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('Нужен HTTPS-адрес сервера без паролей, параметров и фрагментов.');
  url.pathname = url.pathname.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '') + '/';
  return url.href;
}
export function normalizeVideo(item) {
  if (!item || !/^[\w-]{11}$/.test(item.videoId || '')) return null;
  return {id:item.videoId, title:String(item.title || 'Видео').slice(0,300), author:String(item.author || '').slice(0,160), duration:Math.max(0,Number(item.lengthSeconds)||0), views:Math.max(0,Number(item.viewCount)||0), published:String(item.publishedText||'').slice(0,80), saved:false, viewed:0};
}
export function durationLabel(seconds) {
  if (!seconds) return '';
  const n=Math.floor(seconds), hours=Math.floor(n/3600), minutes=Math.floor(n%3600/60), rest=String(n%60).padStart(2,'0');
  return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${rest}` : `${minutes}:${rest}`;
}
export class Invidious {
  constructor(base, fetcher=(...args)=>fetch(...args)) { this.base=instanceURL(base);this.fetcher=fetcher; }
  async request(path, params={}) {
    if (!this.base) throw new Error('Подключите сервер видео в настройках.');
    const url=new URL(`api/v1/${path}`,this.base);
    for(const [key,value] of Object.entries(params)) if(value!==undefined&&value!=='')url.searchParams.set(key,String(value));
    let response;
    try { response=await this.fetcher(url.href,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(20000)}); }
    catch { throw new Error('Сервер видео недоступен. Проверьте его адрес, HTTPS и разрешение CORS для сайта.'); }
    if(!response.ok)throw new Error(response.status===429?'Сервер ограничил число запросов. Повторите позже.':`Сервер видео вернул ошибку ${response.status}.`);
    let data;try{data=await response.json();}catch{throw new Error('По этому адресу не получен JSON API Invidious.');}
    if(data?.error)throw new Error('Сервер не смог получить видео. Оно может быть недоступно или заблокировано источником.');
    return data;
  }
  async feed(type='Default') { const items=await this.request('trending',{type:type.toLowerCase(),region:'US'});if(!Array.isArray(items))throw new Error('Неподдерживаемый ответ ленты.');return items.map(normalizeVideo).filter(Boolean); }
  async search(q,page=1) { const items=await this.request('search',{q,page,type:'video',sort_by:'relevance'});if(!Array.isArray(items))throw new Error('Неподдерживаемый ответ поиска.');return items.map(normalizeVideo).filter(Boolean); }
  async details(id) { if(!/^[\w-]{11}$/.test(id))throw new Error('Некорректный идентификатор видео.');return this.request(`videos/${id}`,{local:true}); }
  mediaURL(value) {
    if(typeof value!=='string'||!value)return null;
    let url;try{url=new URL(value,this.base);}catch{return null;}
    const base=new URL(this.base);
    if(url.username||url.password)return null;
    const sameOrigin=url.origin===base.origin;
    const googleVideo=url.hostname.endsWith('.googlevideo.com');
    return (sameOrigin || (googleVideo&&url.protocol==='https:')) ? url.href : null;
  }
  streams(data) {
    // formatStreams contain both video and audio. Never use video-only adaptiveFormats as a complete stream.
    return (data.formatStreams||[]).filter(s=>s.type?.startsWith('video/mp4')||s.container==='mp4').map(s=>({url:this.mediaURL(s.url),label:s.qualityLabel||s.quality||'MP4',height:parseInt(s.resolution||s.qualityLabel,10)||0})).filter(s=>s.url).sort((a,b)=>b.height-a.height);
  }
}
