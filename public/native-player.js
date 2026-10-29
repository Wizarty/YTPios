export class NativePlayer {
  constructor(container,{status,onEnded}) {
    this.video=document.createElement('video');this.video.id='native-video';this.video.controls=true;this.video.playsInline=true;this.video.preload='metadata';
    this.status=status;this.onEnded=onEnded;container.replaceChildren(this.video);
    this.video.addEventListener('ended',onEnded);
    this.video.addEventListener('error',()=>status('Видеопоток не загрузился. Сервер мог вернуть истёкший адрес или недоступный формат.'));
    this.video.addEventListener('playing',()=>status(''));
    this.video.addEventListener('timeupdate',()=>this.updatePosition());
    for(const event of ['play','pause','ended'])this.video.addEventListener(event,()=>{if('mediaSession' in navigator)navigator.mediaSession.playbackState=this.video.paused?'paused':'playing';});
    this.bindMediaSession();
  }
  bindMediaSession(){
    if(!('mediaSession' in navigator))return;
    const v=this.video;
    for(const [name,handler] of Object.entries({play:()=>this.play(),pause:()=>v.pause(),seekbackward:d=>{v.currentTime=Math.max(0,v.currentTime-(d.seekOffset||10));},seekforward:d=>{if(Number.isFinite(v.duration))v.currentTime=Math.min(v.duration,v.currentTime+(d.seekOffset||10));},seekto:d=>{if(Number.isFinite(d.seekTime))v.currentTime=d.seekTime;}}))try{navigator.mediaSession.setActionHandler(name,handler);}catch{}
  }
  updatePosition(){const v=this.video;if(navigator.mediaSession?.setPositionState&&Number.isFinite(v.duration)&&v.duration>0)try{navigator.mediaSession.setPositionState({duration:v.duration,position:Math.min(v.currentTime,v.duration),playbackRate:v.playbackRate});}catch{}}
  async play(){try{await this.video.play();}catch{this.status('Нажмите ▶ в плеере, чтобы начать воспроизведение.');}}
  setSource(url,{title,author='',position=0}={}){
    const v=this.video;v.pause();v.src=url;v.load();
    v.onloadedmetadata=()=>{if(position&&Number.isFinite(v.duration))v.currentTime=Math.min(position,v.duration);this.play();};
    if(navigator.mediaSession&&globalThis.MediaMetadata)navigator.mediaSession.metadata=new MediaMetadata({title:title||'YTP',artist:author});
  }
  async pip(){const v=this.video;try{
    if(v.readyState<2)throw new Error('Сначала запустите видео.');
    if(document.pictureInPictureEnabled&&v.requestPictureInPicture){if(document.pictureInPictureElement)await document.exitPictureInPicture();else await v.requestPictureInPicture();}
    else if(v.webkitSupportsPresentationMode?.('picture-in-picture'))v.webkitSetPresentationMode(v.webkitPresentationMode==='picture-in-picture'?'inline':'picture-in-picture');
    else throw new Error('Системный PiP недоступен в этом режиме браузера.');
  }catch(e){this.status(e.message||'Не удалось включить PiP.');}}
  destroy(){const v=this.video;v.pause();v.onloadedmetadata=null;v.removeAttribute('src');v.load();v.remove();if(navigator.mediaSession){navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';for(const name of ['play','pause','seekbackward','seekforward','seekto'])try{navigator.mediaSession.setActionHandler(name,null);}catch{}}}
}
