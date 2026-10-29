const media = document.getElementById('media');
const status = document.getElementById('status');
const events = [];
let fileURL;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function log(event) {
  events.push({time:new Date().toISOString(),event,position:Number(media.currentTime.toFixed(2)),paused:media.paused,visibility:document.visibilityState});
  if(events.length>150) events.shift();
  document.getElementById('events').textContent=events.map(e=>`${e.time} ${e.event} · ${e.position}s · ${e.visibility}`).join('\n');
}
document.getElementById('mode').textContent=standalone()?'Запущено с главного экрана (standalone)':'Запущено в браузере. Для проверки установите эту страницу на главный экран.';
async function play(){try{await media.play();status.textContent='Воспроизведение запущено. Теперь проверьте PiP и блокировку экрана.';}catch(e){status.textContent=`Не удалось запустить видео: ${e.name}. Нажмите ▶ непосредственно в плеере.`;log('play-failed');}}
document.getElementById('play').onclick=()=>media.paused?play():media.pause();
document.getElementById('pip').onclick=async()=>{
  try{
    if(media.readyState<2){status.textContent='Сначала запустите видео.';return;}
    if(document.pictureInPictureEnabled && media.requestPictureInPicture){if(document.pictureInPictureElement)await document.exitPictureInPicture();else await media.requestPictureInPicture();}
    else if(media.webkitSupportsPresentationMode?.('picture-in-picture'))media.webkitSetPresentationMode(media.webkitPresentationMode==='picture-in-picture'?'inline':'picture-in-picture');
    else{status.textContent='Этот режим iOS не предоставляет плееру PiP. Проверьте кнопку PiP в полноэкранном плеере.';log('pip-unavailable');return;}
    status.textContent='Запрос PiP отправлен. Проверьте, появилось ли системное окно.';log('pip-requested');
  }catch(e){status.textContent=`iOS отклонила PiP (${e.name}). Попробуйте кнопку PiP в полноэкранном режиме.`;log('pip-failed');}
};
document.getElementById('fullscreen').onclick=async()=>{try{if(media.webkitEnterFullscreen)media.webkitEnterFullscreen();else if(media.requestFullscreen)await media.requestFullscreen();else status.textContent='Полноэкранный режим не поддерживается.';}catch(e){status.textContent=`Не удалось открыть полный экран: ${e.name}`;}};
function metadata(title){if('mediaSession' in navigator && 'MediaMetadata' in window)navigator.mediaSession.metadata=new MediaMetadata({title,artist:'YTP Player'});}
function position(){if(!('mediaSession' in navigator)||!navigator.mediaSession.setPositionState||!Number.isFinite(media.duration)||media.duration<=0)return;try{navigator.mediaSession.setPositionState({duration:media.duration,position:Math.min(media.duration,media.currentTime),playbackRate:media.playbackRate});}catch{}}
if('mediaSession' in navigator){
  for(const [name,handler]of Object.entries({play,pause:()=>media.pause(),seekbackward:d=>{media.currentTime=Math.max(0,media.currentTime-(d.seekOffset||10));},seekforward:d=>{if(Number.isFinite(media.duration))media.currentTime=Math.min(media.duration,media.currentTime+(d.seekOffset||10));},seekto:d=>{if(Number.isFinite(d.seekTime))media.currentTime=d.seekTime;}})){try{navigator.mediaSession.setActionHandler(name,handler);}catch{}}
}
metadata('Тестовое видео со звуком');
for(const name of ['playing','pause','ended','waiting','stalled','loadedmetadata','error','enterpictureinpicture','leavepictureinpicture','webkitpresentationmodechanged'])media.addEventListener(name,()=>{log(name);document.getElementById('play').textContent=media.paused?'Воспроизвести':'Пауза';if('mediaSession' in navigator)navigator.mediaSession.playbackState=media.paused?'paused':'playing';if(name==='error')status.textContent='Видео не загрузилось или формат не поддерживается. Выберите MP4/H.264 со звуком AAC.';position();});
media.addEventListener('timeupdate',position);
document.addEventListener('visibilitychange',()=>log('visibilitychange'));
window.addEventListener('pageshow',()=>log('pageshow'));
document.getElementById('file').onchange=event=>{const file=event.target.files[0];if(!file)return;media.pause();if(fileURL)URL.revokeObjectURL(fileURL);fileURL=URL.createObjectURL(file);media.src=fileURL;media.load();metadata('Локальное видео');status.textContent='Файл выбран. Нажмите «Воспроизвести».';log('local-file-selected');};
document.getElementById('report').onclick=()=>{const report={standalone:standalone(),userAgent:navigator.userAgent,notes:document.getElementById('notes').value,events};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='ytp-playback-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
if('serviceWorker' in navigator)navigator.serviceWorker.register('./player-sw.js').catch(()=>{log('offline-shell-unavailable');});
log('ready');
