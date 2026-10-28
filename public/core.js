const idPattern = /^[a-zA-Z0-9_-]{11}$/;
export function videoId(input) {
  const text = input.trim();
  if (idPattern.test(text)) return text;
  let url;
  try { url = new URL(text); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  let id;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
    const parts = url.pathname.split('/');
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (['shorts', 'live', 'embed'].includes(parts[1])) id = parts[2];
  }
  return idPattern.test(id || '') ? id : null;
}
export function restore(raw) {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    return data.filter(v => v && idPattern.test(v.id) && !seen.has(v.id) && seen.add(v.id)).map(v => ({
      id: v.id, title: typeof v.title === 'string' ? v.title.slice(0, 160) : `Видео ${v.id}`,
      saved: v.saved === true, viewed: Number.isFinite(v.viewed) ? v.viewed : 0
    })).slice(0, 500);
  } catch { return []; }
}
export function filtered(videos, tab, query) {
  let result = videos.filter(v => tab !== 'saved' || v.saved).filter(v => tab !== 'history' || v.viewed > 0);
  if (tab === 'history') result = result.toSorted((a, b) => b.viewed - a.viewed);
  return result.filter(v => v.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
}
