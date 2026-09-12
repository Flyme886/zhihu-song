import {renderSummary} from './discussion-summary.js';
import {PlanetAudio} from './audio.js';
import {SECTIONS,buildHistory,queryHistory,parseRoute,dateLabel} from './history.js';
import {recordMarkdown} from './session.js';
import {setupWander} from './wander-ui.js';
const $=s=>document.querySelector(s);
const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const download=(text,name,type)=>{const url=URL.createObjectURL(new Blob([text],{type}));const a=element('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
const safeLink=url=>{try{const u=new URL(url);return /^https?:$/.test(u.protocol)?u.href:null;}catch{return null;}};

export function setupPlanet(api){
 const lifetime=new AbortController();
 const listen=(target,event,callback,options={})=>target.addEventListener(event,callback,{...options,signal:lifetime.signal});
 api.store.preparePlanet();
 const shell=element('div',undefined,'planet-shell');shell.id='planet-shell';shell.innerHTML=`
 <div class="cinema-vignette" aria-hidden="true"></div><div id="atmosphere-veil" aria-hidden="true"></div>
 <header class="cosmic-header"><a class="cosmic-brand" href="#/home" aria-label="思想引力场首页"><span class="orbit-symbol" aria-hidden="true"></span><span>思想引力场<small>让想法，有处安放</small></span></a><div class="cosmic-navigation"><button id="cosmic-explore">知识星球 <span>↗</span></button><button id="cosmic-my-planet">我的星球 <span>◌</span></button></div></header>
 <section id="cosmic-home" aria-label="我的星球，花田全景"><div class="home-copy"><p class="cosmic-kicker"><span></span> 每一段来路，都值得记得</p><h1>在想法<br>生长的地方。</h1><p class="home-description">沿着花田，遇见从前的自己。</p><div class="home-actions"><button id="home-explore" class="cosmic-primary"><span>进入知识星球</span><span class="arrow-orbit" aria-hidden="true">↗</span></button><button id="enter-planet" class="home-secondary"><span>进入我的星球</span><span aria-hidden="true">↗</span></button></div><button id="home-story" class="home-story"><span>故事演示</span> 我想留下的，其实是什么？ <b>↗</b></button><p id="home-memory" class="home-memory">从第一个想法开始。</p></div><button id="planet-orb-hit" aria-label="点击星球，进入我的星球"><span class="orb-caption"><i></i>我的星球<small>MY LITTLE UNIVERSE</small></span></button><div class="home-bottom"><span>花田 · 来路 · 另一种可能</span><span>拖动视角，慢慢探索</span></div></section>
 <section id="planet-travel" hidden aria-label="正在进入星球"><div class="travel-caption"><span id="travel-step">离开喧嚣</span><small id="travel-description">正在靠近，你留下的世界。</small><div class="travel-track"><i></i></div></div><button id="skip-travel">跳过旅程 ↗</button></section>
 <section id="planet-surface" hidden aria-label="我的星球地表"><div class="surface-intro"><p class="cosmic-kicker"></p><h1>我的星球</h1><p id="surface-subtitle">想法会改变，走过的路会留下。</p></div><div class="landmarks" aria-label="记忆地标"><button data-landmark="opinions"><span class="beacon-dot"></span><small>01</small><strong>我的观点</strong><em>从前与现在</em><b>0</b></button><button data-landmark="cases"><span class="beacon-dot"></span><small>02</small><strong>参与过的案例</strong><em>每一次认真想过</em><b>0</b></button><button data-landmark="records"><span class="beacon-dot"></span><small>03</small><strong>讨论记录</strong><em>让不同留下回声</em><b>0</b></button></div><div class="surface-footer"><button id="leave-planet">↖ 返回知识星球</button><p id="surface-hint">选择一束光，回到一个想法。</p><button id="planet-new-thought">写下新的想法 ＋</button></div><nav class="memory-nav" aria-label="个人历史导航"><button data-section="opinions">我的观点</button><button data-section="cases">参与过的案例</button><button data-section="records">讨论记录</button></nav></section>
 <aside id="memory-panel" hidden aria-label="个人历史阅读"><div class="memory-panel-top"><span id="memory-eyebrow">MEMORY ARCHIVE</span><button id="close-memory" aria-label="关闭历史阅读">×</button></div><h2 id="memory-title"></h2><div id="memory-tools"><label class="memory-search">⌕ <input id="memory-search" type="search" placeholder="寻找一个想法…" aria-label="搜索个人历史"></label><div class="memory-filters"><select id="memory-topic" aria-label="按话题筛选"><option value="">全部话题</option></select><select id="memory-order" aria-label="排序"><option value="newest">最近在前</option><option value="oldest">最早在前</option></select></div></div><div id="memory-content"></div><div id="memory-pagination"></div><div class="memory-bottom"><span>仅保存在这台设备</span><button id="backup-memory">备份全部 .json ↗</button></div></aside>
 <div id="planet-toast" role="status" hidden></div>
 <div class="sound-controls"><button id="sound-toggle" aria-label="关闭声音" aria-pressed="true"><span class="sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span id="sound-label">声音待开启</span></button><button id="sound-settings" aria-label="声音与画面设置" aria-expanded="false">⌘</button></div>
 <section id="sound-panel" aria-label="声音与画面设置" hidden><div class="sound-panel-title">留一点安静<button id="close-sound" aria-label="关闭声音设置">×</button></div><label>总音量 <input id="sound-master" type="range" min="0" max="100" value="30"></label><label>环境氛围 <input id="sound-ambient" type="range" min="0" max="100" value="65"></label><label>穿越音效 <input id="sound-transitions" type="range" min="0" max="100" value="60"></label><label>交互音效 <input id="sound-effects" type="range" min="0" max="100" value="75"></label><label>画面细节 <select id="world-quality" aria-label="画面细节"><option value="auto">自动</option><option value="high">丰富</option><option value="low">轻盈</option></select></label><button id="cosmic-pause" aria-pressed="false">暂停景观动画</button><p>声音跟随你的动作。阅读时，环境会安静下来。</p></section>`;
 shell.append($('#fallback'),$('#announcer'));document.body.append(shell);
 listen(document,'pointerdown',e=>document.body.dataset.pointer=e.pointerType,{passive:true});listen(document,'keydown',e=>{if(e.key==='Tab')document.body.dataset.pointer='keyboard';});
 api.renderer()?.setCounts({opinions:0,cases:0,records:0});
 const audio=new PlanetAudio(api.store.setting('audio'),settings=>api.store.setting('audio',settings));
 let wander=null;
 let view='home',route={view:'home'},travel=0,travelDuration=3,ringPlayed=false,lastRoute='',routeToken=0,returnView='home',focusWait=0,panelReady=false,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,reduced=paused,index=buildHistory(api.store.data,api.catalog),filters={query:'',topicId:'',order:'newest',page:0},toastTimer,lastDeleted=null;
 const sections=Object.keys(SECTIONS),landmarks=[...document.querySelectorAll('[data-landmark]')];
 const motionMedia=matchMedia('(prefers-reduced-motion: reduce)');listen(motionMedia,'change',e=>{reduced=e.matches;if(reduced){paused=true;if(view==='travel')finishTravel();}updatePause();});
 function announce(message){$('#announcer').textContent=message;}
 function toast(message,action){const box=$('#planet-toast');box.replaceChildren(element('span',message));if(action){const b=element('button',action.label);b.addEventListener('click',()=>{box.hidden=true;action.run();});box.append(b);}box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,action?8000:3400);}
 function applyView(next){
  view=next;document.body.dataset.view=next;$('#cosmic-home').hidden=next!=='home';$('#planet-travel').hidden=next!=='travel';$('#planet-surface').hidden=next!=='planet';
  const world=next==='world';$('#topic-sidebar').inert=!world||(innerWidth<=900&&document.body.dataset.sidebar!=='open');document.querySelector('meta[name="theme-color"]').content=world?'#03060b':'#e7ece1';$('#app').inert=false;
  $('#universe').setAttribute('aria-label',world?'由晶莹粒子构成的思想星球，自由漂浮在画布中':'我的星球，花田、旅人与可回看的记忆');
  for(const child of $('#app').children)if(child.id!=='universe'){child.inert=!world;child.setAttribute('aria-hidden',String(!world));}
  if(!world){document.querySelectorAll('dialog[open]:not(.story-overlay):not(#wander-map)').forEach(d=>d.close());$('#discussion').hidden=true;$('#app').dataset.discussing='false';document.body.dataset.sidebar='closed';$('#sidebar-backdrop').hidden=true;}
  if(next!=='planet')closePanel(false);if(next==='planet')updateLandmarkBounds();api.motion?.clear();audio.setScene(next);updateSound();
 }
 function navigate(path,replace=false){const hash='#'+path;if(location.hash!==hash){history[replace?'replaceState':'pushState']({},'',hash);}return handleRoute();}
 async function handleRoute(){
  const signature=location.hash;if(signature===lastRoute)return;lastRoute=signature;const token=++routeToken;const next=parseRoute(signature,api.catalog);route=next;
  if(next.view==='world'){
   api.leaveWorld();applyView('world');audio.cancelTravel();await api.loadTopic(next.topicId||api.store.data.lastTopic);if(token!==routeToken)return;$(innerWidth>900?'#topic-search':'#open-topics').focus();
  }else if(next.view==='planet'){
   if(view==='world'){returnView='world';api.leaveWorld();}
   if(view!=='planet'&&view!=='travel'){applyView('planet');travel=1;}
   if(view==='travel'&&next.section)finishTravel();
   if(next.section)focusSection(next.section,next.itemId);else closePanel(true);
  }else{if(view==='world')api.leaveWorld();audio.cancelCues();applyView('home');$(index.records.length?'#enter-planet':'#home-explore').focus();}
  wander?.route(next);
 }
 async function enter(){
  if(view==='travel')return;audio.cancelCues();audio.unlock().then(()=>{updateSound();if(view==='travel')audio.cue('enter');});if(view==='planet'){navigate('/planet');return;}
  returnView=view==='world'?'world':'home';if(view==='world')api.leaveWorld();
  api.renderer()?.setFocus(null);travel=0;ringPlayed=false;travelDuration=reduced?.15:api.store.setting('visitedPlanet')?.55:2;
  route={view:'planet'};lastRoute='#/planet';history.pushState({},'','#/planet');applyView('travel');audio.cue('enter');$('#skip-travel').focus();announce('正在进入我的星球，可以跳过旅程。');
 }
 function finishTravel(){travel=1;audio.cancelTravel();applyView('planet');api.store.setting('visitedPlanet',true);audio.cue('land');announce('已抵达我的星球。使用方向键走动，靠近记忆后按 E 查看。');$('#wander-map-button')?.focus({preventScroll:true});}
 function focusSection(section,itemId){
  route={view:'planet',section,itemId};api.renderer()?.setFocus(section);focusWait=reduced?.01:.45;panelReady=false;$('#memory-panel').hidden=true;$('#planet-surface').dataset.focused='true';document.body.dataset.reading='false';audio.cue('focus');sections.forEach(s=>document.querySelector(`[data-section="${s}"]`).setAttribute('aria-current',s===section?'page':'false'));
 }
 function closePanel(resetCamera){for(const b of document.querySelectorAll('[data-section]'))b.setAttribute('aria-current','false');$('#memory-panel').hidden=true;document.body.dataset.reading='false';$('#planet-surface').dataset.focused='false';focusWait=0;panelReady=false;if(resetCamera)api.renderer()?.setFocus(null);audio.setScene(view);}
 function openPanel(){panelReady=true;$('#memory-panel').hidden=false;document.body.dataset.reading='true';renderPanel();$('#memory-title').tabIndex=-1;$('#memory-title').focus({preventScroll:true});audio.setScene('reading');}
 function button(text,fn,cls='memory-action'){const b=element('button',text,cls);b.addEventListener('click',fn);return b;}
 function paragraph(text,label){const wrap=element('section',undefined,'memory-text');if(label)wrap.append(element('h3',label));wrap.append(element('p',text));return wrap;}
 function sources(nodes){const wrap=element('section',undefined,'memory-sources');wrap.append(element('h3','当时的来源'));if(!nodes.length)wrap.append(element('p','这份记录未保存来源快照。'));
  for(const n of nodes){const article=element('article');article.append(element('small',n.source||'个人输入'),element('h4',n.author||n.title||'来源'),element('p',n.body||''));if(n.context)article.append(element('small',n.context));const href=safeLink(n.url);if(href){const a=element('a','阅读原来源 ↗');a.href=href;a.target='_blank';a.rel='noopener noreferrer';article.append(a);}wrap.append(article);}return wrap;}
 async function exploreTopic(id,compose=false){await navigate('/world/'+encodeURIComponent(id||api.store.data.lastTopic));if(compose){$('#compose').click();}}
 function renderPanel(){
  const section=route.section||'opinions',content=$('#memory-content');$('#memory-title').textContent=SECTIONS[section];$('#memory-eyebrow').textContent='0'+(sections.indexOf(section)+1)+' / MEMORY ARCHIVE';content.replaceChildren();$('#memory-pagination').replaceChildren();
  const item=route.itemId?index[section].find(n=>n.id===route.itemId):null;
  $('#memory-tools').hidden=!!route.itemId;
  if(route.itemId&&!item){content.append(paragraph('这条记忆已不存在，或保存在另一台设备上。'),button('返回列表',()=>navigate('/planet/'+section)));return;}
  if(item){
   content.scrollTop=0;
   content.append(button('← 返回'+SECTIONS[section],()=>navigate('/planet/'+section),'memory-back'),element('small',dateLabel(item.date),'memory-date'),element('h3',item.topicTitle,'memory-detail-title'));
   if(section==='opinions'){
    content.append(paragraph(item.body,`第 ${item.version} 次留下的想法`));if(item.previous)content.append(paragraph(item.previous,'在这之前，我这样想'));
    content.append(button('补充这个想法 ↗',()=>exploreTopic(item.topicId,true)),button('导出观点 .md',()=>download(`# ${item.topicTitle}\n\n${dateLabel(item.date)}\n\n${item.body}\n\n${item.previous?'## 之前的想法\n\n'+item.previous:''}`,`观点-${item.id}.md`,'text/markdown;charset=utf-8')));
   }else if(section==='cases'){
    content.append(paragraph(item.body),paragraph(item.latest||'我还没有提交自己的判断。','我留下的观点'));if(item.rules)content.append(paragraph(item.rules,'案例边界'));
    content.append(element('p',`${item.opinionCount} 个观点版本 · ${item.recordCount} 份讨论记录`,'memory-count'),sources(item.sources));
    for(const source of item.background){const href=safeLink(source.url);if(href){const a=element('a',source.title+' ↗','memory-source-link');a.href=href;a.target='_blank';a.rel='noopener noreferrer';content.append(a);}}
    content.append(button('继续探索这个案例 ↗',()=>exploreTopic(item.topicId)));
   }else{
    const labels={keep:'保留原判断',supplement:'补充原判断',changed:'改变原判断'};content.append(paragraph(item.note||'尚未补充个人结论。',labels[item.change]||'我现在的想法'),paragraph(item.common||'尚未确认共同点。','共同点'),paragraph(item.additions?.join('\n')||'引用的经历与适用条件仍需进一步核实。','待核实与补充条件'));
    const transcript=element('details');transcript.append(element('summary','回看完整对谈'));for(const m of item.messages||[]){const entry=paragraph(m.text,m.who);entry.dataset.messageId=m.id;transcript.append(entry);}if(item.summary){const summary=element('div');renderSummary(summary,item.summary,item.messages||[],{onReference:id=>{transcript.open=true;const entry=[...transcript.children].find(n=>n.dataset.messageId===id);if(entry){entry.tabIndex=-1;entry.focus({preventScroll:true});entry.scrollIntoView({block:'center'});}}});content.append(summary);}
    const originals=element('details');originals.append(element('summary',item.companion?'回看当时的来源 · 含同伴':'回看当时的来源'),sources([item.source,item.companion,item.target].filter(Boolean)));content.append(transcript,originals,paragraph('Agent 发言是基于材料的延展，不代表原答主本人。'));
    content.append(button('导出讨论 .md',()=>download(recordMarkdown(item),`讨论-${item.id}.md`,'text/markdown;charset=utf-8')),button('开启新的讨论 ↗',async()=>{await exploreTopic(item.topicId);api.continueRecord(item);}),button('删除记录',()=>{lastDeleted={topicId:item.topicId,record:api.store.deleteRecord(item.topicId,item.id)};navigate('/planet/records');toast('记录已移除，可在列表中撤销。');}));
   }
   return;
  }
  if(section==='records'&&lastDeleted)content.append(button('撤销刚才的删除',()=>{api.store.addRecord(lastDeleted.topicId,lastDeleted.record);lastDeleted=null;renderPanel();toast('记录已恢复。');}));
  const result=queryHistory(index[section],filters);filters.page=result.page;
  if(!result.total){content.append(element('div','◌','memory-empty-orbit'),element('h3',filters.query||filters.topicId?'还没有找到这个想法':'这里，等待第一束光。','memory-empty-title'),paragraph(filters.query||filters.topicId?'换一个关键词或话题，再试一次。':'每一次认真想过、读过、交谈过，都可以成为这颗星球的一部分。'));if(!filters.query&&!filters.topicId)content.append(button('写下第一个观点 ↗',()=>exploreTopic(null,true)));}
  for(const n of result.items){const b=element('button',undefined,'memory-card');b.append(element('small',dateLabel(n.date)+(section==='opinions'?` / 版本 ${n.version}`:'')),element('h3',n.topicTitle),element('p',n.body||'回到这次相遇，看看留下了什么。'),element('span',section==='cases'?`${n.opinionCount} 个观点 · ${n.recordCount} 份讨论`:'展开这段记忆 ↗'));b.addEventListener('click',()=>navigate('/planet/'+section+'/'+encodeURIComponent(n.id)));content.append(b);}
  if(result.total){const pagination=$('#memory-pagination');const prev=button('←',()=>{filters.page--;renderPanel();});prev.disabled=!result.page;prev.setAttribute('aria-label','上一页');const next=button('→',()=>{filters.page++;renderPanel();});next.disabled=result.page>=result.pages-1;next.setAttribute('aria-label','下一页');pagination.append(prev,element('span',`${result.page+1} / ${result.pages} · ${result.total} 条记忆`),next);}
 }
 function updateIndex(){index=buildHistory(api.store.data,api.catalog);const counts=Object.fromEntries(sections.map(s=>[s,index[s].length]));api.renderer()?.setCounts(counts);landmarks.forEach((b,i)=>b.querySelector('b').textContent=counts[sections[i]]);$('#enter-planet span:first-child').textContent='进入我的星球';$('#enter-planet').className=counts.records?'cosmic-primary':'home-secondary';$('#home-explore').className=counts.records?'home-secondary':'cosmic-primary';$('#home-memory').textContent=counts.opinions||counts.records?`${counts.opinions} 个想法，${counts.cases} 段来路，${counts.records} 次相遇。`:'';$('#surface-subtitle').textContent=counts.opinions||counts.records?'想法会改变，走过的路会留下。':'星球已在这里，等待你的第一个想法。';}
 let firstSavedRecord=null,saveJourney=null;
 $('#close-first-record').addEventListener('click',()=>$('#first-record-dialog').close());$('#continue-first-record').addEventListener('click',()=>$('#first-record-dialog').close());$('#visit-first-record').addEventListener('click',()=>{$('#first-record-dialog').close();if(firstSavedRecord)navigate('/planet/records/'+encodeURIComponent(firstSavedRecord.id));});
 const unsubscribe=api.store.subscribe(updateIndex);updateIndex();
 const filterTopics=new Map(api.catalog.map(topic=>[topic.id,topic.shortTitle||topic.title]));for(const item of index.cases)if(!filterTopics.has(item.topicId))filterTopics.set(item.topicId,item.topicTitle);for(const [id,title] of filterTopics){const option=element('option',title);option.value=id;$('#memory-topic').append(option);}
 for(const el of document.querySelectorAll('[data-landmark],[data-section]'))el.addEventListener('click',()=>{filters.page=0;audio.unlock();navigate('/planet/'+(el.dataset.landmark||el.dataset.section));});
 for(const [id,key] of [['memory-search','query'],['memory-topic','topicId'],['memory-order','order']])$('#'+id).addEventListener(id==='memory-search'?'input':'change',e=>{filters[key]=e.target.value;filters.page=0;renderPanel();});
 function closeReading(){const section=route.section||'opinions';navigate('/planet');document.querySelector(`[data-landmark="${section}"]`)?.focus({preventScroll:true});}
 $('#close-memory').addEventListener('click',closeReading);
 $('#home-explore').addEventListener('click',()=>{audio.unlock().then(updateSound);exploreTopic(index.records.length?null:api.catalog.find(t=>t.id==='snail')?.id);});$('#enter-planet').addEventListener('click',enter);$('#planet-orb-hit').addEventListener('click',enter);$('#cosmic-my-planet').addEventListener('click',enter);$('#cosmic-explore').addEventListener('click',()=>{audio.unlock().then(updateSound);exploreTopic();});
 $('#leave-planet').addEventListener('click',()=>{audio.cue('leave');navigate(returnView==='world'?'/world/'+api.store.data.lastTopic:'/home');});$('#planet-new-thought').addEventListener('click',()=>exploreTopic(null,true));
 $('#skip-travel').addEventListener('click',finishTravel);$('#backup-memory').addEventListener('click',()=>{download(api.store.exportJSON(),`思想引力场-全部记忆-${new Date().toISOString().slice(0,10)}.json`,'application/json;charset=utf-8');toast('已生成本机记忆备份。');});
 function updateSound(){const enabled=audio.settings.enabled;$('#sound-toggle').setAttribute('aria-pressed',String(enabled&&audio.ready));$('#sound-toggle').setAttribute('aria-label',enabled&&audio.ready?'关闭声音':'开启声音');$('#sound-label').textContent=enabled?(audio.ready?'声音已开启':'声音待开启'):'声音已关闭';document.body.dataset.sound=enabled&&audio.ready?'on':'off';}
 $('#sound-toggle').addEventListener('click',async()=>{audio.update({enabled:!audio.settings.enabled||!audio.ready});if(audio.settings.enabled)await audio.unlock();else audio.cancelCues();updateSound();});
 // Direct world links also unlock on an actual pointer/keyboard gesture. The
 // sound toggle owns its first click, and a saved mute is never overridden.
 function unlockWorld(e){if(view==='world'&&e.isTrusted&&!e.target.closest?.('#sound-toggle')&&audio.settings.enabled&&audio.context?.state!=='running')audio.unlock().then(updateSound);}
 listen(document,'pointerdown',unlockWorld,{capture:true});
 listen(document,'keydown',unlockWorld,{capture:true});
 function interaction(kind,detail){
  if(!audio.settings.enabled||document.hidden)return;
  if(audio.context?.state==='running'){audio.cue(kind,detail);return;}
  // On touch devices click may arrive before resume() resolves. A brief,
  // route-bound wait retains that gesture without replaying stale collisions.
  const token=routeToken,at=performance.now();
  audio.unlock().then(()=>{
   updateSound();
   if(token===routeToken&&view==='world'&&!document.hidden&&$('#app').dataset.stage==='world'&&performance.now()-at<600)audio.cue(kind,detail);
  });
 }
 listen($('#world-quality'),'change',e=>{api.renderer()?.setQuality(e.target.value);api.store.setting('worldQuality',e.target.value);});
 $('#sound-settings').addEventListener('click',()=>{$('#sound-panel').hidden=!$('#sound-panel').hidden;$('#sound-settings').setAttribute('aria-expanded',String(!$('#sound-panel').hidden));});$('#close-sound').addEventListener('click',()=>{$('#sound-panel').hidden=true;$('#sound-settings').setAttribute('aria-expanded','false');$('#sound-settings').focus();});
 for(const name of ['master','ambient','effects','transitions']){const input=$('#sound-'+name);input.value=audio.settings[name]*100;input.addEventListener('input',()=>{audio.update({[name]:input.value/100});audio.unlock().then(updateSound);updateSound();});}
 function updatePause(){api.setPaused(paused);$('#cosmic-pause').textContent=paused?'播放景观动画':'暂停景观动画';$('#cosmic-pause').setAttribute('aria-pressed',String(paused));document.body.dataset.cosmicPaused=String(paused);}
 $('#cosmic-pause').addEventListener('click',()=>{paused=!paused;updatePause();});updatePause();updateSound();
 listen(document,'visibilitychange',()=>{if(document.hidden)audio.suspend();else audio.resume();});
 function updateLandmarkBounds(){if(view==='planet')api.renderer()?.setLandmarkBounds?.(landmarks.map(b=>b.offsetWidth));}
 listen(window,'resize',updateLandmarkBounds);
 listen(window,'popstate',handleRoute);listen(window,'hashchange',handleRoute);
 listen(document,'keydown',e=>{if(e.key!=='Escape')return;if(!$('#sound-panel').hidden){$('#close-sound').click();return;}if(view==='travel')finishTravel();else if(view==='planet'&&route.section)closeReading();});
 return {
  async init(){const quality=api.store.setting('worldQuality')||'auto';$('#world-quality').value=quality;api.renderer()?.setQuality(quality);wander=setupWander({api,audio,navigate,view:()=>view,toast});$('#home-story').addEventListener('click',()=>{audio.unlock();wander.start();});if(!location.hash){const old=new URL(location.href).searchParams.get('topic');history.replaceState({},'',old?'#/world/'+encodeURIComponent(old):'#/home');}await handleRoute();},
  enter,navigate,interaction,showWorld(id){route={view:'world',topicId:id};lastRoute='#/world/'+id;audio.cancelTravel();applyView('world');},
  onRecordSaved(record){updateIndex();if(api.store.failed)return;const token=routeToken;Promise.resolve(saveJourney??true).then(completed=>{if(!completed||token!==routeToken||view!=='world'||api.store.failed)return;if(!api.store.setting('firstRecordWelcome')&&index.records.length===1){firstSavedRecord=record;api.store.setting('firstRecordWelcome',true);$('#first-record-dialog').showModal();}});},
  onSave({kind='opinion',origin}={}){
   updateIndex();if(api.store.failed){toast('修改暂留在本页，请导出备份。');return;}
   const latest=(kind==='record'?index.records:index.opinions).filter(i=>i.topicId===api.store.data.lastTopic).at(-1);const action={label:'回看刚才',run:()=>latest?navigate('/planet/'+(kind==='record'?'records':'opinions')+'/'+encodeURIComponent(latest.id)):enter()};
   if(kind==='record'){
    const target=(view==='world'?$('#profile'):$('#cosmic-my-planet')),rect=target?.getBoundingClientRect();
    const land=()=>{api.renderer()?.burst();api.motion?.pulse(target);audio.cue('save');toast('这次相遇，已成为你的一部分。',action);};
    if(origin&&rect&&api.motion)saveJourney=api.motion.stream({x:origin.left+origin.width/2,y:origin.top+origin.height/2},{x:rect.left+rect.width/2,y:rect.top+rect.height/2},{color:'#efce94',duration:1050,count:16,land});else{land();saveJourney=Promise.resolve(true);}
   }else {api.renderer()?.burst();audio.cue('save');toast(index.opinions.length===1?'第一束光，已经留在你的星球。':'新的想法，已留在你的星球。',action);}
  },
  frame(dt){wander?.frame(dt);if(view==='world')return false;if(view==='travel'){travel=Math.min(1,travel+dt/travelDuration);if(!ringPlayed&&travel>=.54){ringPlayed=true;if(!reduced)audio.cue('ring');}const step=travel<.17?0:travel<.54?1:travel<.76?2:3;$('#travel-step').textContent=['离开喧嚣','循着思想的轨迹','穿过一片微光','回到你的世界'][step];$('#planet-travel').style.setProperty('--progress',travel);$('#atmosphere-veil').style.background=reduced?'#f4eddd':'';$('#atmosphere-veil').style.opacity=String(reduced?1-travel:Math.max(0,1-Math.abs(travel-.76)/.10)*.9);if(travel>=1)finishTravel();}else $('#atmosphere-veil').style.opacity='0';
   api.renderer()?.frame(view==='travel'&&reduced?'planet':view,travel,dt,paused||reduced,reduced);if(view==='home'){const hit=api.renderer()?.projectPlanet();if(hit){const b=$('#planet-orb-hit');b.style.left=(hit.x-hit.r)+'px';b.style.top=(hit.y-hit.r)+'px';b.style.width=2*hit.r+'px';b.style.height=2*hit.r+'px';}}if(view==='planet'){if(focusWait>0){focusWait-=dt;if(focusWait<=0)openPanel();}const projected=api.renderer()?.projectLandmarks();landmarks.forEach((b,i)=>{const p=projected?.[i];if(p){const left=p.x.toFixed(1)+'px',top=p.y.toFixed(1)+'px';if(b.style.left!==left)b.style.left=left;if(b.style.top!==top)b.style.top=top;}else{b.style.left='';b.style.top='';}});}return true;},
  debug(){return{view,route,travel,focusRemaining:focusWait,audio:audio.debug(),wander:wander?.debug(),renderer:api.renderer()?.getStats(),history:Object.fromEntries(sections.map(s=>[s,index[s].length]))};},
  leave(){return navigate(returnView==='world'?'/world/'+api.store.data.lastTopic:'/home');},focusLandmark(section){if(SECTIONS[section])return navigate('/planet/'+section);},skip(){if(view==='travel')finishTravel();},setPaused(value){paused=value;updatePause();},dispose(){api.stop();wander?.dispose();lifetime.abort();unsubscribe();clearTimeout(toastTimer);audio.dispose();api.renderer()?.dispose();shell.remove();},get view(){return view;},audio
 };
}
