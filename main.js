const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog, session, shell, nativeTheme, safeStorage, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LANGS = require('./i18n.js');

app.setName('Juk Browser');
app.setAppUserModelId('ru.juk.browser');

if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',(_e,argv)=>{try{const url=(argv||[]).find(a=>/^(?:https?:\/\/|juk:)/i.test(String(a)));let c=[...contexts.values()].find(x=>!x.window.isDestroyed());if(!c)c=createWindow({});if(c.window.isMinimized())c.window.restore();c.window.show();c.window.focus();if(url)createTab(c,url,true)}catch{}});

const NEWTAB_URL = 'juk://newtab';
const SETTINGS_URL = 'juk://settings';
const HISTORY_URL = 'juk://history';
const DOWNLOADS_URL = 'juk://downloads';
const PASSWORDS_URL = 'juk://passwords';
const BOOKMARKS_URL = 'juk://bookmarks';
const INTERNAL_PAGES = { newtab:{url:NEWTAB_URL,titleKey:'newTabTitle'}, settings:{url:SETTINGS_URL,titleKey:'settings'}, history:{url:HISTORY_URL,titleKey:'history'}, downloads:{url:DOWNLOADS_URL,titleKey:'downloadsSection'}, passwords:{url:PASSWORDS_URL,titleKey:'passwords'}, bookmarks:{url:BOOKMARKS_URL,titleKey:'bookmarks'} };
function internalKind(url){ return Object.keys(INTERNAL_PAGES).find(k=>INTERNAL_PAGES[k].url===url)||null; }
function tr(k){ const L=LANGS[store.settings.lang]||LANGS.ru; return L[k]||LANGS.ru[k]||k; }
const DEFAULTS = { searchEngine:'google', homepage:NEWTAB_URL, theme:'system', defaultZoom:100, showBookmarksBar:true, accent:'', searchSuggestions:true, autoSaveDownloads:true, newtabClock:true, newtabSearch:true, newtabTiles:true, newtabLinks:true, newtabBg:true, newtabWallpaper:'', lang:'ru' };
const SEARCH = { google:'https://www.google.com/search?q=', duckduckgo:'https://duckduckgo.com/?q=', bing:'https://www.bing.com/search?q=' };
let dataFile, store = { settings:{...DEFAULTS}, history:[], bookmarks:[], downloads:[], passwords:[], newtab:{sites:[],hidden:[]}, windows:[], zoomLevels:{}, cleanExit:true };
const contexts = new Map();
let saveTimer;
let isQuitting = false;
let prevCrashed = false;
const certBypass = new Set();
const HISTORY_LIMIT = 5000, DOWNLOADS_LIMIT = 500, CLOSED_TABS_LIMIT = 20, POPUP_RATE_LIMIT = 5, POPUP_RATE_WINDOW_MS = 10000;

const id = () => crypto.randomUUID();
function loadStore(){
  dataFile=path.join(app.getPath('userData'),'browser-data.json');
  try{ const oldFile=path.resolve(path.dirname(dataFile),'..','juk-browser','browser-data.json'); if(!fs.existsSync(dataFile)&&fs.existsSync(oldFile)){fs.mkdirSync(path.dirname(dataFile),{recursive:true});fs.copyFileSync(oldFile,dataFile)} }catch{}
  try { const parsed=JSON.parse(fs.readFileSync(dataFile,'utf8')); if(parsed&&typeof parsed==='object')store={...store,...parsed,settings:{...DEFAULTS,...(parsed.settings&&typeof parsed.settings==='object'&&!Array.isArray(parsed.settings)?parsed.settings:{})}}; } catch(e) { if(e&&e.code!=='ENOENT'){try{fs.renameSync(dataFile,dataFile+'.bak')}catch{try{fs.copyFileSync(dataFile,dataFile+'.bak')}catch{}}} }
  for(const k of ['windows','history','bookmarks','passwords','downloads'])if(!Array.isArray(store[k]))store[k]=[];
  store.downloads=(store.downloads||[]).map(d=>d.state==='progressing'?{...d,state:'interrupted',paused:false}:d);
  if(store.settings.homepage==='https://www.google.com')store.settings.homepage=NEWTAB_URL;
  if(!store.newtab||typeof store.newtab!=='object')store.newtab={sites:[],hidden:[]};
  if(!Array.isArray(store.newtab.sites))store.newtab.sites=[];
  if(!Array.isArray(store.newtab.hidden))store.newtab.hidden=[];
  if(!store.zoomLevels||typeof store.zoomLevels!=='object'||Array.isArray(store.zoomLevels))store.zoomLevels={};
  prevCrashed=store.cleanExit===false;
  applyThemeSource();
}
function applyThemeSource(){ nativeTheme.themeSource=['system','light','dark'].includes(store.settings.theme)?store.settings.theme:'system'; }
function windowBackground(){ const t=store.settings.theme; const dark=t==='dark'||(t==='system'&&nativeTheme.shouldUseDarkColors); return dark?'#202124':'#eef0f3'; }
function writeStoreNow(){
  try { fs.mkdirSync(path.dirname(dataFile),{recursive:true}); const tmp=`${dataFile}.tmp`; fs.writeFileSync(tmp,JSON.stringify(store,null,2)); fs.renameSync(tmp,dataFile); } catch(e){ console.error('Не удалось сохранить данные:',e.message); }
}
function saveStore(){
  clearTimeout(saveTimer); saveTimer=setTimeout(writeStoreNow,120);
}
function windowSnapshot(c){
  return {bounds:c.window.isMaximized()?c.window.getNormalBounds():c.window.getBounds(),maximized:c.window.isMaximized(),activeIndex:Math.max(0,c.tabs.findIndex(t=>t.id===c.activeId)),tabs:c.tabs.map(t=>({url:safePersistUrl(t.url),pinned:t.pinned,title:t.title||'',favicon:t.favicon||''}))};
}
const closedWindowSnapshots=[];
function persistWindows(){
  store.windows=[...contexts.values()].filter(c=>!c.incognito && !c.window.isDestroyed()).map(windowSnapshot).concat(closedWindowSnapshots).slice(0,10);
  saveStore();
}
function safePersistUrl(url){ return (/^(https?:|file:)/.test(url||'')||internalKind(url))?url:NEWTAB_URL; }
function contextForEvent(event){ return [...contexts.values()].find(c=>c.window.webContents.id===event.sender.id); }
function isChrome(e){ return !!contextForEvent(e); }
function active(c){ return c && c.tabs.find(t=>t.id===c.activeId); }
function pageWeb(c){ const t=active(c); return t&&t.view&&!t.internal?t.view.webContents:null; }
function printActive(c){ const t=active(c); if(t&&t.internal){c.window.webContents.print();return} pageWeb(c)?.print(); }
function devtoolsActive(c){ const t=active(c); if(t&&t.internal){c.window.webContents.toggleDevTools();return} pageWeb(c)?.toggleDevTools(); }
function tabGo(c,t,dir){
  if(!t)return; const wc=t.view&&!t.view.webContents.isDestroyed()?t.view.webContents:null; if(!wc)return;
  if(dir<0?!wc.navigationHistory.canGoBack():!wc.navigationHistory.canGoForward())return;
  if(t.internal){delete t.internal;if(t.id===c.activeId)showActive(c)}
  if(dir<0)wc.goBack();else wc.goForward();
}
function makeView(c){
  const view=new WebContentsView({webPreferences:{session:c.session,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,preload:path.join(__dirname,'preload-page.js')}});
  view.webContents.setZoomFactor(Math.max(.5,Math.min(2,c.settings.defaultZoom/100)));
  return view;
}
function ensureView(c,t){ if(!t.view){ t.view=makeView(c); wirePage(c,t); } }
function destroyView(c,t){ if(!t.view)return; try{c.window.contentView.removeChildView(t.view)}catch{} if(!t.view.webContents.isDestroyed())t.view.webContents.close(); t.view=null; }
function parseInput(input,c){
  const value=String(input||'').trim(); if(!value)return c.settings.homepage;
  const m=/^juk:\/\/(settings|history|downloads|passwords|bookmarks|newtab)\/?$/i.exec(value); if(m)return INTERNAL_PAGES[m[1].toLowerCase()].url;
  try { const u=new URL(value); if(['http:','https:','file:','view-source:'].includes(u.protocol))return u.toString(); } catch {}
  if(/^localhost(?::\d+)?(?:\/|$)/i.test(value)||/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|$)/.test(value)) return `http://${value}`;
  if(/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/\S*)?$/i.test(value)) return `https://${value}`;
  return (SEARCH[c.settings.searchEngine]||SEARCH.google)+encodeURIComponent(value);
}
function tabSnapshot(c,t){
  const url=t.url||'';
  if(t.internal){const wc=t.view&&!t.view.webContents.isDestroyed()?t.view.webContents:null;return {id:t.id,title:t.title||tr(INTERNAL_PAGES[t.internal]?.titleKey||'newTabTitle'),url,favicon:'',loading:false,pinned:t.pinned,canGoBack:!!(wc&&wc.navigationHistory.canGoBack()),canGoForward:!!(wc&&wc.navigationHistory.canGoForward()),bookmarked:false,internal:t.internal,crashed:false,unresponsive:false,certError:null}}
  if(t.lazy||!t.view)return {id:t.id,title:t.title||tr('newTabTitle'),url,favicon:t.favicon||'',loading:false,pinned:t.pinned,canGoBack:false,canGoForward:false,bookmarked:store.bookmarks.some(b=>b.url===url),audible:false,muted:!!t.muted,crashed:false,unresponsive:false,certError:null,lazy:true};
  return {id:t.id,title:t.title||tr('newTabTitle'),url,favicon:t.favicon||'',loading:t.loading,pinned:t.pinned,canGoBack:t.view.webContents.navigationHistory.canGoBack(),canGoForward:t.view.webContents.navigationHistory.canGoForward(),bookmarked:store.bookmarks.some(b=>b.url===url),audible:!!t.audible,muted:!!t.muted,crashed:!!t.crashed,unresponsive:!!t.unresponsive,certError:t.certError||null,zoom:Math.round(t.view.webContents.getZoomFactor()*100)};
}
let wallpaperCache={f:null,url:''};
function wallpaperUrl(){
  const f=store.settings.newtabWallpaper; if(!f)return '';
  if(wallpaperCache.f===f)return wallpaperCache.url;
  let url; try{ const p=path.join(app.getPath('userData'),f); const v=fs.statSync(p).mtimeMs; url='file:///'+encodeURI(p.replace(/\\/g,'/')).replace(/#/g,'%23').replace(/\?/g,'%3F')+'?v='+v; }catch{ url=''; }
  wallpaperCache={f,url}; return url;
}
function publicState(c){ return {tabs:c.tabs.map(t=>tabSnapshot(c,t)),activeId:c.activeId,settings:c.settings,incognito:c.incognito,maximized:c.window.isMaximized(),bookmarks:store.bookmarks,downloads:c.incognito?c.downloads:store.downloads,version:app.getVersion(),downloadsPath:app.getPath('downloads'),wallpaperUrl:wallpaperUrl()}; }
function emit(c){ if(c&&!c.window.isDestroyed())c.window.webContents.send('state',publicState(c)); }
function emitAll(){ for(const c of contexts.values())emit(c); }
function toolbarH(c){ return Math.max(70,Math.min(180,c&&c.toolbarHeight||80)); }
function restoreSession(crashed=false){ const prior=store.windows.length?store.windows:[null]; prior.forEach((r,i)=>createWindow({restore:r,crashed:crashed&&i===0})); }
function layout(c){
  if(!c||c.window.isDestroyed())return; const [w,h]=c.window.getContentSize(); const top=toolbarH(c);
  for(const t of c.tabs){ if(!t.view||t.internal||t.crashed||t.unresponsive||t.certError)continue; if(t.htmlFs&&t.id===c.activeId){t.view.setBounds({x:0,y:0,width:w,height:h});continue} t.view.setBounds({x:0,y:top,width:w,height:Math.max(0,h-top)}); }
}
function materializeTab(c,t){
  if(!t||!t.lazy)return;
  t.lazy=false; ensureView(c,t);
  t.view.webContents.loadURL(t.url).catch(()=>{});
}
function showActive(c,loadLazy=true){
  hideSuggestions(); hidePasswordPrompt(); hideDlBubble(); hideMenu();
  const act=active(c); if(loadLazy&&act&&act.lazy&&!act.internal)materializeTab(c,act);
  for(const t of c.tabs)if(t.view){try{c.window.contentView.removeChildView(t.view)}catch{}}
  const t=active(c); if(t&&t.view&&!t.internal&&!t.crashed&&!t.unresponsive&&!t.certError){c.window.contentView.addChildView(t.view);layout(c);t.view.webContents.focus();}
  emit(c); persistWindows();
}
function addHistory(c,t,url,title){
  if(c.incognito||!/^https?:/.test(url))return;
  const last=store.history[0]; if(last&&last.url===url&&Date.now()-last.time<3000){last.title=title||last.title;last.time=Date.now();last.favicon=t.favicon||last.favicon||'';}else store.history.unshift({id:id(),url,title:title||url,time:Date.now(),favicon:t.favicon||''});
  store.history=store.history.slice(0,HISTORY_LIMIT);saveStore();
}
function wirePage(c,t){
  const wc=t.view.webContents;
  wc.setWindowOpenHandler(({url,disposition})=>{
    const u=String(url||''),act=disposition!=='background-tab';
    const now=Date.now(); const times=(wc.__popupTimes=(wc.__popupTimes||[]).filter(x=>now-x<POPUP_RATE_WINDOW_MS));
    if(times.length>=POPUP_RATE_LIMIT)return {action:'deny'};
    times.push(now);
    if(/^juk:/i.test(u))return {action:'deny'};
    if(disposition==='new-window'){createWindow({incognito:c.incognito,url:u});return {action:'deny'}}
    if(!u||/^about:blank(?:[?#]|$)/i.test(u)||/^blob:/i.test(u)){createTab(c,u||'about:blank',act,{raw:true});return {action:'deny'}}
    if(/^(?:https?|file|view-source):/i.test(u)){createTab(c,u,act);return {action:'deny'}}
    openExternalSafe(c,u);
    return {action:'deny'};
  });
  wc.on('will-navigate',(e,url)=>{
    if(/^(?:https?|file|view-source|about|blob):/i.test(url))return;
    e.preventDefault(); if(/^(?:javascript|vbscript|data|juk|chrome|devtools):/i.test(url))return;
    openExternalSafe(c,url);
  });
  wc.on('will-redirect',(e,url)=>{ if(/^(?:juk|data):/i.test(url))e.preventDefault(); });
  wc.on('page-title-updated',(_e,title)=>{if(t.internal)return;t.title=title;emit(c)});
  wc.on('page-favicon-updated',(_e,f)=>{if(t.internal)return;t.favicon=f[0]||'';emit(c)});
  wc.on('media-started-playing',()=>{t.audible=true;emit(c)});
  wc.on('media-paused',()=>{t.audible=false;emit(c)});
  wc.on('did-start-loading',()=>{const re=(t.crashed||t.unresponsive||t.certError)&&t.id===c.activeId;t.loading=true;t.loadFailed=false;t.crashed=false;t.unresponsive=false;t.certError=null;t.certPending=null;if((pwChooser&&pwChooser.wc===wc)||(pwPending&&pwPending.wc===wc))hidePasswordPrompt();if(re)showActive(c);else emit(c)});
  wc.on('did-stop-loading',()=>{t.loading=false;if(!t.internal){if(!t.loadFailed){t.url=wc.getURL();t.title=wc.getTitle()||t.title;addHistory(c,t,t.url,t.title)}passwordHooks(c,wc)}emit(c);persistWindows()});
  const applyStoredZoom=()=>{try{const o=new URL(wc.getURL()).origin;const z=store.zoomLevels[o];wc.setZoomFactor(z?z/100:Math.max(.5,Math.min(2,c.settings.defaultZoom/100)))}catch{}};
  wc.on('did-navigate',(_e,url)=>{if(!t.internal)t.url=url;applyStoredZoom();if(pwChooser&&pwChooser.wc===wc)hidePasswordPrompt();for(const q of [...pwQueue])if(q.wc===wc)showQueuedPw(q);emit(c)});
  wc.on('did-navigate-in-page',(_e,url)=>{if(t.internal)return;t.url=url;if(!t.loadFailed)addHistory(c,t,url,wc.getTitle());emit(c)});
  wc.on('did-fail-load',(_e,code,description,url,isMain)=>{if(!isMain||t.internal)return;if(code===-3)return;if(code<=-200&&code>=-299){let host='';try{host=new URL(url).hostname}catch{}const p=t.certPending&&t.certPending.host===host&&Date.now()-(t.certPending.at||0)<10000?t.certPending:null;t.certPending=null;t.certError={host,error:p?p.error:String(description),url:String(url)};t.loading=false;emit(c);showActive(c);return}t.loadFailed=true;t.loading=false;t.title=`${tr('errorPrefix')}${description}`;t.url=url;emit(c)});
  wc.on('enter-html-full-screen',()=>{t.htmlFs=true;if(t.id===c.activeId&&!t.internal){const [w,h]=c.window.getContentSize();t.view.setBounds({x:0,y:0,width:w,height:h})}});
  wc.on('leave-html-full-screen',()=>{t.htmlFs=false;if(t.id===c.activeId)layout(c)});
  wc.on('before-input-event',(event,input)=>handleShortcut(c,event,input));
  wc.on('focus',()=>{if(dlOwner===c)hideDlBubble();if(menuOwner===c)hideMenu()});
  wc.on('context-menu',(_e,p)=>showPageMenu(c,t,p));
  wc.on('render-process-gone',()=>{t.crashed=true;t.unresponsive=false;t.loading=false;if(!t.internal)t.title=tr('pageCrashed');emit(c);showActive(c)});
  wc.on('unresponsive',()=>{t.unresponsive=true;emit(c);showActive(c)});
  wc.on('responsive',()=>{t.unresponsive=false;emit(c);showActive(c)});
  wc.on('found-in-page',(_e,r)=>{if(t.id===c.activeId&&!c.window.isDestroyed())c.window.webContents.send('find:result',{matches:r.matches||0,active:r.activeMatchOrdinal||0,final:!!r.finalUpdate})});
  wc.on('update-target-url',(_e,u)=>{if(!c.window.isDestroyed())c.window.webContents.send('link:hover',String(u||''))});
}
function createTab(c,input,activate=true,opts={}){
  const target=opts.raw?String(input||'about:blank'):parseInput(input||c.settings.homepage,c);
  const kind=internalKind(target);
  if(kind){
    const page=INTERNAL_PAGES[kind];
    const t={id:id(),view:null,internal:kind,title:tr(page.titleKey),url:page.url,favicon:'',loading:false,pinned:!!opts.pinned};
    c.tabs.push(t); if(activate)c.activeId=t.id;
    if(t.pinned)c.tabs.sort((a,b)=>Number(b.pinned)-Number(a.pinned));
    if(activate)showActive(c);else emit(c); return t;
  }
  if(opts.lazy){
    const t={id:id(),view:null,lazy:true,title:opts.title||'',url:target,favicon:opts.favicon||'',loading:false,pinned:!!opts.pinned};
    c.tabs.push(t); if(t.pinned)c.tabs.sort((a,b)=>Number(b.pinned)-Number(a.pinned)); if(activate)c.activeId=t.id;
    if(activate)showActive(c);else emit(c); return t;
  }
  const t={id:id(),view:makeView(c),title:tr('newTabTitle'),url:'',favicon:'',loading:false,pinned:!!opts.pinned}; wirePage(c,t);
  c.tabs.push(t); if(t.pinned)c.tabs.sort((a,b)=>Number(b.pinned)-Number(a.pinned)); if(activate)c.activeId=t.id;
  t.view.webContents.loadURL(target).catch(()=>{});
  if(activate)showActive(c);else emit(c); return t;
}
function navigateTab(c,t,input){
  const target=parseInput(input,c);
  const kind=internalKind(target);
  if(kind){
    if(t.internal===kind)return;
    if(t.view){t.htmlFs=false;try{c.window.contentView.removeChildView(t.view)}catch{}try{t.view.webContents.setAudioMuted(true)}catch{}t.audible=false;} const page=INTERNAL_PAGES[kind]; t.internal=kind; t.url=page.url; t.title=tr(page.titleKey); t.favicon=''; t.loading=false; t.crashed=false; t.unresponsive=false; t.certError=null; t.certPending=null; t.loadFailed=false;
    if(t.id===c.activeId)showActive(c);else emit(c); return;
  }
  const wasInternal=!!t.internal; if(wasInternal){ delete t.internal; ensureView(c,t); try{t.view.webContents.setAudioMuted(!!t.muted)}catch{} }
  else if(t.lazy){ t.lazy=false; ensureView(c,t); }
  t.view.webContents.loadURL(target).catch(()=>{});
  if(wasInternal&&t.id===c.activeId)showActive(c);
}
function navigateActive(c,input){
  if(!c)return; const t=active(c); if(t)navigateTab(c,t,input);
}
function closeTab(c,tabId,remember=true){
  const index=c.tabs.findIndex(t=>t.id===tabId); if(index<0)return;
  const wasActive=c.activeId===tabId;
  const [t]=c.tabs.splice(index,1); if(remember&&t.url)c.closedTabs.unshift({url:t.url,title:t.title||'',pinned:t.pinned});c.closedTabs=c.closedTabs.slice(0,CLOSED_TABS_LIMIT);
  destroyView(c,t);
  if(!c.tabs.length){ if(c.window.isClosable())c.window.close(); return; }
  if(wasActive){c.activeId=c.tabs[Math.min(index,c.tabs.length-1)].id;showActive(c)}else{emit(c);persistWindows()}
}
function handleShortcut(c,event,input){
  if(input.type!=='keyDown'&&input.type!=='rawKeyDown')return;
  const mod=(input.control||input.meta)&&!input.alt; const code=input.code||'';
  const letter=code.startsWith('Key')?code.slice(3).toLowerCase():'';
  const actions={t:()=>createTab(c),w:()=>closeTab(c,c.activeId),l:()=>c.window.webContents.send('focus-omnibox'),k:()=>c.window.webContents.send('focus-omnibox'),r:()=>pageWeb(c)?.reload(),d:()=>toggleBookmark(c),p:()=>printActive(c),h:()=>createTab(c,HISTORY_URL),j:()=>createTab(c,DOWNLOADS_URL)};
  if(mod&&input.shift&&letter==='t'){event.preventDefault();reopenTab(c);return}
  if(mod&&input.shift&&letter==='i'){event.preventDefault();devtoolsActive(c);return}
  if(mod&&input.shift&&letter==='n'){event.preventDefault();createWindow({incognito:true});return}
  if(mod&&input.shift&&letter==='r'){event.preventDefault();pageWeb(c)?.reloadIgnoringCache();return}
  if(mod&&input.shift&&letter==='a'){event.preventDefault();c.window.webContents.send('tabs:list');c.window.webContents.focus();return}
  if(mod&&!input.shift&&letter==='u'){event.preventDefault();const t=active(c);if(t&&!t.internal&&/^https?:/.test(t.url||''))createTab(c,'view-source:'+t.url);return}
  if(mod&&!input.shift&&letter==='s'){event.preventDefault();const t=active(c);if(t&&t.view&&!t.internal)savePage(c,t);return}
  if(mod&&!input.shift&&letter==='f'){event.preventDefault();c.window.webContents.send('find:show');c.window.webContents.focus();return}
  if(mod&&letter==='n'){event.preventDefault();createWindow({});return}
  if(mod&&code==='Tab'){event.preventDefault();cycleTab(c,input.shift?-1:1);return}
  if(mod&&/^Digit[1-9]$/.test(code)){event.preventDefault();activateTabByIndex(c,Number(code.slice(5))-1);return}
  if(mod&&(code==='Equal'||code==='NumpadAdd')){event.preventDefault();zoom(c,10);return}
  if(mod&&(code==='Minus'||code==='NumpadSubtract')){event.preventDefault();zoom(c,-10);return}
  if(mod&&(code==='Digit0'||code==='Numpad0')){event.preventDefault();setZoom(c,c.settings.defaultZoom);return}
  if(mod&&actions[letter]){event.preventDefault();actions[letter]();return}
  if(code==='F5'){event.preventDefault();pageWeb(c)?.reload();return}
  if(code==='F11'){event.preventDefault();c.window.setFullScreen(!c.window.isFullScreen());return}
  if(code==='F12'){event.preventDefault();devtoolsActive(c);return}
  if(code==='F3'){event.preventDefault();c.window.webContents.send('find:step',{back:!!input.shift});c.window.webContents.focus();return}
  if(code==='Escape'){if(menuOwner===c)hideMenu();if(dlOwner===c)hideDlBubble();if(sugOwner===c)hideSuggestions();const wc=pageWeb(c);if(wc&&wc.isLoading())wc.stop();return}
  if(input.alt&&code==='ArrowLeft'){event.preventDefault();tabGo(c,active(c),-1)}
  if(input.alt&&code==='ArrowRight'){event.preventDefault();tabGo(c,active(c),1)}
  if(input.alt&&code==='Home'){event.preventDefault();navigateActive(c,c.settings.homepage)}
}
function cycleTab(c,delta){if(c.tabs.length<2)return;const i=Math.max(0,c.tabs.findIndex(t=>t.id===c.activeId));c.activeId=c.tabs[(i+delta+c.tabs.length)%c.tabs.length].id;showActive(c)}
function activateTabByIndex(c,i){const t=i===8?c.tabs[c.tabs.length-1]:c.tabs[i];if(t){c.activeId=t.id;showActive(c)}}
function persistZoom(c){
  const wc=pageWeb(c); if(!wc)return;
  let o; try{o=new URL(wc.getURL()).origin}catch{return}
  if(!/^https?:/.test(o))return;
  const p=Math.round(wc.getZoomFactor()*100);
  if(p===c.settings.defaultZoom)delete store.zoomLevels[o];else store.zoomLevels[o]=p;
  saveStore(); emit(c);
}
function setZoom(c,percent){ const wc=pageWeb(c);if(!wc)return 100;const p=Math.max(50,Math.min(200,percent));wc.setZoomFactor(p/100);persistZoom(c);return p; }
function zoom(c,delta){const wc=pageWeb(c);return wc?setZoom(c,Math.round(wc.getZoomFactor()*100)+delta):100}
function reopenTab(c){const x=c.closedTabs.shift();if(x)createTab(c,x.url,true,{pinned:x.pinned})}
function toggleBookmark(c){const t=active(c);if(!t||!/^https?:/.test(t.url))return false;const i=store.bookmarks.findIndex(b=>b.url===t.url);if(i>=0)store.bookmarks.splice(i,1);else store.bookmarks.unshift({id:id(),title:t.title,url:t.url,favicon:t.favicon||'',created:Date.now()});saveStore();emitAll();return i<0}
function togglePiP(c){
  const wc=pageWeb(c); if(!wc)return;
  wc.executeJavaScript(`(async()=>{try{if(document.pictureInPictureElement){await document.exitPictureInPicture();return'off'}const vs=[...document.querySelectorAll('video')];const v=vs.find(x=>!x.paused&&!x.ended)||vs[0];if(!v)return'no-video';v.disablePictureInPicture=false;await v.requestPictureInPicture();return'on'}catch(e){return'error'}})()`).then(r=>{if((r==='no-video'||r==='error'))showToast(c,tr(r==='no-video'?'noVideo':'pipFail'))}).catch(()=>{});
}

function showPageMenu(c,t,p){
  const wc=t.view.webContents;
  const spell=(p.isEditable&&p.misspelledWord)?[...(p.dictionarySuggestions||[]).slice(0,5).map(s=>({label:s,click:()=>wc.replaceMisspelling(s)})),{label:tr('addToDictionary'),click:()=>{try{wc.session.addWordToSpellCheckerDictionary(p.misspelledWord)}catch{}}},{sep:true}]:[];
  const items=[
    ...spell,
    {label:tr('back'),enabled:wc.navigationHistory.canGoBack(),click:()=>wc.goBack()},{label:tr('forward'),enabled:wc.navigationHistory.canGoForward(),click:()=>wc.goForward()},{label:tr('reload'),click:()=>wc.reload()},{sep:true},
    {label:tr('cut'),enabled:p.isEditable,click:()=>wc.cut()},{label:tr('copy'),enabled:!!p.selectionText,click:()=>wc.copy()},{label:tr('paste'),enabled:p.isEditable,click:()=>wc.paste()},{sep:true},
    {label:tr('openLinkNewTab'),enabled:!!p.linkURL,click:()=>createTab(c,p.linkURL,false)},{label:tr('copyLink'),enabled:!!p.linkURL,click:()=>require('electron').clipboard.writeText(p.linkURL)},
    {label:tr('saveImage'),enabled:!!p.srcURL&&p.mediaType==='image',click:()=>wc.downloadURL(p.srcURL)},{label:tr('savePage'),click:()=>savePage(c,t)},
    {label:tr('pip'),enabled:p.mediaType==='video',click:()=>togglePiP(c)},
    {label:tr('viewSource'),click:()=>createTab(c,`view-source:${t.url}`)},{label:tr('inspect'),click:()=>{wc.inspectElement(p.x,p.y);if(!wc.isDevToolsOpened())wc.openDevTools()}}
  ];
  openMenu(c,items,p.x,p.y+(t.htmlFs?0:toolbarH(c)));
}
async function savePage(c,t){try{const r=await dialog.showSaveDialog(c.window,{title:tr('savePageTitle'),defaultPath:safeFilename(t.title||'page')+'.html',filters:[{name:tr('webPage'),extensions:['html']}]});if(!r.canceled&&t.view)await t.view.webContents.savePage(r.filePath,'HTMLComplete')}catch{}}
function safeFilename(s){return String(s).replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,100)||'page'}
function appMenuData(c){
  const mod=process.platform==='darwin'?'Cmd':'Ctrl';
  return [
    ...(c.incognito?[{label:tr('incognitoNote'),enabled:false},{sep:true}]:[]),
    {label:tr('newTab'),accel:mod+'+T',click:()=>createTab(c)},{label:tr('newWindow'),accel:mod+'+N',click:()=>createWindow({})},{label:tr('newIncognitoWindow'),accel:mod+'+Shift+N',click:()=>createWindow({incognito:true})},{sep:true},
    {label:tr('history'),accel:mod+'+H',click:()=>createTab(c,HISTORY_URL)},{label:tr('bookmarks'),click:()=>createTab(c,BOOKMARKS_URL)},{label:tr('downloads'),accel:mod+'+J',click:()=>createTab(c,DOWNLOADS_URL)},{label:tr('passwords'),click:()=>createTab(c,PASSWORDS_URL)},{sep:true},
    {label:tr('zoom'),children:[{label:tr('zoomIn'),accel:mod+'++',click:()=>zoom(c,10)},{label:tr('zoomOut'),accel:mod+'+-',click:()=>zoom(c,-10)},{label:tr('zoomReset'),accel:mod+'+0',click:()=>setZoom(c,c.settings.defaultZoom)}]},
    {label:tr('findOnPage'),accel:mod+'+F',enabled:!!pageWeb(c),click:()=>{c.window.webContents.send('find:show');c.window.webContents.focus()}},
    {label:tr('print'),accel:mod+'+P',enabled:!!active(c),click:()=>printActive(c)},{label:tr('pip'),enabled:!!pageWeb(c),click:()=>togglePiP(c)},{label:tr('devtools'),accel:mod+'+Shift+I',enabled:!!active(c),click:()=>devtoolsActive(c)},{sep:true},
    {label:tr('settings'),click:()=>createTab(c,SETTINGS_URL)},{label:tr('quit'),click:()=>app.quit()}
  ];
}
function tabMenuData(c,tabId){const t=c.tabs.find(x=>x.id===tabId);if(!t)return null;const idx=c.tabs.indexOf(t);return [
  {label:tr('newTab'),click:()=>createTab(c)},{label:tr('duplicate'),click:()=>createTab(c,t.url,true,{pinned:t.pinned})},{label:t.pinned?tr('unpin'):tr('pin'),click:()=>{t.pinned=!t.pinned;c.tabs.sort((a,b)=>Number(b.pinned)-Number(a.pinned));emit(c);persistWindows()}},{sep:true},
  {label:tr('copyUrl'),enabled:!!t.url,click:()=>require('electron').clipboard.writeText(t.url)},{label:tr('moveToNewWindow'),click:()=>{createWindow({incognito:c.incognito,url:t.url||undefined});closeTab(c,t.id,false)}},{sep:true},
  {label:tr('close'),click:()=>closeTab(c,t.id)},{label:tr('closeRight'),enabled:idx<c.tabs.length-1,click:()=>[...c.tabs].slice(idx+1).forEach(x=>closeTab(c,x.id,false))},{label:tr('closeOthers'),enabled:c.tabs.length>1,click:()=>[...c.tabs].filter(x=>x!==t).forEach(x=>closeTab(c,x.id,false))},{label:tr('reopenClosed'),enabled:!!c.closedTabs.length,click:()=>reopenTab(c)}
]}

const liveDownloads=new Map();
const reservedPaths=new Set();
function uniqueSavePath(dir,filename){
  const ext=path.extname(filename),base=path.basename(filename,ext);
  for(let i=0;i<1000;i++){ const p=i?path.join(dir,`${base} (${i})${ext}`):path.join(dir,filename); if(!reservedPaths.has(p)&&!fs.existsSync(p)){reservedPaths.add(p);return p} }
  const p=path.join(dir,`${Date.now()}-${filename}`); reservedPaths.add(p); return p;
}
let dlEmitTimer=null;
function emitDlThrottled(){ if(dlEmitTimer)return; dlEmitTimer=setTimeout(()=>{dlEmitTimer=null;emitAll();refreshDlBubble()},250); }
function refreshDlBubble(){ if(dlOwner&&!dlOwner.window.isDestroyed()){dlLastState=dlState(dlOwner);sendDlState()} }
function setupDownloads(ses,incognito=false){
  if(ses.__jukDownloads)return;ses.__jukDownloads=true;
  ses.on('will-download',(_event,item,webContents)=>{
    const c=[...contexts.values()].find(x=>x.tabs.some(t=>t.view&&t.view.webContents===webContents));
    if(incognito&&!c)return;
    if(store.settings.autoSaveDownloads!==false){ try{ item.setSavePath(uniqueSavePath(app.getPath('downloads'),item.getFilename())); }catch{} }
    const d={id:id(),filename:item.getFilename(),url:item.getURL(),savePath:item.getSavePath(),state:'progressing',receivedBytes:0,totalBytes:item.getTotalBytes(),paused:false,startTime:Date.now()};
    const list=incognito?c.downloads:store.downloads;
    list.unshift(d); if(list.length>DOWNLOADS_LIMIT)list.length=DOWNLOADS_LIMIT; item.__jukId=d.id; liveDownloads.set(d.id,item);
    item.on('updated',(_e,state)=>{const now=Date.now();d.state=state;d.receivedBytes=item.getReceivedBytes();d.totalBytes=item.getTotalBytes();d.paused=item.isPaused();d.savePath=item.getSavePath();if(!d.paused)item.__activeMs=(item.__activeMs||0)+(item.__t?now-item.__t:0);item.__t=now;const secs=(item.__activeMs||0)/1000;d.speed=secs>0.5?Math.round(d.receivedBytes/secs):0;emitDlThrottled()});
    item.once('done',(_e,state)=>{d.state=state;d.receivedBytes=item.getReceivedBytes();d.totalBytes=item.getTotalBytes();d.savePath=item.getSavePath();d.endTime=Date.now();reservedPaths.delete(d.savePath);liveDownloads.delete(d.id);if(list===store.downloads)saveStore();emitAll();refreshDlBubble()});
    emitAll();refreshDlBubble();
  });
}
const PERM_AUTO_ALLOW=new Set(['fullscreen','pointerLock','clipboard-sanitized-write','mediaKeySystem']);
const PERM_ASK=new Set(['media','geolocation','notifications','clipboard-read']);
const PERM_LABEL={media:'permMedia',geolocation:'permGeolocation',notifications:'permNotifications','clipboard-read':'permClipboardRead'};
function setupPermissions(ses){
  if(ses.__jukPerms)return; ses.__jukPerms=new Map();
  const decide=(origin,permission)=>{
    if(/^(?:file|juk|devtools|chrome-extension):/.test(origin))return true;
    if(PERM_AUTO_ALLOW.has(permission))return true;
    return ses.__jukPerms.get(origin+'|'+permission)===true;
  };
  ses.setPermissionCheckHandler((_wc,permission,origin)=>decide(String(origin||''),permission));
  ses.setPermissionRequestHandler((wc,permission,callback,details)=>{
    let origin=String(details&&details.securityOrigin||details&&details.requestingUrl||'');
    if(!origin&&wc&&!wc.isDestroyed())origin=wc.getURL();
    if(decide(origin,permission))return callback(true);
    if(!PERM_ASK.has(permission))return callback(false);
    const c=wc&&!wc.isDestroyed()?[...contexts.values()].find(x=>x.window.webContents===wc||x.tabs.some(t=>t.view&&t.view.webContents===wc)):null;
    if(!c)return callback(false);
    let host=origin; try{host=new URL(origin).hostname||origin}catch{}
    dialog.showMessageBox(c.window,{type:'question',message:tr('permAsk').replace('{site}',host).replace('{perm}',tr(PERM_LABEL[permission]||permission)),buttons:[tr('allow'),tr('deny')],defaultId:1,cancelId:1,noLink:true})
      .then(r=>{const ok=r.response===0;if(ok)ses.__jukPerms.set(origin+'|'+permission,true);callback(ok)}).catch(()=>callback(false));
  });
}
const EXTERNAL_OK=new Set(['http','https','mailto','tel']);
const EXTERNAL_BLOCK=new Set(['','javascript','vbscript','data','blob','file','view-source','chrome','chrome-extension','devtools','juk','about']);
function openExternalSafe(c,u){
  const m=/^([a-z][a-z0-9+.-]*):/i.exec(String(u||'')); const scheme=m?m[1].toLowerCase():'';
  if(EXTERNAL_BLOCK.has(scheme))return;
  if(EXTERNAL_OK.has(scheme)){shell.openExternal(u).catch(()=>{});return}
  const w=c&&!c.window.isDestroyed()?c.window:null; if(!w)return;
  dialog.showMessageBox(w,{type:'question',message:tr('openExternalAsk').replace('{scheme}',scheme+':'),buttons:[tr('open'),tr('cancel')],defaultId:1,cancelId:1,noLink:true})
    .then(r=>{if(r.response===0)shell.openExternal(u).catch(()=>{})}).catch(()=>{});
}
function findDownload(downloadId){const d=store.downloads.find(x=>x.id===downloadId);if(d)return d;for(const c of contexts.values()){const x=(c.downloads||[]).find(y=>y.id===downloadId);if(x)return x}return null}
function downloadAction(downloadId,action){
  const d=findDownload(downloadId);if(!d)return;
  if(action==='open'&&d.savePath)shell.openPath(d.savePath).catch(()=>{});if(action==='folder'&&d.savePath)shell.showItemInFolder(d.savePath);
  const live=liveDownloads.get(downloadId);if(live){if(action==='pause'){live.isPaused()?live.resume():live.pause()}if(action==='cancel')live.cancel()}
  if(action==='retry'&&/^https?:/.test(d.url||'')){
    let ses=session.fromPartition('persist:juk-browser');
    if(!store.downloads.includes(d)){const owner=[...contexts.values()].find(x=>(x.downloads||[]).includes(d));if(owner)ses=owner.session}
    try{ses.downloadURL(d.url)}catch{}
  }
}

function visibleBounds(b){
  if(!b||b.x===undefined||b.y===undefined)return null;
  const ok=screen.getAllDisplays().some(d=>{const a=d.workArea;return b.x<a.x+a.width-40&&b.x+80>a.x&&b.y>=a.y-20&&b.y<a.y+a.height-40});
  return ok?b:null;
}
function createWindow(opts={}){
  const prior=opts.restore; const bounds=visibleBounds(prior?.bounds)||{width:1200,height:800};
  const win=new BrowserWindow({x:bounds.x,y:bounds.y,width:Math.max(800,bounds.width||1200),height:Math.max(550,bounds.height||800),minWidth:700,minHeight:500,frame:false,title:'Juk Browser',icon:path.join(__dirname,'icon.png'),backgroundColor:opts.incognito?'#232329':windowBackground(),show:false,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  const c={window:win,tabs:[],activeId:null,closedTabs:[],downloads:[],toolbarHeight:116,incognito:!!opts.incognito,sessionId:id(),settings:{...store.settings}};contexts.set(win.id,c);
  const ses=c.incognito?session.fromPartition(`incognito:${c.sessionId}`,{cache:false}):session.fromPartition('persist:juk-browser');c.session=ses;setupDownloads(ses,c.incognito);setupPermissions(ses);
  try{ses.setAcceptLanguages(store.settings.lang==='en'?'en-US,en;q=0.9,ru;q=0.5':'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7')}catch{}
  try{ses.setSpellCheckerLanguages(store.settings.lang==='en'?['en-US']:['ru-RU','en-US'])}catch{}
  win.loadFile('index.html').catch(()=>{});win.once('ready-to-show',()=>{win.show();if(prior?.maximized)win.maximize()});win.webContents.on('did-fail-load',()=>{if(!win.isDestroyed()&&!win.isVisible())win.show()});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.on('render-process-gone',()=>{if(!win.isDestroyed()){try{win.webContents.reload()}catch{}}});
  win.on('resize',()=>{layout(c);persistWindows();if(sugOwner===c)hideSuggestions();if(dlOwner===c)hideDlBubble();if(menuOwner===c)hideMenu();if(toastOwner===c&&toastWin&&toastWin.isVisible())positionToast(c);repositionPwWin(c)});win.on('move',()=>{persistWindows();if(sugOwner===c)hideSuggestions();if(dlOwner===c)hideDlBubble();if(menuOwner===c)hideMenu();if(toastOwner===c&&toastWin&&toastWin.isVisible())positionToast(c);repositionPwWin(c)});win.on('maximize',()=>{emit(c);persistWindows();repositionPwWin(c);if(toastOwner===c&&toastWin&&toastWin.isVisible())positionToast(c)});win.on('unmaximize',()=>{emit(c);persistWindows();repositionPwWin(c);if(toastOwner===c&&toastWin&&toastWin.isVisible())positionToast(c)});
  win.on('blur',()=>{setTimeout(()=>{if(c.window.isDestroyed())return;const f=BrowserWindow.getFocusedWindow();if(f&&(f===menuWin||f===pwWin||f===dlWin||f===sugWin))return;if(sugOwner===c)hideSuggestions();if(dlOwner===c)hideDlBubble();if(menuOwner===c)hideMenu()},60)});
  win.on('close',()=>{if(!c.incognito)c.lastSnapshot=windowSnapshot(c)});
  win.on('closed',()=>{if(sugOwner===c)hideSuggestions();if(dlOwner===c)hideDlBubble();if(menuOwner===c)hideMenu();if((pwPending&&pwPending.c===c)||(pwChooser&&pwChooser.c===c))hidePasswordPrompt();if(toastOwner===c&&toastWin&&!toastWin.isDestroyed())toastWin.hide();for(const t of c.tabs)if(t.view&&!t.view.webContents.isDestroyed())t.view.webContents.close();contexts.delete(win.id);if(isQuitting)return;if(c.lastSnapshot&&!c.incognito){closedWindowSnapshots.push(c.lastSnapshot);if(closedWindowSnapshots.length>10)closedWindowSnapshots.shift()}persistWindows();if(!contexts.size&&process.platform!=='darwin')app.quit()});
  win.webContents.on('before-input-event',(event,input)=>handleShortcut(c,event,input));
  const restoreTabs=prior?.tabs?.length?prior.tabs:null;
  if(restoreTabs){
    const ai=Math.max(0,Math.min(prior.activeIndex||0,restoreTabs.length-1));
    restoreTabs.forEach((x,i)=>createTab(c,x.url,false,{pinned:x.pinned,title:x.title,favicon:x.favicon,lazy:opts.crashed||i!==ai}));
    c.activeId=c.tabs[ai]?c.tabs[ai].id:c.tabs[0].id; showActive(c,!opts.crashed);
    if(opts.crashed)setTimeout(()=>{if(!c.window.isDestroyed())showToast(c,tr('sessionRestored'))},800);
  }else createTab(c,opts.url||c.settings.homepage,true);
  return c;
}

function registerIpc(){
  ipcMain.handle('app:ready',e=>{const c=contextForEvent(e);return c?publicState(c):null});
  ipcMain.handle('tabs:new',(e,url,activate)=>{const c=contextForEvent(e);if(!c)return null;return tabSnapshot(c,createTab(c,url,activate!==false))});
  ipcMain.handle('tabs:close',(e,tabId)=>{const c=contextForEvent(e);if(c)closeTab(c,tabId)});
  ipcMain.handle('tabs:switch',(e,tabId)=>{const c=contextForEvent(e);if(!c)return;if(c.tabs.some(t=>t.id===tabId)){c.activeId=tabId;showActive(c)}});
  ipcMain.handle('tabs:reorder',(e,from,to)=>{const c=contextForEvent(e);if(!c)return;from=Number(from);to=Number(to);if(Number.isInteger(from)&&Number.isInteger(to)&&from>=0&&to>=0&&from<c.tabs.length&&to<c.tabs.length&&from!==to){const [x]=c.tabs.splice(from,1);const pinnedCount=c.tabs.filter(t=>t.pinned).length+(x.pinned?1:0);x.pinned=to<pinnedCount;c.tabs.splice(to,0,x);emit(c);persistWindows()}});
  ipcMain.handle('nav:go',(e,input)=>navigateActive(contextForEvent(e),input));
  ipcMain.handle('nav:back',e=>{const c=contextForEvent(e);tabGo(c,c&&active(c),-1)});
  ipcMain.handle('nav:forward',e=>{const c=contextForEvent(e);tabGo(c,c&&active(c),1)});
  ipcMain.handle('nav:reload',e=>pageWeb(contextForEvent(e))?.reload());ipcMain.handle('nav:stop',e=>pageWeb(contextForEvent(e))?.stop());
  ipcMain.handle('nav:zoomReset',e=>{const c=contextForEvent(e);if(c)setZoom(c,c.settings.defaultZoom)});
  ipcMain.handle('nav:home',e=>{const c=contextForEvent(e);if(c)navigateActive(c,c.settings.homepage)});
  ipcMain.handle('find:run',(e,o)=>{const c=contextForEvent(e);if(!c)return;const t=active(c);if(!t||t.internal||!t.view)return;const text=String(o&&o.text||'');if(!text)return;c.findWc=t.view.webContents;t.view.webContents.findInPage(text,{forward:!!o.forward,findNext:!!o.findNext})});
  ipcMain.handle('find:stop',e=>{const c=contextForEvent(e);if(!c)return;const wc=c.findWc;if(wc&&!wc.isDestroyed())wc.stopFindInPage('clearSelection');c.findWc=null});
  ipcMain.handle('cert:proceed',e=>{const c=contextForEvent(e);if(!c)return;const t=active(c);if(t&&t.certError&&t.view){certBypass.add(t.certError.host);const u=t.certError.url;t.certError=null;t.view.webContents.loadURL(u).catch(()=>{});showActive(c)}});
  ipcMain.handle('cert:back',e=>{const c=contextForEvent(e);if(!c)return;const t=active(c);if(!t)return;t.certError=null;const wc=t.view?t.view.webContents:null;if(wc&&wc.navigationHistory.canGoBack()){wc.goBack()}else navigateTab(c,t,c.settings.homepage);emit(c);showActive(c)});
  ipcMain.handle('bookmarks:toggle',e=>toggleBookmark(contextForEvent(e)));
  ipcMain.handle('bookmarks:update',(e,bid,patch)=>{if(!isChrome(e))return;const b=store.bookmarks.find(x=>x.id===bid);if(b){if(typeof patch.title==='string')b.title=patch.title.slice(0,200);if(typeof patch.url==='string'&&/^https?:/.test(patch.url))b.url=patch.url;saveStore();emitAll()}});
  ipcMain.handle('bookmarks:remove',(e,bid)=>{if(!isChrome(e))return;store.bookmarks=store.bookmarks.filter(x=>x.id!==bid);saveStore();emitAll()});
  ipcMain.handle('library:get',e=>{const c=contextForEvent(e);if(!c)return null;return {history:store.history,bookmarks:store.bookmarks,downloads:c.incognito?c.downloads:store.downloads,settings:store.settings,closedTabs:c.closedTabs}});
  ipcMain.handle('tabs:reopenClosed',(e,url)=>{const c=contextForEvent(e);if(!c)return;const i=c.closedTabs.findIndex(x=>x.url===url);if(i<0)return;const [x]=c.closedTabs.splice(i,1);createTab(c,x.url,true,{pinned:x.pinned})});
  ipcMain.handle('history:remove',(e,hid)=>{if(!isChrome(e))return;store.history=store.history.filter(x=>x.id!==hid);saveStore();emitAll()});
  ipcMain.handle('history:clearRange',(e,ms)=>{if(!isChrome(e))return;const span=Number(ms)||0;store.history=span>0?store.history.filter(x=>x.time<Date.now()-span):[];saveStore();emitAll()});
  ipcMain.handle('downloads:action',(_e,did,action)=>downloadAction(did,action));
  ipcMain.handle('downloads:remove',(e,did)=>{const c=contextForEvent(e);if(!c)return;const live=liveDownloads.get(did);if(live){try{if(live.getState()==='progressing')live.cancel()}catch{}}if(c.incognito)c.downloads=(c.downloads||[]).filter(x=>x.id!==did);else{store.downloads=store.downloads.filter(x=>x.id!==did);saveStore()}emitAll()});
  ipcMain.handle('downloads:clear',e=>{const c=contextForEvent(e);if(!c)return;const keep=d=>d.state==='progressing';if(c.incognito)c.downloads=(c.downloads||[]).filter(keep);else store.downloads=store.downloads.filter(keep);saveStore();emitAll()});
  ipcMain.on('page:credentials',(e,u,p)=>{
    if(e.sender.isDestroyed())return;
    const c=[...contexts.values()].find(x=>x.tabs.some(t=>t.view&&t.view.webContents===e.sender));
    if(!c||c.incognito)return;
    let origin,host; try{const url=new URL(e.sender.getURL());if(!/^https?:/.test(url.protocol))return;origin=url.origin;host=url.hostname}catch{return}
    const username=String(u||'').slice(0,300),password=String(p||'').slice(0,300); if(!password)return;
    const t=c.tabs.find(t=>t.view&&t.view.webContents===e.sender);
    queuePwPrompt(c,e.sender,origin,host,username,password,t?.favicon||'');
  });
  ipcMain.on('page:showChooser',(e)=>{
    if(e.sender.isDestroyed())return;
    const c=[...contexts.values()].find(x=>x.tabs.some(t=>t.view&&t.view.webContents===e.sender));
    if(!c||c.incognito)return;
    const wc=e.sender;
    let origin,host,scheme; try{const u=new URL(wc.getURL());origin=u.origin;host=u.hostname;scheme=u.protocol}catch{return}
    if(scheme!=='https:')return;
    const creds=matchCreds(origin,host,scheme);
    if(creds.length<2)return;
    if(pwPending||pwChooser)return;
    const t=c.tabs.find(t=>t.view&&t.view.webContents===wc);
    if(t){const now=Date.now();if(t.__pwChooserAt&&now-t.__pwChooserAt<2500)return;}
    showAccountChooser(c,wc,creds,host);
  });
  ipcMain.on('pw:answer',(_e,save)=>{
    const p=pwPending; hidePasswordPrompt();
    if(!p)return;
    if(!save){pwDeclined.set(p.origin,Date.now());return}
    const ex=store.passwords.find(x=>x.origin===p.origin&&x.username===p.username);
    if(ex){if(decPw(ex.epw)===p.password)return;ex.epw=encPw(p.password);if(p.favicon)ex.favicon=p.favicon;} else store.passwords.unshift({id:id(),origin:p.origin,host:p.host,username:p.username,epw:encPw(p.password),favicon:p.favicon||'',created:Date.now()});
    saveStore(); showToast(p.c,tr('passwordSaved')); warnPlainPw(p.c);
  });
  ipcMain.on('pw:choose',(_e,pid)=>{
    const ch=pwChooser; hidePasswordPrompt();
    if(!ch)return;
    const cred=ch.creds.find(x=>x.id===pid); if(!cred)return;
    try{ if(ch.wc.isDestroyed())return; if(new URL(ch.wc.getURL()).hostname!==ch.host)return; }catch{return}
    const t=ch.c.tabs.find(t=>t.view&&t.view.webContents===ch.wc); if(t)t.__pwCred=pid;
    passwordFill(cred,ch.wc,true);
  });
  ipcMain.on('page:hideChooser',()=>{if(pwChooser&&!pwPending)hidePasswordPrompt()});
  ipcMain.on('pw:loginAnswer',(_e,d)=>{
    const p=pwPending; if(!p||!p.loginCb){hidePasswordPrompt();return}
    const cb=p.loginCb; p.loginCb=null; hidePasswordPrompt();
    try{ if(d)cb(String(d.u||''),String(d.p||'')); else cb(); }catch{}
  });
  ipcMain.handle('passwords:list',e=>{if(!isChrome(e))return[];return store.passwords.map(x=>({id:x.id,host:x.host,origin:x.origin,username:x.username,favicon:x.favicon||''}))});
  ipcMain.handle('passwords:reveal',(e,pid)=>{if(!isChrome(e))return'';const x=store.passwords.find(y=>y.id===pid);return x?decPw(x.epw):''});
  ipcMain.handle('passwords:remove',(e,pid)=>{if(!isChrome(e))return;store.passwords=store.passwords.filter(y=>y.id!==pid);saveStore();emitAll()});
  ipcMain.handle('passwords:add',(e,entry)=>{
    const c=contextForEvent(e); if(!c)return false;
    try{
      let origin=String(entry?.origin||'').trim(); if(!origin)return false;
      if(!/^https?:\/\//i.test(origin))origin='https://'+origin;
      origin=new URL(origin).origin;
      const username=String(entry?.username||'').slice(0,200),password=String(entry?.password||'');
      if(!password)return false;
      const ex=store.passwords.find(y=>y.origin===origin&&y.username===username);
      if(ex)ex.epw=encPw(password); else store.passwords.unshift({id:id(),origin,host:new URL(origin).hostname,username,epw:encPw(password),created:Date.now()});
      saveStore();emitAll();warnPlainPw(c);return true;
    }catch{return false}
  });
  ipcMain.handle('newtab:get',e=>{if(!isChrome(e))return{sites:[],hidden:[]};return {sites:store.newtab.sites,hidden:store.newtab.hidden}});
  ipcMain.handle('newtab:add',(e,url,title)=>{
    if(!isChrome(e))return false;
    try{
      let u=String(url||'').trim(); if(!u)return false;
      if(!/^https?:\/\//i.test(u))u='https://'+u;
      const parsed=new URL(u); if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')return false;
      const host=parsed.hostname;
      store.newtab.hidden=store.newtab.hidden.filter(h=>h!==host);
      const dup=store.newtab.sites.some(s=>{try{return new URL(s.url).hostname===host}catch{return false}});
      if(!dup)store.newtab.sites.push({id:id(),url:parsed.origin,title:String(title||'').slice(0,60)||host.replace(/^www\./,'')});
      saveStore();emitAll();return true;
    }catch{return false}
  });
  ipcMain.handle('newtab:remove',(e,tid)=>{if(!isChrome(e))return;store.newtab.sites=store.newtab.sites.filter(s=>s.id!==tid);saveStore();emitAll()});
  ipcMain.handle('newtab:hideHost',(e,host)=>{if(!isChrome(e))return;host=String(host||'');if(host&&!store.newtab.hidden.includes(host)){store.newtab.hidden.push(host);saveStore();emitAll()}});
  ipcMain.handle('newtab:setWallpaper',async e=>{
    const c=contextForEvent(e); if(!c)return false;
    let r; try{ r=await dialog.showOpenDialog(c.window,{title:tr('chooseWallpaperTitle'),properties:['openFile'],filters:[{name:tr('images'),extensions:['png','jpg','jpeg','webp','gif','bmp']}]}); }catch{ return false; }
    if(r.canceled||!r.filePaths[0])return false;
    const src=r.filePaths[0]; const ext=path.extname(src).toLowerCase()||'.png';
    try{ if(fs.statSync(src).size>30*1024*1024)return false; }catch{ return false; }
    const dest=path.join(app.getPath('userData'),'wallpaper'+ext);
    const prev=store.settings.newtabWallpaper;
    try{ fs.copyFileSync(src,dest); }catch{ return false; }
    if(prev&&prev!=='wallpaper'+ext){try{fs.unlinkSync(path.join(app.getPath('userData'),prev))}catch{}}
    store.settings.newtabWallpaper='wallpaper'+ext; wallpaperCache={f:null,url:''}; saveStore();
    for(const ctx of contexts.values()){ctx.settings={...store.settings};emit(ctx)}
    return true;
  });
  ipcMain.handle('newtab:clearWallpaper',e=>{ if(!isChrome(e))return false; const f=store.settings.newtabWallpaper; store.settings.newtabWallpaper=''; wallpaperCache={f:null,url:''}; if(f){try{fs.unlinkSync(path.join(app.getPath('userData'),f))}catch{}} saveStore(); for(const ctx of contexts.values()){ctx.settings={...store.settings};emit(ctx)} return true; });
  ipcMain.handle('settings:save',(e,patch)=>{if(!isChrome(e))return null;const clean=sanitizeSettings(patch);store.settings={...store.settings,...clean};applyThemeSource();if(clean.lang)for(const c of contexts.values())for(const t of c.tabs)if(t.internal)t.title=tr(INTERNAL_PAGES[t.internal].titleKey);for(const c of contexts.values()){c.settings={...store.settings};emit(c)}saveStore();return store.settings});
  ipcMain.handle('settings:clearData',async e=>{if(!isChrome(e))return false;try{const ses=session.fromPartition('persist:juk-browser');await ses.clearStorageData();await ses.clearCache();return true}catch{return false}});
  ipcMain.handle('omnibox:suggestions',(e,q)=>{const c=contextForEvent(e);return suggestions(q,!!c?.incognito)});
  ipcMain.handle('omnibox:popup',(e,rect,items,selected)=>showSuggestions(contextForEvent(e),rect||{},items,selected));
  ipcMain.handle('omnibox:popupHide',()=>hideSuggestions());
  ipcMain.on('suggestions:pick',(_e,i)=>{const c=sugOwner;hideSuggestions();if(c&&!c.window.isDestroyed())c.window.webContents.send('omnibox:pick',i)});
  ipcMain.on('suggestions:ready',e=>{if(sugWin&&e.sender===sugWin.webContents&&sugLastState)e.sender.send('suggestions:render',sugLastState)});
  ipcMain.on('pw:ready',e=>{if(pwWin&&e.sender===pwWin.webContents&&pwLastState)e.sender.send('pw:state',pwLastState)});
  ipcMain.handle('window:setToolbarHeight',(e,h)=>{const c=contextForEvent(e);if(!c)return;c.toolbarHeight=Math.max(70,Math.min(180,Number(h)||80));layout(c)});
  ipcMain.handle('tabs:mute',(e,tabId)=>{const c=contextForEvent(e);if(!c)return;const t=c.tabs.find(x=>x.id===tabId);if(t&&t.view){const wc=t.view.webContents;t.muted=!t.muted;wc.setAudioMuted(t.muted);emit(c)}});
  ipcMain.handle('menu:show',(e,rect)=>{const c=contextForEvent(e);if(!c)return;if(menuWin&&!menuWin.isDestroyed()&&menuWin.isVisible()&&menuOwner===c){hideMenu();return}if(Date.now()-menuHiddenAt<350)return;openMenu(c,appMenuData(c),Number(rect?.x)||0,(Number(rect?.y)||0)+(Number(rect?.height)||0)+4)});
  ipcMain.handle('menu:tab',(e,tid,x,y)=>{const c=contextForEvent(e);if(!c)return;const items=tabMenuData(c,tid);if(items)openMenu(c,items,Number(x)||0,Number(y)||0)});
  ipcMain.handle('menu:bookmark',(e,bid,x,y)=>{
    const c=contextForEvent(e); if(!c)return;
    const b=store.bookmarks.find(z=>z.id===bid); if(!b)return;
    openMenu(c,[
      {label:tr('open'),click:()=>navigateActive(c,b.url)},
      {label:tr('openLinkNewTab'),click:()=>createTab(c,b.url,false)},{sep:true},
      {label:tr('rename'),click:()=>{if(!c.window.isDestroyed())c.window.webContents.send('bookmark:rename',bid)}},
      {label:tr('delete'),click:()=>{store.bookmarks=store.bookmarks.filter(z=>z.id!==bid);saveStore();emitAll()}}
    ],Number(x)||0,Number(y)||0);
  });
  ipcMain.handle('menu:bookmarkMore',(e,x,y)=>{
    const c=contextForEvent(e); if(!c)return;
    const rest=store.bookmarks.slice(15); if(!rest.length)return;
    openMenu(c,rest.map(b=>({label:b.title||b.url,click:()=>navigateActive(c,b.url)})),Number(x)||0,Number(y)||0);
  });
  ipcMain.handle('menu:closeAll',()=>hideMenu());
  ipcMain.on('menu:closeReq',()=>hideMenu());
  ipcMain.on('menu:ready',e=>{if(menuWin&&e.sender===menuWin.webContents&&menuLastState)e.sender.send('menu:state',menuLastState)});
  ipcMain.on('menu:pick',(_e,path)=>{const items=menuItems;hideMenu();if(!items)return;let arr=items,cur=null;for(const i of String(path).split('.')){cur=arr[Number(i)];if(!cur)return;arr=cur.children||[]}if(cur&&cur.enabled!==false&&cur.click)cur.click()});
  ipcMain.handle('shell:openDownloads',()=>shell.openPath(app.getPath('downloads')).catch(()=>{}));
  ipcMain.handle('site:info',async e=>{
    const c=contextForEvent(e); if(!c)return null;
    const t=active(c); if(!t)return null;
    if(t.internal)return {type:'internal'};
    if(t.certError)return {type:'certerror',host:t.certError.host,error:t.certError.error};
    let u; try{u=new URL(t.url||'')}catch{return {type:'other'}}
    if(!/^https?:$/.test(u.protocol))return {type:'other'};
    const origin=u.origin;
    let cookies=0; try{cookies=(await c.session.cookies.get({url:origin})).length}catch{}
    const perms=[];
    if(c.session.__jukPerms)for(const key of c.session.__jukPerms.keys())if(key.startsWith(origin+'|'))perms.push(key.slice(origin.length+1));
    return {type:u.protocol==='https:'?'secure':'insecure',host:u.hostname,cookies,perms};
  });
  ipcMain.handle('site:revokePerm',(e,perm)=>{
    const c=contextForEvent(e); if(!c)return;
    const t=active(c); if(!t)return;
    let origin; try{origin=new URL(t.url||'').origin}catch{return}
    if(c.session.__jukPerms)c.session.__jukPerms.delete(origin+'|'+String(perm||''));
  });
  ipcMain.handle('ui:toast',(e,text)=>showToast(contextForEvent(e),text));
  ipcMain.handle('dl:toggle',(e,rect)=>toggleDownloadBubble(contextForEvent(e),rect||{}));
  ipcMain.handle('dl:close',()=>hideDlBubble());
  ipcMain.on('dl:ready',e=>{if(dlWin&&e.sender===dlWin.webContents&&dlLastState)e.sender.send('dl:state',dlLastState)});
  ipcMain.on('dl:action',(_e,did,action)=>downloadAction(did,action));
  ipcMain.on('dl:openAll',()=>{const c=dlOwner;hideDlBubble();if(c&&!c.window.isDestroyed())createTab(c,DOWNLOADS_URL)});
  ipcMain.handle('window:control',(e,action)=>{const c=contextForEvent(e);if(!c)return;const w=c.window;if(action==='minimize')w.minimize();if(action==='maximize')w.isMaximized()?w.unmaximize():w.maximize();if(action==='close')w.close()});
}
function sanitizeSettings(p={}){const s={};if(['google','duckduckgo','bing'].includes(p.searchEngine))s.searchEngine=p.searchEngine;if(['system','light','dark'].includes(p.theme))s.theme=p.theme;if(typeof p.homepage==='string'){const h=p.homepage.trim();if(!h)s.homepage=DEFAULTS.homepage;else if(/^https?:\/\//i.test(h)||internalKind(h))s.homepage=h;else if(/^localhost(?::\d+)?(?:\/|$)/i.test(h)||/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|$)/.test(h)||/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/\S*)?$/i.test(h))s.homepage='https://'+h;else s.homepage=DEFAULTS.homepage;}if(Number.isFinite(p.defaultZoom))s.defaultZoom=Math.max(50,Math.min(200,p.defaultZoom));if(typeof p.showBookmarksBar==='boolean')s.showBookmarksBar=p.showBookmarksBar;if(typeof p.searchSuggestions==='boolean')s.searchSuggestions=p.searchSuggestions;if(typeof p.autoSaveDownloads==='boolean')s.autoSaveDownloads=p.autoSaveDownloads;for(const k of ['newtabClock','newtabSearch','newtabTiles','newtabLinks','newtabBg'])if(typeof p[k]==='boolean')s[k]=p[k];if(p.accent===''||/^#[0-9a-f]{6}$/i.test(p.accent||''))s.accent=(p.accent||'').toLowerCase();if(['ru','en'].includes(p.lang))s.lang=p.lang;return s}
const SUGGEST_ENGINES={
  google:{url:q=>`https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(q)}`,parse:d=>Array.isArray(d)&&Array.isArray(d[1])?d[1]:[]},
  duckduckgo:{url:q=>`https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}`,parse:d=>Array.isArray(d)?d.map(x=>x&&x.phrase).filter(Boolean):[]},
  bing:{url:q=>`https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`,parse:d=>Array.isArray(d)&&Array.isArray(d[1])?d[1]:[]}
};
async function engineSuggestions(q){
  const eng=SUGGEST_ENGINES[store.settings.searchEngine]||SUGGEST_ENGINES.google;
  try{
    const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),1800);
    const res=await fetch(eng.url(q),{signal:ctrl.signal,headers:{'Accept':'application/json'}});
    clearTimeout(timer);
    if(!res.ok)return[];
    return (eng.parse(await res.json())||[]).slice(0,6);
  }catch{return[]}
}
async function suggestions(q,incognito=false){
  const needle=String(q).trim().toLowerCase();
  const seen=new Set(),local=[];
  if(!incognito)for(const x of [...store.bookmarks,...store.history]){if((x.title+' '+x.url).toLowerCase().includes(needle)&&!seen.has(x.url)){seen.add(x.url);local.push({title:x.title||x.url,url:x.url});if(local.length===5)break}}
  const out=[{title:tr('searchPrefix')+String(q).trim(),url:q}];
  if(!incognito&&store.settings.searchSuggestions!==false&&needle.length>=2&&!/^(https?:\/\/|www\.|[\w.-]+\.[a-z]{2,}(?:\/|$)|juk:\/\/)/i.test(String(q).trim())){
    for(const s of await engineSuggestions(String(q).trim())){const t=String(s).trim();if(t&&t.toLowerCase()!==needle&&!seen.has(t)){seen.add(t);out.push({title:t,url:t})}}
  }
  for(const x of local)out.push(x);
  if(!incognito){
    if(needle&&('настройки'.startsWith(needle)||'settings'.startsWith(needle)||'juk://settings'.startsWith(needle)))out.unshift({title:tr('settings'),url:SETTINGS_URL});
    if(needle&&('история'.startsWith(needle)||'history'.startsWith(needle)||'juk://history'.startsWith(needle)))out.unshift({title:tr('history'),url:HISTORY_URL});
    if(needle&&('загрузки'.startsWith(needle)||'downloads'.startsWith(needle)||'juk://downloads'.startsWith(needle)))out.unshift({title:tr('downloads'),url:DOWNLOADS_URL});
    if(needle&&('пароли'.startsWith(needle)||'passwords'.startsWith(needle)||'juk://passwords'.startsWith(needle)))out.unshift({title:tr('passwords'),url:PASSWORDS_URL});
    if(needle&&('закладки'.startsWith(needle)||'bookmarks'.startsWith(needle)||'juk://bookmarks'.startsWith(needle)))out.unshift({title:tr('bookmarks'),url:BOOKMARKS_URL});
  }
  return out.slice(0,8);
}

const SUG_ROW=36;
const POP_PAD=10;
let sugWin=null,sugOwner=null,sugLastState=null;
function hexLum(hex){ const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255; return Math.sqrt(0.299*r*r+0.715*g*g+0.0722*b*b); }
function onAccentFor(hex){ return hexLum(hex)>165?'#202124':'#ffffff'; }
function accentFgFor(hex,dark){
  const bgL=dark?42:255;
  if(Math.abs(hexLum(hex)-bgL)>=35)return hex;
  return dark?'#f3f4f6':'#202124';
}
function themeVars(c){
  const dark=!!c.incognito||c.settings.theme==='dark'||(c.settings.theme==='system'&&nativeTheme.shouldUseDarkColors);
  const pal=c.incognito?{bg:'#2e2e35',text:'#ececf1',muted:'#a2a2ad',hover:'#ffffff14',border:'#40404a'}
    :dark?{bg:'#292c31',text:'#f3f4f6',muted:'#a9adb5',hover:'#ffffff12',border:'#3b3f46'}
    :{bg:'#ffffff',text:'#202124',muted:'#71757c',hover:'#2021240b',border:'#dfe2e7'};
  pal.accent=c.settings.accent||(c.incognito?'#8ab4f8':dark?'#ff5a62':'#e43d46');
  pal.onAccent=onAccentFor(pal.accent);
  pal.accentFg=accentFgFor(pal.accent,dark);
  pal.accentSoft=pal.accent+'1f';
  return pal;
}
function suggestionsWin(){
  if(sugWin&&!sugWin.isDestroyed())return sugWin;
  sugWin=new BrowserWindow({frame:false,resizable:false,movable:false,skipTaskbar:true,focusable:false,show:false,transparent:true,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'preload-suggestions.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  sugWin.loadFile('suggestions.html').catch(()=>{});
  sugWin.on('closed',()=>{sugWin=null;sugOwner=null;sugLastState=null});
  return sugWin;
}
function showSuggestions(c,rect,items,selected){
  if(!c||c.window.isDestroyed())return;
  items=(Array.isArray(items)?items:[]).filter(x=>x&&typeof x.url==='string').slice(0,20).map(x=>({title:String(x.title||x.url).slice(0,200),url:String(x.url).slice(0,500)}));
  if(!items.length){hideSuggestions();return}
  hideMenu();hideDlBubble();
  const win=suggestionsWin(),theme=themeVars(c);
  win.setParentWindow(c.window);
  const b=c.window.getContentBounds();
  const sw=Math.max(260,Math.round(Number(rect.width)||320))+POP_PAD*2;
  const area=screen.getDisplayMatching(b).workArea;
  const sh=Math.min(items.length*SUG_ROW+16+POP_PAD*2,Math.max(120,area.height-8));
  const sx=Math.max(area.x+4,Math.min(b.x+Math.round(Number(rect.x)||0)-POP_PAD,area.x+area.width-sw-4));
  const sy=Math.max(area.y+4,Math.min(b.y+Math.round(Number(rect.y)+Number(rect.height)||toolbarH(c))+6-POP_PAD,area.y+area.height-sh-8));
  win.setBounds({x:sx,y:sy,width:sw,height:sh});
  sugOwner=c;
  const send=()=>{if(!win.isDestroyed()){sugLastState={items,selected:Math.max(-1,Math.min(items.length-1,Number(selected)||-1)),theme};win.webContents.send('suggestions:render',sugLastState)}};
  if(win.webContents.isLoading())win.webContents.once('did-finish-load',send);else send();
  win.showInactive();
}
function hideSuggestions(){ sugOwner=null; sugLastState=null; if(sugWin&&!sugWin.isDestroyed())sugWin.hide(); }

/* Password manager */
function encPw(pw){ try{ if(safeStorage.isEncryptionAvailable())return 'enc:'+safeStorage.encryptString(String(pw)).toString('base64'); }catch{} return 'plain:'+Buffer.from(String(pw),'utf8').toString('base64'); }
let plainPwWarned=false;
function warnPlainPw(c){ if(plainPwWarned)return; try{ if(safeStorage.isEncryptionAvailable())return; }catch{} plainPwWarned=true; setTimeout(()=>{try{showToast(c,tr('passwordPlainWarning'))}catch{}},3200); }
function decPw(s){ try{ if(s.startsWith('enc:'))return safeStorage.decryptString(Buffer.from(s.slice(4),'base64')); if(s.startsWith('plain:'))return Buffer.from(s.slice(6),'base64').toString('utf8'); }catch{} return ''; }
const PW_PICK_USER=`const pickUser=pw=>{try{const scope=pw.closest('form')||pw.closest('[role="dialog"],main,section,div[class*="login" i],div[class*="signin" i],div[class*="form" i]')||document;const u=scope.querySelector('input[type=email],input[name*=user i],input[name*=login i],input[name*=email i],input[autocomplete="username"],input[type=text]');if(u)return u;const all=[...document.querySelectorAll('input[type=email],input[type=text],input[name*=user i],input[name*=login i],input[name*=email i],input[autocomplete="username"]')].filter(el=>el.offsetParent!==null&&el!==pw&&(pw.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_PRECEDING));return all[all.length-1]||null}catch(e){return null}};`;
const PW_HOOK_JS=`(()=>{try{if(document.__jukPwHook)return false;document.__jukPwHook=true;
  ${PW_PICK_USER}
  const collect=()=>{try{const pw=document.querySelector('input[type=password]');if(!pw||!pw.value)return;const u=pickUser(pw);if(window.__juk)window.__juk.saveCredentials(u?String(u.value).slice(0,300):'',String(pw.value).slice(0,300))}catch(e){}};
  document.addEventListener('submit',collect,true);
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target&&e.target.matches&&e.target.matches('input[type=password]'))collect()},true);
  document.addEventListener('click',e=>{try{const b=e.target&&e.target.closest?e.target.closest('button,[type="submit"],input[type="submit"],[role="button"]'):null;if(!b)return;const f=b.closest('form')||document;if(f.querySelector('input[type=password]'))collect()}catch(e){}},true);
  const ask=e=>{try{const el=e.target;if(!el||!el.matches||!window.__juk)return;const isPw=el.matches('input[type=password]');if(!isPw&&!el.matches('input[type=email],input[type=text],input[name*=user i],input[name*=login i],input[autocomplete="username"]'))return;const pwf=document.querySelector('input[type=password]');if(pwf&&pwf.value){if(window.__juk.hideChooser)window.__juk.hideChooser();return}window.__juk.showChooser()}catch(e){}};
  document.addEventListener('focusin',ask,true);
  document.addEventListener('input',e=>{try{if(e.target&&e.target.matches&&e.target.matches('input[type=password]')&&!e.target.value)ask(e)}catch(e){}},true);
  return true}catch(e){return false}})()`;
const PW_FILL_JS=(u,p,force)=>`(()=>{try{
  const U=${JSON.stringify(u)},P=${JSON.stringify(p)},F=${!!force};
  ${PW_PICK_USER}
  const fill=()=>{try{
    const pw=document.querySelector('input[type=password]');
    if(!pw)return false;
    if(!F&&pw.value)return true;
    const uf=pickUser(pw);
    const set=(el,v)=>{if(!el)return;if(!F&&el.value)return;const s=Object.getOwnPropertyDescriptor(el.constructor.prototype,'value').set;s.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}))};
    set(uf,U);set(pw,P);return true
  }catch(e){return false}};
  if(fill())return true;
  let n=0;const iv=setInterval(()=>{if(fill()||++n>40)clearInterval(iv)},200);
  return true
}catch(e){return false}})()`;
function passwordFill(cred,wc,force=false){ const pw=decPw(cred.epw); if(!pw)return; wc.executeJavaScript(PW_FILL_JS(cred.username,pw,force)).catch(()=>{}); }
function matchCreds(origin,host,scheme){ return store.passwords.filter(x=>x.origin===origin||(scheme==='https:'&&(host===x.host||host.endsWith('.'+x.host)))); }
function passwordHooks(c,wc){
  if(c.incognito)return;
  let origin,host,scheme; try{const u=new URL(wc.getURL());origin=u.origin;host=u.hostname;scheme=u.protocol}catch{return}
  if(!/^https?:/.test(scheme))return;
  wc.executeJavaScript(PW_HOOK_JS).catch(()=>{});
  if(scheme!=='https:')return;
  const creds=matchCreds(origin,host,scheme);
  if(!creds.length)return;
  const t=c.tabs.find(t=>t.view&&t.view.webContents===wc);
  if(t&&t.__pwCred){const cred=creds.find(x=>x.id===t.__pwCred);if(cred){passwordFill(cred,wc);return}}
  if(creds.length===1&&creds[0].origin===origin)passwordFill(creds[0],wc);
}
const pwDeclined=new Map(), pwQueue=[];
function queuePwPrompt(c,wc,origin,host,username,password,favicon){
  if(pwQueue.some(q=>q.wc===wc&&q.origin===origin&&q.username===username&&q.password===password))return;
  const q={c,wc,origin,host,username,password,favicon,timer:null};
  q.timer=setTimeout(()=>showQueuedPw(q),5000);
  pwQueue.push(q);
}
function showQueuedPw(q){
  const i=pwQueue.indexOf(q); if(i<0)return; pwQueue.splice(i,1); clearTimeout(q.timer);
  if(q.wc.isDestroyed()||q.c.window.isDestroyed())return;
  showPasswordPrompt(q.c,q.origin,q.host,q.username,q.password,q.favicon,q.wc);
}
let pwWin=null,pwPending=null,pwChooser=null,pwTimer=null,pwLastState=null;
function pwPromptWin(){
  if(pwWin&&!pwWin.isDestroyed())return pwWin;
  pwWin=new BrowserWindow({width:376,height:200,frame:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,focusable:true,show:false,transparent:true,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'preload-prompt.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  pwWin.loadFile('password-prompt.html').catch(()=>{});
  pwWin.on('closed',()=>{pwWin=null;pwPending=null;pwChooser=null;pwLastState=null});
  return pwWin;
}
function pwSaveBounds(c){ const b=c.window.getContentBounds(); return {x:b.x+b.width-376-10-POP_PAD,y:b.y+toolbarH(c)+6-POP_PAD,width:376,height:200}; }
function pwChooserBounds(c,count){ const b=pwSaveBounds(c); return {...b,height:Math.min(100+count*46+POP_PAD*2,360)}; }
function repositionPwWin(c){
  if(!pwWin||pwWin.isDestroyed())return;
  if(pwPending&&pwPending.c===c)pwWin.setBounds(pwPending.loginCb?loginBounds(c):pwSaveBounds(c));
  else if(pwChooser&&pwChooser.c===c)pwWin.setBounds(pwChooserBounds(c,pwChooser.creds.length));
}
function showPasswordPrompt(c,origin,host,username,password,favicon='',wc=null){
  if(!c||c.window.isDestroyed())return;
  if(!/^https?:/.test(origin))return;
  const declinedAt=pwDeclined.get(origin); if(declinedAt&&Date.now()-declinedAt<600000)return;
  pwChooser=null;
  const ex=store.passwords.find(x=>x.origin===origin&&x.username===username);
  if(ex&&decPw(ex.epw)===password)return;
  if(pwPending&&pwPending.origin===origin&&pwPending.username===username&&pwPending.password===password)return;
  const win=pwPromptWin(),theme=themeVars(c);
  win.setParentWindow(c.window);
  win.setBounds(pwSaveBounds(c));
  pwPending={c,wc,origin,host,username,password,favicon};
  const send=()=>{if(!win.isDestroyed()){pwLastState={theme,host,username,passLen:password.length,lang:store.settings.lang};win.webContents.send('pw:state',pwLastState)}};
  if(win.webContents.isLoading())win.webContents.once('did-finish-load',send);else send();
  win.showInactive();
  clearTimeout(pwTimer); pwTimer=setTimeout(hidePasswordPrompt,60000);
}
function hidePasswordPrompt(){ const p=pwPending; pwPending=null; pwChooser=null; pwLastState=null; clearTimeout(pwTimer); if(pwWin&&!pwWin.isDestroyed())pwWin.hide(); if(p&&p.loginCb){try{p.loginCb()}catch{}} }
function loginBounds(c){ const b=c.window.getContentBounds(); const w=376,h=250; return {x:Math.round(b.x+(b.width-w)/2),y:Math.round(b.y+Math.max(80,(b.height-h)/3)),width:w,height:h}; }
function showLoginPrompt(c,wc,params,callback){
  if(pwPending||pwChooser)hidePasswordPrompt();
  const win=pwPromptWin(),theme=themeVars(c);
  win.setParentWindow(c.window);
  win.setBounds(loginBounds(c));
  pwPending={c,wc,loginCb:callback};
  const host=String(params.host||params.realm||'');
  const send=()=>{if(!win.isDestroyed()){pwLastState={theme,mode:'login',host,lang:store.settings.lang};win.webContents.send('pw:state',pwLastState)}};
  if(win.webContents.isLoading())win.webContents.once('did-finish-load',send);else send();
  win.showInactive(); win.focus();
  clearTimeout(pwTimer); pwTimer=setTimeout(hidePasswordPrompt,60000);
}
function showAccountChooser(c,wc,creds,host=''){
  if(!c||c.window.isDestroyed()||wc.isDestroyed()||pwPending)return;
  const t=c.tabs.find(t=>t.view&&t.view.webContents===wc); if(t)t.__pwChooserAt=Date.now();
  const win=pwPromptWin(),theme=themeVars(c);
  win.setParentWindow(c.window);
  win.setBounds(pwChooserBounds(c,creds.length));
  pwChooser={c,wc,creds,host};
  const send=()=>{if(!win.isDestroyed()){pwLastState={theme,mode:'choose',accounts:creds.map(x=>({id:x.id,host:x.host,username:x.username})),lang:store.settings.lang};win.webContents.send('pw:state',pwLastState)}};
  if(win.webContents.isLoading())win.webContents.once('did-finish-load',send);else send();
  win.showInactive();
  clearTimeout(pwTimer); pwTimer=setTimeout(hidePasswordPrompt,60000);
}

let toastWin=null,toastTimer=null,toastOwner=null;

let dlWin=null,dlOwner=null,dlLastState=null;
function dlBubbleWin(){
  if(dlWin&&!dlWin.isDestroyed())return dlWin;
  dlWin=new BrowserWindow({width:380,height:420,frame:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,focusable:false,show:false,transparent:true,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'preload-downloads.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  dlWin.loadFile('downloads-bubble.html').catch(()=>{});
  dlWin.on('closed',()=>{dlWin=null;dlOwner=null;dlLastState=null});
  return dlWin;
}
function dlState(c){ return {theme:themeVars(c),lang:store.settings.lang,items:(c.incognito?c.downloads:store.downloads).slice(0,6).map(x=>({id:x.id,filename:x.filename,state:x.state,paused:x.paused,receivedBytes:x.receivedBytes,totalBytes:x.totalBytes,speed:x.speed||0}))}; }
function sendDlState(){ if(dlWin&&!dlWin.isDestroyed()&&dlLastState)dlWin.webContents.send('dl:state',dlLastState); }
function toggleDownloadBubble(c,rect){
  if(!c||c.window.isDestroyed())return;
  if(dlWin&&!dlWin.isDestroyed()&&dlWin.isVisible()&&dlOwner===c){hideDlBubble();return}
  hideMenu();hideSuggestions();
  const win=dlBubbleWin();
  win.setParentWindow(c.window);
  const b=c.window.getContentBounds();
  const n=Math.max(1,Math.min(6,(c.incognito?c.downloads:store.downloads).length));
  const h=110+n*62+POP_PAD*2, w=380;
  const x=Math.max(b.x+8,Math.min(b.x+Math.round(Number(rect?.x)+Number(rect?.width)||b.width)-w+8,b.x+b.width-w-8));
  const y=b.y+Math.round(Number(rect?.y)+Number(rect?.height)||toolbarH(c))+6-POP_PAD;
  win.setBounds({x,y,width:w,height:h});
  dlOwner=c; dlLastState=dlState(c);
  const send=()=>sendDlState();
  if(win.webContents.isLoading())win.webContents.once('did-finish-load',send);else send();
  win.showInactive();
}
function hideDlBubble(){ dlOwner=null; dlLastState=null; if(dlWin&&!dlWin.isDestroyed())dlWin.hide(); }

let menuWin=null,menuItems=null,menuOwner=null,menuLastState=null,menuHiddenAt=0;
function menuPopupWin(){
  if(menuWin&&!menuWin.isDestroyed())return menuWin;
  menuWin=new BrowserWindow({width:280,height:300,frame:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,focusable:true,show:false,transparent:true,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'preload-menu.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  menuWin.loadFile('menu.html').catch(()=>{});
  menuWin.on('blur',()=>{menuHiddenAt=Date.now();hideMenu()});
  menuWin.on('closed',()=>{menuWin=null;menuItems=null;menuOwner=null;menuLastState=null});
  return menuWin;
}
function stripMenuItem(it){ return it.sep?{sep:true}:{label:it.label,enabled:it.enabled!==false,accel:it.accel||'',children:it.children?it.children.map(stripMenuItem):null}; }
function menuHeight(items){ let h=12; for(const it of items)h+=it.sep?9:30; return h; }
function openMenu(c,items,x,y){
  if(!c||c.window.isDestroyed()||!items||!items.length)return;
  hideDlBubble();hideSuggestions();
  const win=menuPopupWin(); win.setParentWindow(c.window);
  const b=c.window.getContentBounds(); const w=280; let h=menuHeight(items)+POP_PAD*2+6;
  const area=screen.getDisplayMatching(b).workArea;
  h=Math.min(h,Math.max(120,area.height-16));
  let sx=b.x+Math.round(x), sy=b.y+Math.round(y);
  sx=Math.max(b.x+8,Math.min(sx,b.x+b.width-w-8));
  if(sy+h>b.y+b.height-8)sy=Math.max(b.y+8,sy-h-8);
  win.setBounds({x:sx,y:sy,width:w,height:h});
  menuItems=items; menuOwner=c;
  menuLastState={theme:themeVars(c),items:items.map(stripMenuItem),backLabel:tr('back')};
  const send=()=>{if(!win.isDestroyed())win.webContents.send('menu:state',menuLastState)};
  if(win.webContents.isLoading())win.webContents.once('did-finish-load',send);else send();
  win.show(); win.focus();
}
function hideMenu(){ const o=menuOwner; menuItems=null; menuOwner=null; menuLastState=null; if(menuWin&&!menuWin.isDestroyed()){ if(menuWin.isFocused()&&o&&!o.window.isDestroyed())o.window.focus(); menuWin.hide(); } }
function toastWinMake(){
  if(toastWin&&!toastWin.isDestroyed())return toastWin;
  toastWin=new BrowserWindow({width:380,height:46,frame:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,focusable:false,show:false,transparent:true,backgroundColor:'#00000000',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  toastWin.on('closed',()=>{toastWin=null;toastOwner=null});
  return toastWin;
}
function positionToast(c){
  if(!toastWin||toastWin.isDestroyed())return;
  const b=c.window.getContentBounds();
  toastWin.setBounds({x:b.x+b.width-380-16,y:b.y+toolbarH(c)+8,width:380,height:74});
}
function showToast(c,text){
  if(!c||c.window.isDestroyed())return;
  const win=toastWinMake();
  win.setParentWindow(c.window);
  toastOwner=c; positionToast(c);
  win.loadFile('toast.html',{hash:encodeURIComponent(JSON.stringify({text:String(text||'').slice(0,140)}))}).catch(()=>{});
  win.showInactive();
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>{if(toastWin&&!toastWin.isDestroyed())toastWin.hide()},3000);
}

app.whenReady().then(()=>{
  loadStore();store.cleanExit=false;saveStore();Menu.setApplicationMenu(null);registerIpc();nativeTheme.on('updated',()=>emitAll());
  app.on('login',(event,wc,params,callback)=>{
    const c=[...contexts.values()].find(x=>x.window.webContents===wc||x.tabs.some(t=>t.view&&t.view.webContents===wc));
    if(!c)return;
    event.preventDefault();
    showLoginPrompt(c,wc,params||{},callback);
  });
  app.on('certificate-error',(event,wc,url,error,cert,callback)=>{
    let t=null; for(const ctx of contexts.values()){const f=ctx.tabs.find(x=>x.view&&x.view.webContents===wc);if(f){t=f;break}}
    if(!t){callback(false);return}
    let host=''; try{host=new URL(url).hostname}catch{}
    if(host&&certBypass.has(host)){callback(true);return}
    event.preventDefault();callback(false);
    t.certPending={host,error:String(error),url:String(url),at:Date.now()};
  });
  restoreSession(prevCrashed);
  const startUrl=process.argv.slice(1).find(a=>/^(?:https?:\/\/|juk:)/i.test(String(a)));if(startUrl){const c0=[...contexts.values()][0];if(c0)createTab(c0,startUrl,true)}
  app.on('activate',()=>{if(!contexts.size)restoreSession()});
  if(app.isPackaged){try{
    const {autoUpdater}=require('electron-updater');
    autoUpdater.autoDownload=true;
    autoUpdater.on('update-available',()=>{for(const c of contexts.values())showToast(c,tr('updateAvailable'))});
    autoUpdater.on('update-downloaded',async()=>{const w=[...contexts.values()][0]?.window;if(!w)return;const r=await dialog.showMessageBox(w,{type:'info',message:tr('updateReady'),buttons:[tr('restartNow'),tr('laterBtn')],defaultId:0,cancelId:1});if(r.response===0)autoUpdater.quitAndInstall()});
    autoUpdater.on('error',()=>{});
    autoUpdater.checkForUpdates().catch(()=>{});
    setInterval(()=>autoUpdater.checkForUpdates().catch(()=>{}),4*3600*1000).unref();
  }catch{}}
});
app.on('before-quit',()=>{isQuitting=true;store.cleanExit=true;if(contexts.size)persistWindows();if(saveTimer){clearTimeout(saveTimer);saveTimer=null}writeStoreNow()});
app.on('window-all-closed',()=>{if(process.platform!=='darwin'&&!contexts.size)app.quit()});
