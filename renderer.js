const $ = (s) => document.querySelector(s);
const escapeHtml = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let T = LANGS.ru, lastLang = 'ru';
function t(k){ return T[k] || LANGS.ru[k] || k; }
function applyLang(){
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>el.placeholder=t(el.dataset.i18nPh));
  document.querySelectorAll('[data-i18n-title]').forEach(el=>el.title=t(el.dataset.i18nTitle));
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));
  document.documentElement.lang=state.settings?.lang||'ru';
}
const svgIcon = (inner,sw=2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONS = {
  reload: svgIcon('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  stop: svgIcon('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 2.4),
  star: svgIcon('<path d="M12 2.5l2.95 5.97 6.6.96-4.78 4.66 1.13 6.58L12 17.57l-5.9 3.1 1.13-6.58L2.45 9.43l6.6-.96z"/>'),
  lock: svgIcon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  info: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5"/><path d="M12 7.6h.01"/>'),
  globe: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13.7 13.7 0 0 1 3.6 9 13.7 13.7 0 0 1-3.6 9 13.7 13.7 0 0 1-3.6-9A13.7 13.7 0 0 1 12 3z"/>'),
  sliders: svgIcon('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>'),
  clock: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  download: svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  file: svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  grid: svgIcon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  key: svgIcon('<circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 13L20 4"/><path d="M16 8l3 3"/>'),
  volume: svgIcon('<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  volumeX: svgIcon('<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/>'),
  close: svgIcon('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 2.4),
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>', 2.2)
};
const INTERNAL_ICONS={settings:ICONS.sliders,history:ICONS.clock,downloads:ICONS.download,passwords:ICONS.key,newtab:ICONS.grid,bookmarks:ICONS.star};
const ACCENTS=[['','accentAuto'],['#e43d46','accentRed'],['#f25c00','accentOrange'],['#f9ab00','accentAmber'],['#188038','accentGreen'],['#1a73e8','accentBlue'],['#9334e6','accentPurple'],['#d21884','accentPink']];
let state = { tabs: [], activeId: null, settings: {}, incognito: false, downloads: [] };
let suggestionItems = [], suggestionIndex = -1, sugAnchor = null;
let toolbarHeight = 0, tabDrag = false, sugTimer = 0, prevDlIds = new Set(), dlBusyUntil = 0, dlAnimTimer = 0, lastTabsSig = '', findOpen = false, prevActiveId = null, crashDismiss = null;

function activeTab(){ return state.tabs.find(t=>t.id===state.activeId) || {}; }
function applyAccent(){
  const a=state.settings?.accent||'';
  const r=document.body.style;
  if(/^#[0-9a-f]{6}$/i.test(a)){ r.setProperty('--accent',a); r.setProperty('--accent-soft',a+'1f'); r.setProperty('--on-accent',contrastFor(a)); r.setProperty('--accent-fg',accentForeground(a)); }
  else { r.removeProperty('--accent'); r.removeProperty('--accent-soft'); r.removeProperty('--on-accent'); r.removeProperty('--accent-fg'); }
}
function contrastFor(hex){
  const n=parseInt(hex.slice(1),16), rr=(n>>16)&255, gg=(n>>8)&255, bb=n&255;
  const lum=Math.sqrt(0.299*rr*rr+0.715*gg*gg+0.0722*bb*bb);
  return lum>165?'#202124':'#ffffff';
}
function accentForeground(hex){
  const dark=document.body.classList.contains('dark')||document.body.classList.contains('incognito');
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const lum=Math.sqrt(0.299*r*r+0.715*g*g+0.0722*b*b);
  const bgL=dark?42:255;
  if(Math.abs(lum-bgL)>=35)return hex;
  return dark?'#f3f4f6':'#202124';
}
function syncChromeLayout(){
  const height = Math.ceil($('#chrome').getBoundingClientRect().height);
  if(height > 0 && height !== toolbarHeight){ toolbarHeight = height; browser.setToolbarHeight(height); }
  document.documentElement.style.setProperty('--chrome-height', `${height}px`);
}
function renderState(next){
  if(!next.history&&state)next.history=state.history;
  state = next;
  T = LANGS[state.settings?.lang||'ru'] || LANGS.ru;
  applyLang();
  if(lastLang!==(state.settings?.lang||'ru')){ lastLang=state.settings.lang; for(const el of document.querySelectorAll('#settings-page,#history-page,#downloads-page,#newtab-page,#passwords-page,#bookmarks-page'))el.dataset.tabId=''; }
  document.body.classList.toggle('dark', state.settings.theme === 'dark' || (state.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches));
  document.body.classList.toggle('show-bookmarks', !!state.settings.showBookmarksBar);
  document.body.classList.toggle('maximized', !!state.maximized);
  document.body.classList.toggle('incognito', !!state.incognito);
  applyAccent();
  const maximizeButton = $('[data-window="maximize"]');
  maximizeButton.classList.toggle('restore', !!state.maximized);
  maximizeButton.title = state.maximized ? t('restore') : t('maximize');
  maximizeButton.setAttribute('aria-label', maximizeButton.title);
  const tabs=$('#tabs');
  const tabsSig=state.tabs.map(t=>[t.id,t.internal,t.title,t.favicon,t.pinned,t.loading,t.audible,t.muted,t.id===state.activeId].join('|')).join('~');
  if(tabsSig!==lastTabsSig&&!tabDrag){ lastTabsSig=tabsSig; tabs.innerHTML='';
  state.tabs.forEach((tab,index)=>{
    const el=document.createElement('div'); el.className=`tab ${tab.id===state.activeId?'active':''} ${tab.pinned?'pinned':''}`; el.draggable=true; el.dataset.id=tab.id; el.title=tab.title;
    const audioOn=tab.audible||tab.muted;
    let visual;
    if(tab.loading) visual='<i class="spinner"></i>';
    else if(tab.pinned&&audioOn) visual=`<button class="tab-audio" title="${tab.muted?t('tabUnmute'):t('tabMute')}" aria-label="${t('tabSound')}">${tab.muted?ICONS.volumeX:ICONS.volume}</button>`;
    else if(tab.internal) visual=INTERNAL_ICONS[tab.internal]||ICONS.sliders;
    else visual=`<img alt="" src="${escapeHtml(tab.favicon||'')}">`;
    const audioBtn=(!tab.pinned&&audioOn&&!tab.loading)?`<button class="tab-audio" title="${tab.muted?t('tabUnmute'):t('tabMute')}" aria-label="${t('tabSound')}">${tab.muted?ICONS.volumeX:ICONS.volume}</button>`:'';
    el.innerHTML=`${visual}<span class="tab-title">${escapeHtml(tab.title||t('newTabTitle'))}</span>${audioBtn}<button class="tab-close" title="${t('close')}" aria-label="${t('close')}">${ICONS.close}</button>`;
    el.onclick=e=>{ if(e.target.closest('.tab-close')) browser.closeTab(tab.id); else if(e.target.closest('.tab-audio')) browser.muteTab(tab.id); else browser.switchTab(tab.id); };
    el.onauxclick=e=>{if(e.button===1){e.preventDefault();browser.closeTab(tab.id)}};
    el.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();browser.showTabMenu(tab.id,e.clientX,e.clientY)};
    el.ondragstart=e=>{tabDrag=true;e.dataTransfer.setData('text/tab-index',String(index))};
    el.ondragend=()=>{tabDrag=false};
    el.ondragover=e=>{e.preventDefault();e.stopPropagation()};
    el.ondrop=e=>{e.preventDefault();e.stopPropagation();tabDrag=false;
      if(e.dataTransfer.types.includes('text/tab-index')){const from=Number(e.dataTransfer.getData('text/tab-index'));if(Number.isInteger(from))browser.reorderTabs(from,index);return}
      const url=dropUrl(e); if(url)browser.newTab(url);
    };
    tabs.appendChild(el);
  });
  }
  const a=activeTab();
  if(prevActiveId!==a.id){if(findOpen)hideFindbar();prevActiveId=a.id}
  if(findOpen&&a.internal)hideFindbar();
  const crashedView=!a.internal&&(a.crashed||a.unresponsive);
  if(!crashedView)crashDismiss=null;
  $('#crash-overlay').classList.toggle('hidden',!crashedView||crashDismiss===a.id);
  if(crashedView){$('#crash-title').textContent=a.crashed?t('pageCrashed'):t('tabUnresponsive');$('#crash-wait').classList.toggle('hidden',!a.unresponsive)}
  const certErr=!a.internal&&a.certError?a.certError:null;
  $('#cert-overlay').classList.toggle('hidden',!certErr);
  if(certErr){$('#cert-desc').textContent=t('certErrorDesc').replace('{host}',certErr.host||'');$('#cert-code').textContent=certErr.error||''}
  const sp=$('#settings-page'), hp=$('#history-page'), dp=$('#downloads-page'), np=$('#newtab-page'), pp=$('#passwords-page'), bp=$('#bookmarks-page');
  sp.classList.toggle('hidden',a.internal!=='settings');
  hp.classList.toggle('hidden',a.internal!=='history');
  dp.classList.toggle('hidden',a.internal!=='downloads');
  np.classList.toggle('hidden',a.internal!=='newtab');
  pp.classList.toggle('hidden',a.internal!=='passwords');
  bp.classList.toggle('hidden',a.internal!=='bookmarks');
  if(a.internal==='settings'){if(sp.dataset.tabId!==String(a.id)){sp.dataset.tabId=String(a.id);renderSettings()}else syncSettingsValues()}else sp.dataset.tabId='';
  if(a.internal==='history'){if(hp.dataset.tabId!==String(a.id)){hp.dataset.tabId=String(a.id);renderHistoryTab()}}else hp.dataset.tabId='';
  if(a.internal==='downloads'){if(dp.dataset.tabId!==String(a.id)){dp.dataset.tabId=String(a.id);renderDownloadsTab()}else drawDownloads()}else dp.dataset.tabId='';
  if(a.internal==='newtab'){applyNewtabPrefs();if(np.dataset.tabId!==String(a.id)){np.dataset.tabId=String(a.id);renderNewTab()}}else np.dataset.tabId='';
  if(a.internal==='passwords'){if(pp.dataset.tabId!==String(a.id)){pp.dataset.tabId=String(a.id);renderPasswordsTab()}}else pp.dataset.tabId='';
  if(a.internal==='bookmarks'){if(bp.dataset.tabId!==String(a.id)){bp.dataset.tabId=String(a.id);renderBookmarksTab()}}else bp.dataset.tabId='';
  $('#reload').disabled=!!a.internal; $('#bookmark').disabled=!!a.internal;
  if(document.activeElement!==$('#omnibox')) $('#omnibox').value=a.url||'';
  $('#back').disabled=!a.canGoBack; $('#forward').disabled=!a.canGoForward;
  $('#reload').innerHTML=a.loading?ICONS.stop:ICONS.reload;
  $('#security').innerHTML=(a.url||'').startsWith('https:')?ICONS.lock:(a.url||'').startsWith('http:')?ICONS.info:ICONS.globe;
  $('#bookmark').innerHTML=ICONS.star;$('#bookmark').classList.toggle('filled',!!a.bookmarked);
  const pf=$('#page-favicon'); pf.style.visibility='visible'; pf.src=a.favicon||''; pf.style.display=a.favicon?'block':'none';
  $('#progress').style.width=a.loading?'70%':'0';
  renderBookmarksBar();
  const dl=state.downloads||[];
  const actD=dl.filter(d=>d.state==='progressing').length;
  const dbtn=$('#downloads-button');
  const now=Date.now();
  if(actD>0){dlBusyUntil=now+1800;clearTimeout(dlAnimTimer)}
  const busy=actD>0||now<dlBusyUntil;
  dbtn.classList.toggle('busy',busy);
  const progIds=new Set(dl.filter(d=>d.state==='progressing').map(d=>d.id));
  const finished=[...prevDlIds].some(id=>!progIds.has(id)&&dl.some(d=>d.id===id&&d.state==='completed'));
  if(finished){
    toast(t('downloadDone'));
    if(busy){dlAnimTimer=setTimeout(()=>{dbtn.classList.remove('busy');dbtn.classList.remove('pop');void dbtn.offsetWidth;dbtn.classList.add('pop')},dlBusyUntil-now)}
  }
  prevDlIds=progIds;
  requestAnimationFrame(syncChromeLayout);
}

function renderBookmarksBar(){
  const bar=$('#bookmarks-bar'); bar.innerHTML='';
  const items=state.bookmarks||[];
  items.slice(0,15).forEach(b=>{const x=document.createElement('button');x.className='bookmark-item';x.innerHTML=`${b.favicon?`<img class="bm-ico" alt="" src="${escapeHtml(b.favicon)}">`:''}<span>${escapeHtml(b.title||b.url)}</span>`;x.title=b.url;x.onclick=()=>browser.navigate(b.url);x.onauxclick=e=>{if(e.button===1){e.preventDefault();browser.newTab(b.url,false)}};bar.appendChild(x)});
  if(items.length>15){const more=document.createElement('button');more.className='bookmark-item';more.textContent=t('moreBookmarks').replace('{n}',items.length-15);more.title=t('allBookmarks');more.onclick=()=>browser.newTab('juk://bookmarks');bar.appendChild(more)}
}

function closeSuggestions(){ if(!suggestionItems.length&&suggestionIndex<0)return; suggestionItems=[]; suggestionIndex=-1; sugAnchor=null; browser.hideSuggestions(); }
function syncSuggestionPopup(){
  if(!suggestionItems.length||!sugAnchor)return;
  const r=sugAnchor.getBoundingClientRect();
  browser.showSuggestions({x:r.x,y:r.y,width:r.width,height:r.height},suggestionItems,suggestionIndex);
}
async function updateSuggestions(input,anchor){
  const q=input.value.trim(); if(!q){closeSuggestions();return}
  const items=await browser.suggestions(q);
  if(input.value.trim()!==q||document.activeElement!==input)return;
  suggestionItems=items; suggestionIndex=-1; sugAnchor=anchor;
  if(!suggestionItems.length){closeSuggestions();return}
  syncSuggestionPopup();
}
function queueSuggestions(input,anchor){ clearTimeout(sugTimer); sugTimer=setTimeout(()=>updateSuggestions(input,anchor),120); }
function suggestionKeydown(e,input){
  if(e.key==='Enter'){const url=suggestionIndex>=0&&suggestionItems[suggestionIndex]?suggestionItems[suggestionIndex].url:input.value;closeSuggestions();browser.navigate(url);input.blur()}
  else if(e.key==='Escape'){closeSuggestions();input.blur()}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!suggestionItems.length)return;suggestionIndex=Math.max(-1,Math.min(suggestionItems.length-1,suggestionIndex+(e.key==='ArrowDown'?1:-1)));syncSuggestionPopup()}
}

function dropUrl(e){
  const uri=e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain');
  if(uri&&uri.trim())return uri.trim();
  const f=e.dataTransfer.files&&e.dataTransfer.files[0];
  if(f){let p='';try{p=browser.getFilePath(f)||''}catch{}if(p)return 'file:///'+p.replace(/\\/g,'/')}
  return '';
}
async function renderBookmarksTab(){
  const lib=await browser.getLibrary(); state={...state,...lib};
  const draw=()=>{
    const q=($('#bm-search').value||'').toLowerCase();
    const items=(state.bookmarks||[]).filter(x=>(x.title+' '+x.url).toLowerCase().includes(q));
    $('#bm-list').innerHTML=items.length?items.map(x=>{
      let host=''; try{host=new URL(x.url).hostname}catch{}
      return `<div class="history-row" data-url="${escapeHtml(x.url)}"><span class="history-avatar">${escapeHtml((host.replace(/^www\./,'')[0]||'★'))}${x.favicon?`<img alt="" src="${escapeHtml(x.favicon)}">`:''}</span><div class="history-main"><div class="history-title">${escapeHtml(x.title||x.url)}</div><div class="history-url">${escapeHtml(host)}</div></div><div class="dl-actions"><button class="ghost" data-bm-edit="${x.id}">${t('rename')}</button><button class="dl-del" data-del-bm="${x.id}" title="${t('delete')}" aria-label="${t('delete')}">${ICONS.close}</button></div></div>`;
    }).join(''):`<p class="history-empty">${t('noBookmarks')}</p>`;
    document.querySelectorAll('#bm-list .history-row').forEach(r=>{r.onclick=e=>{if(e.target.closest('.dl-actions'))return;browser.navigate(r.dataset.url)};r.onauxclick=e=>{if(e.button===1){e.preventDefault();if(e.target.closest('.dl-actions'))return;browser.newTab(r.dataset.url,false)}}});
    document.querySelectorAll('#bm-list [data-bm-edit]').forEach(b=>b.onclick=async()=>{const bm=(state.bookmarks||[]).find(y=>String(y.id)===b.dataset.bmEdit);if(!bm)return;const title=await promptDlg(t('renamePrompt'),bm.title);if(title!==null){await browser.bookmarkUpdate(bm.id,{title});draw();toast(t('bookmarkRenamed'))}});
    document.querySelectorAll('#bm-list [data-del-bm]').forEach(b=>b.onclick=async()=>{await browser.bookmarkRemove(b.dataset.delBm);draw();toast(t('bookmarkDeleted'))});
  };
  $('#bm-search').oninput=draw;
  draw();
}
function renderSettings(){
  const s=state.settings||{};
  const zooms=[50,67,75,80,90,100,110,125,150,175,200];
  if(!zooms.includes(s.defaultZoom)){zooms.push(s.defaultZoom);zooms.sort((a,b)=>a-b)}
  $('#settings-content').innerHTML=`
    <section id="sec-appearance" class="settings-card">
      <h2>${t('appearance')}</h2>
      <div class="setting-row">
        <div><div class="setting-label">${t('language')}</div><div class="setting-hint">${t('languageHint')}</div></div>
        <div class="segmented" id="set-lang"><button data-v="ru">Русский</button><button data-v="en">English</button></div>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">${t('theme')}</div><div class="setting-hint">${t('themeHint')}</div></div>
        <div class="segmented" id="set-theme"><button data-v="system">${t('themeSystem')}</button><button data-v="light">${t('themeLight')}</button><button data-v="dark">${t('themeDark')}</button></div>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">${t('bookmarksBar')}</div><div class="setting-hint">${t('bookmarksBarHint')}</div></div>
        <label class="switch"><input type="checkbox" id="set-bar"><span class="slider"></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">${t('accent')}</div><div class="setting-hint">${t('accentHint')}</div></div>
        <div class="swatches" id="set-accent"></div>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">${t('zoomLevel')}</div><div class="setting-hint">${t('zoomHint')}</div></div>
        <select id="set-zoom">${zooms.map(z=>`<option value="${z}">${z}%</option>`).join('')}</select>
      </div>
    </section>
    <section id="sec-search" class="settings-card">
      <h2>${t('searchEngine')}</h2>
      <div class="setting-hint mb">${t('searchEngineHint')}</div>
      <div class="radio-cards">
        <label class="radio-card"><input type="radio" name="search-engine" value="google"><span class="radio-dot"></span><span class="radio-text"><b>Google</b><small>www.google.com</small></span></label>
        <label class="radio-card"><input type="radio" name="search-engine" value="duckduckgo"><span class="radio-dot"></span><span class="radio-text"><b>DuckDuckGo</b><small>duckduckgo.com</small></span></label>
        <label class="radio-card"><input type="radio" name="search-engine" value="bing"><span class="radio-dot"></span><span class="radio-text"><b>Bing</b><small>www.bing.com</small></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">${t('suggestOn')}</div><div class="setting-hint">${t('suggestHint')}</div></div>
        <label class="switch"><input type="checkbox" id="set-suggest"><span class="slider"></span></label>
      </div>
    </section>
    <section id="sec-startup" class="settings-card">
      <h2>${t('startup')}</h2>
      <div class="setting-label">${t('homepage')}</div>
      <div class="setting-hint">${t('homepageHint')}</div>
      <div class="homepage-row"><input id="set-home" type="text" spellcheck="false" placeholder="https://www.google.com"><button class="primary" id="set-home-save">${t('save')||'Сохранить'}</button></div>
    </section>
    <section id="sec-privacy" class="settings-card">
      <h2>${t('privacy')}</h2>
      <div class="setting-row">
        <div><div class="setting-label">${t('passwordsRow')}</div><div class="setting-hint">${t('passwordsHint')}</div></div>
        <button class="ghost" id="set-passwords">${t('openPasswords')}</button>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">${t('historyRow')}</div><div class="setting-hint">${t('historyHint')}</div></div>
        <div class="row-actions"><button class="ghost" id="set-history-open">${t('openHistory')}</button><select id="set-history-range"><option value="3600000">${t('rangeHour')}</option><option value="86400000">${t('rangeDay')}</option><option value="0" selected>${t('rangeAll')}</option></select><button class="danger" id="set-history-clear">${t('clear')}</button></div>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">${t('siteData')}</div><div class="setting-hint">${t('siteDataHint')}</div></div>
        <button class="danger" id="set-clear">${t('clearData')}</button>
      </div>
      <div class="setting-hint mt">${t('incognitoInfo')}</div>
    </section>
    <section id="sec-downloads" class="settings-card">
      <h2>${t('downloadsSection')}</h2>
      <div class="setting-row">
        <div><div class="setting-label">${t('downloadsFolder')}</div><div class="setting-hint">${escapeHtml(state.downloadsPath||'')}</div></div>
        <button class="ghost" id="set-open-downloads">${t('openFolder')}</button>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">${t('autoSave')}</div><div class="setting-hint">${t('autoSaveHint')}</div></div>
        <label class="switch"><input type="checkbox" id="set-autodl"><span class="slider"></span></label>
      </div>
    </section>
    <section id="sec-about" class="settings-card">
      <h2>${t('about')}</h2>
      <div class="about-box"><div class="juk-mark" aria-hidden="true">J</div><div><b>Juk Browser</b><div class="setting-hint">${t('versionPrefix')} ${escapeHtml(state.version||'1.0.0')} · Electron / Chromium</div></div></div>
    </section>`;
  document.querySelectorAll('#set-lang button').forEach(b=>{b.classList.toggle('active',b.dataset.v===(s.lang||'ru'));b.onclick=()=>{document.querySelectorAll('#set-lang button').forEach(x=>x.classList.toggle('active',x===b));browser.saveSettings({lang:b.dataset.v})}});
  document.querySelectorAll('#set-theme button').forEach(b=>{b.classList.toggle('active',b.dataset.v===s.theme);b.onclick=()=>{document.querySelectorAll('#set-theme button').forEach(x=>x.classList.toggle('active',x===b));browser.saveSettings({theme:b.dataset.v})}});
  const cur=s.accent||'';
  const acc=$('#set-accent');
  acc.innerHTML=ACCENTS.map(([v,k])=>`<button class="swatch${v?'':' auto'}${cur===v?' active':''}" data-v="${v}" title="${t(k)}"></button>`).join('')+
    `<label class="swatch custom${cur&&!ACCENTS.some(([v])=>v===cur)?' active':''}" title="${t('accentCustom')}"><input type="color" id="set-accent-custom" value="${cur||'#e43d46'}"></label>`;
  acc.querySelectorAll('.swatch[data-v]').forEach(b=>b.onclick=()=>{acc.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active'));b.classList.add('active');browser.saveSettings({accent:b.dataset.v})});
  $('#set-accent-custom').oninput=e=>{acc.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active'));e.target.closest('.swatch').classList.add('active');browser.saveSettings({accent:e.target.value})};
  $('#set-bar').checked=!!s.showBookmarksBar;
  $('#set-bar').onchange=()=>browser.saveSettings({showBookmarksBar:$('#set-bar').checked});
  $('#set-zoom').value=String(s.defaultZoom||100);
  $('#set-zoom').onchange=()=>browser.saveSettings({defaultZoom:Number($('#set-zoom').value)});
  document.querySelectorAll('input[name=search-engine]').forEach(r=>{r.checked=r.value===s.searchEngine;r.onchange=()=>{if(r.checked)browser.saveSettings({searchEngine:r.value})}});
  $('#set-suggest').checked=s.searchSuggestions!==false;
  $('#set-suggest').onchange=()=>browser.saveSettings({searchSuggestions:$('#set-suggest').checked});
  $('#set-autodl').checked=s.autoSaveDownloads!==false;
  $('#set-autodl').onchange=()=>browser.saveSettings({autoSaveDownloads:$('#set-autodl').checked});
  $('#set-open-downloads').onclick=()=>browser.openDownloadsFolder();
  $('#set-home').value=s.homepage||'';
  $('#set-home-save').onclick=async()=>{
    const v=$('#set-home').value.trim();
    const s=await browser.saveSettings({homepage:v});
    const ok=!!s&&(!v||s.homepage===v||s.homepage==='https://'+v);
    toast(t(ok?'homepageSaved':'invalidUrl'));
  };
  $('#set-home').onkeydown=e=>{if(e.key==='Enter')$('#set-home-save').click()};
  $('#set-history-open').onclick=()=>browser.newTab('juk://history');
  $('#set-passwords').onclick=()=>browser.newTab('juk://passwords');
  $('#set-history-clear').onclick=async()=>{const range=Number($('#set-history-range').value);const label=$('#set-history-range').selectedOptions[0].textContent.toLowerCase();if(await confirmDlg(t('confirmClearHistory').replace('{range}',label),t('clear'))){await browser.clearHistoryRange(range);toast(t('historyCleared'))}};
  $('#set-clear').onclick=async()=>{if(await confirmDlg(t('confirmClearData'),t('delete'))){await browser.clearData();toast(t('dataCleared'))}};
}
function syncSettingsValues(){
  const s=state.settings||{},ae=document.activeElement;
  const setV=(sel,prop,v)=>{const el=$(sel);if(el&&el!==ae)el[prop]=v};
  document.querySelectorAll('#set-lang button').forEach(b=>b.classList.toggle('active',b.dataset.v===(s.lang||'ru')));
  document.querySelectorAll('#set-theme button').forEach(b=>b.classList.toggle('active',b.dataset.v===s.theme));
  const cur=s.accent||'';
  document.querySelectorAll('#set-accent .swatch[data-v]').forEach(b=>b.classList.toggle('active',b.dataset.v===cur));
  const custom=$('#set-accent .swatch.custom');
  if(custom){custom.classList.toggle('active',!!cur&&!ACCENTS.some(([v])=>v===cur));const ci=custom.querySelector('input');if(ci&&ci!==ae)ci.value=/^#[0-9a-f]{6}$/i.test(cur)?cur:'#e43d46'}
  setV('#set-bar','checked',!!s.showBookmarksBar);
  setV('#set-zoom','value',String(s.defaultZoom||100));
  document.querySelectorAll('input[name=search-engine]').forEach(r=>{if(r!==ae)r.checked=r.value===s.searchEngine});
  setV('#set-suggest','checked',s.searchSuggestions!==false);
  setV('#set-autodl','checked',s.autoSaveDownloads!==false);
  setV('#set-home','value',s.homepage||'');
}
function dayLabel(ts){
  const d=new Date(ts),now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const day=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const diff=Math.round((today-day)/86400000);
  if(diff===0)return t('today');
  if(diff===1)return t('yesterday');
  return d.toLocaleDateString(state.settings?.lang==='en'?'en':'ru',{day:'numeric',month:'long',year:'numeric'});
}
function groupHistory(items){
  const map=new Map();
  for(const x of items){const d=new Date(x.time);const key=`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;if(!map.has(key))map.set(key,[]);map.get(key).push(x)}
  return [...map.entries()].map(([,arr])=>({label:dayLabel(arr[0].time),items:arr}));
}
async function renderHistoryTab(){
  const lib=await browser.getLibrary(); state={...state,...lib};
  const draw=()=>{
    const q=($('#history-search').value||'').toLowerCase();
    const items=(state.history||[]).filter(x=>(x.title+' '+x.url).toLowerCase().includes(q));
    $('#history-list').innerHTML=items.length?groupHistory(items).map(g=>`<div class="history-day">${g.label}</div>`+g.items.map(x=>{
      let host=''; try{host=new URL(x.url).hostname}catch{}
      return `<div class="history-row" data-url="${escapeHtml(x.url)}"><span class="history-avatar">${escapeHtml((host.replace(/^www\./,'')[0]||'•'))}${x.favicon?`<img alt="" src="${escapeHtml(x.favicon)}">`:''}</span><div class="history-main"><div class="history-title">${escapeHtml(x.title||x.url)}</div><div class="history-url">${escapeHtml(host)}</div></div><span class="history-time">${new Date(x.time).toLocaleTimeString(state.settings?.lang==='en'?'en':'ru',{hour:'2-digit',minute:'2-digit'})}</span><button class="history-del" data-del="${x.id}" title="${t('deleteEntry')}" aria-label="${t('deleteEntry')}">${ICONS.close}</button></div>`;
    }).join('')).join(''):`<p class="history-empty">${t('historyEmpty')}</p>`;
    document.querySelectorAll('#history-list .history-row').forEach(r=>{r.onclick=e=>{if(e.target.closest('.history-del'))return;browser.navigate(r.dataset.url)};r.onauxclick=e=>{if(e.button===1){e.preventDefault();if(e.target.closest('.history-del'))return;browser.newTab(r.dataset.url,false)}}});
    document.querySelectorAll('#history-list .history-del').forEach(b=>b.onclick=async()=>{await browser.removeHistory(b.dataset.del);draw()});
  };
  $('#history-search').oninput=draw;
  $('#history-clear').onclick=async()=>{const range=Number($('#history-range').value);const label=$('#history-range').selectedOptions[0].textContent.toLowerCase();if(await confirmDlg(t('confirmClearHistory').replace('{range}',label),t('clear'))){await browser.clearHistoryRange(range);draw();toast(t('historyCleared'))}};
  draw();
}
function drawDownloads(){
  const list=$('#downloads-list'); if(!list)return;
  const STATUS={progressing:t('stProgressing'),completed:t('stCompleted'),cancelled:t('stCancelled'),interrupted:t('stInterrupted')};
  const d=state.downloads||[];
  list.innerHTML=d.length?d.map(x=>{
    const pct=x.totalBytes>0?Math.round(x.receivedBytes/x.totalBytes*100):null;
    const status=x.state==='progressing'&&x.paused?t('stPaused'):(STATUS[x.state]||x.state);
    const speedTxt=x.state==='progressing'&&x.speed>0?` · ${formatBytes(x.speed)}/${t('unitSec')}`:'';
    const eta=x.state==='progressing'&&x.speed>0&&x.totalBytes>0?` · ${t('etaPrefix')}${formatEta((x.totalBytes-x.receivedBytes)/x.speed)}`:'';
    return `<div class="dl-row">
      <span class="dl-ico">${ICONS.file}</span>
      <div class="dl-main">
        <div class="dl-name">${escapeHtml(x.filename)}</div>
        <div class="dl-meta">${status} · ${formatBytes(x.receivedBytes)}${x.totalBytes>0?' / '+formatBytes(x.totalBytes):''}${pct!==null?` · ${pct}%`:''}${speedTxt}${eta}</div>
        ${x.state==='progressing'?(x.totalBytes>0?`<progress class="dl-progress" max="${x.totalBytes}" value="${x.receivedBytes||0}"></progress>`:'<progress class="dl-progress"></progress>'):''}
      </div>
      <div class="dl-actions">
        ${x.state==='progressing'?`<button class="ghost" data-dl="pause:${x.id}">${x.paused?t('resume'):t('pause')}</button><button class="ghost" data-dl="cancel:${x.id}">${t('cancelDl')}</button>`:x.state==='completed'?`<button class="primary" data-dl="open:${x.id}">${t('open')}</button><button class="ghost" data-dl="folder:${x.id}">${t('showInFolder')}</button>`:''}
        <button class="dl-del" data-del-dl="${x.id}" title="${t('removeFromList')}" aria-label="${t('removeFromList')}">${ICONS.close}</button>
      </div>
    </div>`;
  }).join(''):`<p class="history-empty">${t('noDownloads')}</p>`;
  list.querySelectorAll('[data-dl]').forEach(b=>b.onclick=()=>{const [action,id]=b.dataset.dl.split(':');browser.downloadAction(id,action)});
  list.querySelectorAll('[data-del-dl]').forEach(b=>b.onclick=()=>browser.downloadRemove(b.dataset.delDl));
}
async function renderDownloadsTab(){
  const lib=await browser.getLibrary(); state={...state,...lib};
  $('#downloads-clear').onclick=async()=>{if(await confirmDlg(t('confirmClearDownloads'),t('clear'))){await browser.downloadsClear();drawDownloads();toast(t('listCleared'))}};
  drawDownloads();
}
function applyNewtabPrefs(){
  const s=state.settings||{};
  const np=$('#newtab-page'); if(!np)return;
  $('#nt-clock').classList.toggle('hidden',s.newtabClock===false);
  $('#nt-date').classList.toggle('hidden',s.newtabClock===false);
  $('#newtab-search-wrap').classList.toggle('hidden',s.newtabSearch===false);
  $('#newtab-tiles').classList.toggle('hidden',s.newtabTiles===false);
  $('#newtab-links').classList.toggle('hidden',s.newtabLinks===false);
  const wp=state.wallpaperUrl||'';
  const showWp=!!wp&&s.newtabBg!==false;
  if(np.dataset.wp!==(showWp?wp:'')){
    np.dataset.wp=showWp?wp:'';
    if(showWp){np.style.setProperty('background-image',`url("${wp}")`)}else np.style.removeProperty('background-image');
  }
  np.classList.toggle('has-wallpaper',showWp);
  np.classList.toggle('no-bg',s.newtabBg===false);
}
function tickClock(){
  const np=$('#newtab-page'); if(!np||np.classList.contains('hidden'))return;
  const d=new Date(), lang=state.settings?.lang==='en'?'en':'ru';
  $('#nt-clock').textContent=d.toLocaleTimeString(lang,{hour:'2-digit',minute:'2-digit'});
  $('#nt-date').textContent=d.toLocaleDateString(lang,{weekday:'long',day:'numeric',month:'long'});
}
async function renderNewTab(){
  tickClock();
  const [lib,nt]=await Promise.all([browser.getLibrary(),browser.newtabGet()]);
  state={...state,...lib};
  const favByHost=new Map(), urlByHost=new Map(), countByHost=new Map();
  const hostOf=u=>{try{return new URL(u).hostname}catch{return ''}};
  for(const x of state.history||[]){
    const host=hostOf(x.url); if(!host)continue;
    countByHost.set(host,(countByHost.get(host)||0)+1);
    if(x.favicon&&!favByHost.has(host))favByHost.set(host,x.favicon);
    if(!urlByHost.has(host))urlByHost.set(host,x.url);
  }
  const hidden=new Set(nt.hidden||[]), customHosts=new Set(), tiles=[];
  for(const s of nt.sites||[]){
    const host=hostOf(s.url); if(!host)continue; customHosts.add(host);
    tiles.push({key:'id:'+s.id,url:s.url,name:s.title||host.replace(/^www\./,''),favicon:favByHost.get(host)||''});
  }
  if(!state.incognito)[...countByHost.entries()].sort((a,b)=>b[1]-a[1]).map(([h])=>h).filter(h=>!hidden.has(h)&&!customHosts.has(h)).slice(0,Math.max(0,8-tiles.length))
    .forEach(h=>tiles.push({key:'host:'+h,url:urlByHost.get(h)||'https://'+h,name:h.replace(/^www\./,''),favicon:favByHost.get(h)||''}));
  $('#newtab-tiles').innerHTML=tiles.map(x=>`<div class="nt-tile" data-url="${escapeHtml(x.url)}"><button class="nt-del" data-del="${escapeHtml(x.key)}" title="${t('removeTile')}" aria-label="${t('removeTile')}">${ICONS.close}</button><span class="nt-ico">${x.favicon?`<img alt="" src="${escapeHtml(x.favicon)}">`:escapeHtml((x.name[0]||'•'))}</span><span class="nt-name">${escapeHtml(x.name)}</span></div>`).join('')+`<div class="nt-tile nt-add" id="nt-add"><span class="nt-ico">${ICONS.plus}</span><span class="nt-name">${t('addTile')}</span></div>`;
  document.querySelectorAll('.nt-tile[data-url]').forEach(b=>{b.onclick=e=>{if(e.target.closest('.nt-del'))return;browser.navigate(b.dataset.url)};b.onauxclick=e=>{if(e.button===1){e.preventDefault();if(e.target.closest('.nt-del'))return;browser.newTab(b.dataset.url,false)}}});
  document.querySelectorAll('.nt-del').forEach(b=>b.onclick=async e=>{e.stopPropagation();const v=b.dataset.del;if(v.startsWith('id:'))await browser.newtabRemove(v.slice(3));else await browser.newtabHide(v.slice(5));renderNewTab()});
  $('#nt-add').onclick=()=>openNtModal();
  document.querySelectorAll('[data-nl]').forEach(b=>b.onclick=()=>browser.navigate(b.dataset.nl));
  const si=$('#newtab-search'); si.value='';
  si.oninput=()=>queueSuggestions(si,$('#newtab-search-wrap'));
  si.onkeydown=e=>suggestionKeydown(e,si);
  si.onblur=()=>closeSuggestions();
  setTimeout(()=>si.focus(),60);
}
async function renderPasswordsTab(){
  const draw=async()=>{
    const [list,lib]=await Promise.all([browser.passwordsList(),browser.getLibrary()]);
    const favByHost=new Map();
    for(const h of lib.history||[]){ if(!h.favicon)continue; try{const host=new URL(h.url).hostname; if(!favByHost.has(host))favByHost.set(host,h.favicon)}catch{} }
    const q=($('#pw-search').value||'').toLowerCase();
    const items=list.filter(x=>(x.host+' '+(x.username||'')).toLowerCase().includes(q));
    $('#pw-list').innerHTML=items.length?items.map(x=>{
      const fav=x.favicon||favByHost.get(x.host)||'';
      const letter=(x.host.replace(/^www\./,'')[0]||'•');
      return `<div class="dl-row"><span class="history-avatar">${escapeHtml(letter)}${fav?`<img alt="" src="${escapeHtml(fav)}">`:''}</span><div class="dl-main"><div class="dl-name">${escapeHtml(x.host)}</div><div class="dl-meta">${escapeHtml(x.username||'—')}</div></div><div class="dl-actions"><span class="pw-value" id="pwv-${x.id}">••••••••</span><button class="ghost" data-eye="${x.id}">${t('show')}</button><button class="dl-del" data-del-pw="${x.id}" title="${t('delete')}" aria-label="${t('delete')}">${ICONS.close}</button></div></div>`;
    }).join(''):`<p class="history-empty">${t('noPasswords')}</p>`;
    document.querySelectorAll('[data-eye]').forEach(b=>b.onclick=async()=>{
      const el=document.getElementById('pwv-'+b.dataset.eye);
      if(b.dataset.shown){el.textContent='••••••••';b.textContent=t('show');b.dataset.shown=''}
      else{el.textContent=await browser.passwordsReveal(b.dataset.eye);b.textContent=t('hide');b.dataset.shown='1'}
    });
    document.querySelectorAll('[data-del-pw]').forEach(b=>b.onclick=async()=>{if(await confirmDlg(t('confirmDeletePassword'),t('delete'))){await browser.passwordsRemove(b.dataset.delPw);draw();toast(t('passwordDeleted'))}});
  };
  $('#pw-search').oninput=draw;
  $('#pw-add-btn').onclick=async()=>{
    const site=$('#pw-add-site').value.trim(),login=$('#pw-add-login').value.trim(),pass=$('#pw-add-pass').value;
    if(!site||!pass){toast(t('enterSiteAndPassword'));return}
    if(await browser.passwordsAdd({origin:site,username:login,password:pass})){
      $('#pw-add-site').value='';$('#pw-add-login').value='';$('#pw-add-pass').value='';
      draw();toast(t('passwordSaved'));
    } else toast(t('passwordSaveFailed'));
  };
  draw();
}
function formatBytes(n=0){if(!n)return `0 ${t('unitB')}`;const k=1024,u=[t('unitB'),t('unitKB'),t('unitMB'),t('unitGB')],i=Math.min(Math.floor(Math.log(n)/Math.log(k)),3);return `${(n/k**i).toFixed(i?1:0)} ${u[i]}`}
function formatEta(s){s=Math.max(0,Math.round(s));if(s<60)return `${s} ${t('unitSec')}`;const m=Math.floor(s/60),r=s%60;return r?`${m} ${t('unitMin')} ${r} ${t('unitSec')}`:`${m} ${t('unitMin')}`}
function toast(text){browser.toastMsg(text)}
function confirmDlg(text,okLabel='Удалить'){
  if(!$('#confirm-overlay').classList.contains('hidden'))return Promise.resolve(false);
  return new Promise(resolve=>{
    const ov=$('#confirm-overlay');
    $('#confirm-text').textContent=text; $('#confirm-ok').textContent=okLabel;
    ov.classList.remove('hidden');
    const onKey=e=>{if(e.key==='Escape')done(false);if(e.key==='Enter')done(true)};
    const done=v=>{ov.classList.add('hidden');document.removeEventListener('keydown',onKey);ov.onclick=null;$('#confirm-ok').onclick=null;$('#confirm-cancel').onclick=null;resolve(v)};
    $('#confirm-ok').onclick=()=>done(true);
    $('#confirm-cancel').onclick=()=>done(false);
    ov.onclick=e=>{if(e.target===ov)done(false)};
    document.addEventListener('keydown',onKey);
  });
}
function promptDlg(text,value=''){
  if(!$('#confirm-overlay').classList.contains('hidden'))return Promise.resolve(null);
  return new Promise(resolve=>{
    const ov=$('#confirm-overlay');
    $('#confirm-text').textContent=text; $('#confirm-ok').textContent=t('save');
    const input=document.createElement('input'); input.type='text'; input.value=value; input.spellcheck=false;
    input.style.cssText='display:block;margin-top:14px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--panel);color:var(--text);font-size:14px;width:100%;box-sizing:border-box';
    $('#confirm-card').insertBefore(input,$('#confirm-actions'));
    ov.classList.remove('hidden');
    setTimeout(()=>{input.focus();input.select()},30);
    const onKey=e=>{if(e.key==='Escape')done(null);if(e.key==='Enter')done(input.value)};
    const done=v=>{ov.classList.add('hidden');document.removeEventListener('keydown',onKey);ov.onclick=null;$('#confirm-ok').onclick=null;$('#confirm-cancel').onclick=null;input.remove();resolve(v)};
    $('#confirm-ok').onclick=()=>done(input.value);
    $('#confirm-cancel').onclick=()=>done(null);
    ov.onclick=e=>{if(e.target===ov)done(null)};
    document.addEventListener('keydown',onKey);
  });
}

$('#new-tab').onclick=()=>browser.newTab(); $('#back').onclick=()=>browser.back();$('#forward').onclick=()=>browser.forward();
$('#reload').onclick=()=>activeTab().loading?browser.stop():browser.reload();$('#home').onclick=()=>browser.home();
$('#menu').onclick=e=>{e.stopPropagation();const r=$('#menu').getBoundingClientRect();browser.showAppMenu({x:r.x,y:r.y,width:r.width,height:r.height})};$('#downloads-button').onclick=()=>{const r=$('#downloads-button').getBoundingClientRect();browser.downloadsBubble({x:r.x,y:r.y,width:r.width,height:r.height})};
$('#bookmark').onclick=async()=>{await browser.bookmarkToggle();toast(activeTab().bookmarked?t('bookmarkAdded'):t('bookmarkDeleted'))};
$('#omnibox').oninput=()=>queueSuggestions($('#omnibox'),$('#omnibox-wrap'));$('#omnibox').onfocus=()=>$('#omnibox').select();$('#omnibox').onblur=()=>closeSuggestions();
$('#omnibox').onkeydown=e=>suggestionKeydown(e,e.target);
document.addEventListener('click',e=>{if(!e.target.closest('#omnibox-wrap')&&!e.target.closest('#newtab-search-wrap'))closeSuggestions();if(!e.target.closest('#downloads-button'))browser.closeDownloadBubble();if(!e.target.closest('#menu'))browser.closeMenus()});
document.addEventListener('error',e=>{const t=e.target;if(t&&t.tagName==='IMG')t.style.visibility='hidden'},true);
document.querySelectorAll('[data-window]').forEach(x=>x.onclick=()=>browser.windowControl(x.dataset.window));
function openNtModal(){$('#nt-url').value='';$('#nt-title').value='';$('#nt-modal').classList.remove('hidden');setTimeout(()=>$('#nt-url').focus(),30)}
function closeNtModal(){$('#nt-modal').classList.add('hidden')}
$('#nt-save').onclick=async()=>{
  const url=$('#nt-url').value.trim();
  if(!url){toast(t('enterSiteUrl'));return}
  if(await browser.newtabAdd(url,$('#nt-title').value.trim())){closeNtModal();renderNewTab();toast(t('tileAdded'))}
  else toast(t('invalidUrl'));
};
$('#nt-cancel').onclick=closeNtModal;
$('#nt-modal').onclick=e=>{if(e.target.id==='nt-modal')closeNtModal()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#nt-modal').classList.contains('hidden'))closeNtModal()});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const g=e.target&&e.target.tagName;if(g==='INPUT'||g==='TEXTAREA'||g==='SELECT')return;browser.closeMenus();browser.closeDownloadBubble()});
$('#nt-url').onkeydown=e=>{if(e.key==='Enter')$('#nt-save').click()};
$('#nt-title').onkeydown=e=>{if(e.key==='Enter')$('#nt-save').click()};
['#pw-add-site','#pw-add-login','#pw-add-pass'].forEach(s=>{$(s).onkeydown=e=>{if(e.key==='Enter')$('#pw-add-btn').click()}});
document.querySelectorAll('#settings-nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#settings-nav button').forEach(x=>x.classList.toggle('active',x===b));
  const sec=document.getElementById('sec-'+b.dataset.section); if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'});
});
window.addEventListener('resize',syncChromeLayout);
setInterval(tickClock,1000);
const titlebar=$('#titlebar');
titlebar.ondragover=e=>{if(e.target.closest('.window-controls'))return;e.preventDefault()};
titlebar.ondrop=e=>{e.preventDefault();if(e.target.closest('.window-controls'))return;if(e.dataTransfer.types.includes('text/tab-index'))return;const url=dropUrl(e);if(url)browser.newTab(url)};
titlebar.addEventListener('dblclick',e=>{
  if(e.target.closest('.tab,button,input'))return;
  browser.windowControl('maximize');
});
$('#nt-cfg-btn').onclick=e=>{e.stopPropagation();const p=$('#nt-cfg');p.classList.toggle('hidden');if(!p.classList.contains('hidden'))syncNtCfg()};
function syncNtCfg(){const s=state.settings||{};$('#nt-cfg-clock').checked=s.newtabClock!==false;$('#nt-cfg-search').checked=s.newtabSearch!==false;$('#nt-cfg-tiles').checked=s.newtabTiles!==false;$('#nt-cfg-links').checked=s.newtabLinks!==false;$('#nt-cfg-bg').checked=s.newtabBg!==false}
[['#nt-cfg-clock','newtabClock'],['#nt-cfg-search','newtabSearch'],['#nt-cfg-tiles','newtabTiles'],['#nt-cfg-links','newtabLinks'],['#nt-cfg-bg','newtabBg']].forEach(([sel,key])=>{$(sel).onchange=()=>browser.saveSettings({[key]:$(sel).checked})});
$('#nt-cfg-wp').onclick=async()=>{if(await browser.setWallpaper())toast(t('wallpaperSet'))};
$('#nt-cfg-wp-clear').onclick=async()=>{if(await browser.clearWallpaper())toast(t('wallpaperRemoved'))};
document.addEventListener('click',e=>{if(!e.target.closest('#nt-cfg')&&!e.target.closest('#nt-cfg-btn'))$('#nt-cfg').classList.add('hidden')});
new ResizeObserver(syncChromeLayout).observe($('#chrome'));
function showFindbar(){const a=activeTab();if(a.internal)return;$('#findbar').classList.remove('hidden');findOpen=true;const fi=$('#find-input');fi.focus();fi.select();if(fi.value)browser.findRun({text:fi.value,forward:true,findNext:false})}
function hideFindbar(){if(!findOpen)return;findOpen=false;$('#findbar').classList.add('hidden');$('#find-count').textContent='';browser.findStop()}
$('#find-input').oninput=()=>{const v=$('#find-input').value;if(v)browser.findRun({text:v,forward:true,findNext:false});else{browser.findStop();$('#find-count').textContent=''}};
$('#find-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const v=$('#find-input').value;if(v)browser.findRun({text:v,forward:!e.shiftKey,findNext:true})}else if(e.key==='Escape'){e.preventDefault();hideFindbar()}};
$('#find-prev').onclick=()=>{const v=$('#find-input').value;if(v)browser.findRun({text:v,forward:false,findNext:true})};
$('#find-next').onclick=()=>{const v=$('#find-input').value;if(v)browser.findRun({text:v,forward:true,findNext:true})};
$('#find-close').onclick=hideFindbar;
$('#crash-reload').onclick=()=>{crashDismiss=activeTab().id||null;$('#crash-overlay').classList.add('hidden');browser.reload()};
$('#crash-wait').onclick=()=>{crashDismiss=activeTab().id||null;$('#crash-overlay').classList.add('hidden')};
$('#cert-back').onclick=()=>browser.certBack();
$('#cert-proceed').onclick=()=>browser.certProceed();
browser.onFindShow(showFindbar);
browser.onFindResult(r=>{if(!findOpen)return;$('#find-count').textContent=r.matches?`${r.active}/${r.matches}`:(r.final?t('findNoResults'):'')});
browser.onState(renderState);browser.onFocusOmnibox(()=>{$('#omnibox').focus();$('#omnibox').select()});
browser.onOmniboxPick(i=>{const it=suggestionItems[i];if(!it)return;closeSuggestions();browser.navigate(it.url);const ae=document.activeElement;if(ae&&ae.blur)ae.blur()});
(async()=>{const initial=await browser.ready();if(initial)renderState(initial);syncChromeLayout()})();
