import {createStoryStore} from './story.js';
import {createStoryUI} from './story-ui.js';
import {buildHistory} from './history.js';
import {memoryPosition,memoryLayout,AREAS,Walker,pathDistance} from './wander-controller.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const POSITION_KEY='gravity.wander.v1';
export function setupWander({api,audio,navigate,view,toast}){
 const life=new AbortController(),listen=(n,event,fn,opts={})=>n.addEventListener(event,fn,{...opts,signal:life.signal}),storage=api.store.storage;
 const story=createStoryStore({storage}),world=()=>api.renderer()?.wander;
 let mode='story',items=[],sceneItems=[],clusterIds=null,pins=new Map(),pressed=new Set(),pointer=null,stick={x:0,z:0,run:false},step=0,saveElapsed=0,lastSaved='',mapMode='map',query='',lastNearest='',lastView='',disposed=false;
 try{const saved=JSON.parse(storage?.getItem(POSITION_KEY)||'null');if(saved){if(world())world().walker=new Walker(saved.position);mode=saved.mode==='personal'?'personal':'story';}}catch{}
 const hud=el('section',undefined,'wander-hud');hud.setAttribute('aria-label','星球漫游');hud.innerHTML=`
 <div class="wander-location"><span class="wander-location-dot"></span><span id="wander-location-name">花田入口</span><small>我的星球</small></div>
 <div class="wander-switch" aria-label="记忆空间"><button data-memory-mode="story" aria-pressed="true">故事演示</button><button data-memory-mode="personal" aria-pressed="false">我的记录</button></div>
 <button id="wander-map-button" class="wander-map-button" aria-label="打开记忆地图"><span aria-hidden="true">⌘</span> 记忆地图</button>
 <div id="wander-pins"></div>
 <div class="wander-invitation"><span class="wander-invitation-icon" aria-hidden="true">✦</span><div><small>一段可以走进去的往事</small><button id="wander-start-story">我想留下的，其实是什么？ <span>↗</span></button></div></div>
 <div id="wander-near" hidden><span class="wander-near-icon" aria-hidden="true">◇</span><div><small id="wander-near-kind"></small><strong id="wander-near-title"></strong></div><button id="wander-open-near">回看 <kbd>E</kbd></button></div>
 <div class="wander-key-guide"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 走动</span><span><kbd>⇧</kbd> 奔跑</span><span>拖动看四周</span><button id="wander-sit">坐一会</button></div>
 <div class="wander-mobile"><div id="wander-joystick" role="group" aria-label="移动摇杆"><span></span><i></i></div><button id="wander-mobile-sit" aria-label="坐一会">坐</button><button id="wander-run" aria-label="切换奔跑" aria-pressed="false">跑</button></div>
 <div id="wander-storage-status" role="status" hidden></div>`;
 document.querySelector('#planet-shell').append(hud);
 const map=el('dialog',undefined,'wander-map');map.id='wander-map';map.setAttribute('aria-labelledby','wander-map-title');map.innerHTML=`<div class="wander-map-heading"><div><small>沿着来路，重新发现</small><h2 id="wander-map-title">记忆地图</h2></div><button id="wander-close-map" aria-label="关闭记忆地图">×</button></div><div class="wander-map-tools"><div><button data-map-view="map" aria-pressed="true">地图</button><button data-map-view="list" aria-pressed="false">列表</button></div><label><span aria-hidden="true">⌕</span><input id="wander-search" type="search" aria-label="搜索记忆地图" placeholder="找一段往事"></label></div><div class="wander-map-layout"><div id="wander-map-drawing"></div><div id="wander-map-list"></div></div><footer><span id="wander-map-count"></span><button id="wander-all-memories" hidden>全部记忆</button><button id="wander-reset-story">重置这段演示</button><span id="wander-reset-actions" hidden>重新从抵达开始？ <button id="wander-confirm-reset">重新开始</button><button id="wander-cancel-reset">保留</button></span></footer>`;
 document.body.append(map);
 const $=selector=>document.querySelector(selector);
 const storyUI=createStoryUI({store:story,onClose:()=>{if(disposed)return;world()?.walker.stop();navigate('/planet');},onSave:record=>{refresh();world()?.locate(record.id||'living-room-record');audio.cue('save');toast('这段想法，有了自己的位置。');},onExplore:()=>navigate('/world/living-room')});
 const roleNames={cases:'花田小径 · 参与过的问题',records:'树下长椅 · 一次对话',opinions:'山脚石廊 · 当时的想法'};
 function actualItems(){const index=buildHistory(api.store.data,api.catalog);return Object.values(index).flat().map(i=>({...i,recordId:i.id,id:`personal:${i.kind}:${i.topicId}:${i.id}`,summary:i.note||i.body||i.topicTitle,demo:false}));}
 function refresh(){
  if(disposed)return;const saved=story.memoryItems();items=mode==='story'?[...saved,...(saved.some(i=>i.id==='living-room-record')?[]:[{id:'living-room',kind:'opinions',title:'没有电视，客厅好像也没必要。',summary:'我想留下的，其实是什么？',topicId:'living-room',demo:true,main:true}])]:actualItems();
  sceneItems=memoryLayout(items);world()?.setMemories(sceneItems);for(const [id,pin] of pins)if(!sceneItems.some(i=>i.id===id)){pin.remove();pins.delete(id);}
  sceneItems.forEach((item,i)=>{if(pins.has(item.id))return;const b=el('button',undefined,'wander-pin');b.dataset.memoryId=item.id;b.setAttribute('aria-label','查看记忆：'+item.title);b.append(el('span',item.cluster?String(item.members.length):item.main?'✦':String(i+1).padStart(2,'0')),el('em',item.title));listen(b,'click',()=>{const p=memoryPosition(item),w=world()?.walker;if(!w||Math.hypot(w.x-p.x,w.z-p.z)<3.5)openItem(item);else world().goTo(p);});$('#wander-pins').append(b);pins.set(item.id,b);});
  hud.querySelector('.wander-invitation').hidden=mode!=='story';$('#wander-reset-story').hidden=mode!=='story';hud.querySelectorAll('[data-memory-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.memoryMode===mode)));if(map.open)renderMap();
 }
 function openItem(item){if(!item)return;if(item.cluster){clusterIds=new Set(item.members.map(i=>i.id));mapMode='list';query='';$('#wander-search').value='';navigate('/planet/map');return;}world()?.walker.stop();pressed.clear();stick.x=stick.z=0;if(map.open)map.close();if(item.demo)navigate('/planet/story/'+encodeURIComponent(item.id));else navigate('/planet/'+item.kind+'/'+encodeURIComponent(item.recordId));}
 function positionSave(){if(disposed)return;const value=JSON.stringify({version:1,mode,position:world()?.walker.snapshot()});if(value===lastSaved)return;try{storage?.setItem(POSITION_KEY,value);lastSaved=value;}catch{const s=$('#wander-storage-status');s.textContent='位置暂未保存';s.hidden=false;}}
 function renderMap(){
  const list=$('#wander-map-list'),drawing=$('#wander-map-drawing');list.replaceChildren();drawing.replaceChildren();map.dataset.layout=mapMode;map.querySelectorAll('[data-map-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapView===mapMode)));$('#wander-map-title').textContent=mode==='story'?'故事里的来路':'我的记忆地图';
  const filtered=items.filter(i=>(!clusterIds||clusterIds.has(i.id))&&[i.title,i.summary,i.topicTitle].join(' ').includes(query));$('#wander-all-memories').hidden=!clusterIds;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 400 400');svg.setAttribute('aria-hidden','true');svg.innerHTML='<defs><radialGradient id="island-fill"><stop stop-color="#f7e9bd"/><stop offset="1" stop-color="#ced9b1"/></radialGradient></defs><circle cx="200" cy="200" r="180" fill="url(#island-fill)"/><path d="M200 310 C145 270 77 263 95 174 C116 88 269 63 308 165 C337 261 252 320 200 310 M200 311 Q210 220 200 101 M96 192 Q195 179 307 182" fill="none" stroke="#fff8e4" stroke-width="10" stroke-linecap="round"/><g fill="#a8b791"><circle cx="105" cy="107" r="14"/><circle cx="84" cy="129" r="10"/><circle cx="306" cy="116" r="15"/><circle cx="333" cy="150" r="19"/><circle cx="300" cy="92" r="11"/></g><g fill="#7b8976" font-size="11" text-anchor="middle"><text x="106" y="221">花田小径</text><text x="296" y="218">树下长椅</text><text x="201" y="71">山脚石廊</text></g>';
  drawing.append(svg);
  function dot(id,p,text,cls,callback){const b=el('button',text,cls);b.style.left=(50+p.x*.94)+'%';b.style.top=(50+(p.z+8)*.94)+'%';b.title=id;if(callback)listen(b,'click',callback);drawing.append(b);}
  for(const [i,item] of filtered.entries()){
   if(filtered.length<=30)dot(item.title,memoryPosition(item),item.main?'✦':String(i+1),'wander-map-dot',()=>{const target=list.querySelector(`[data-index="${i}"]`);target?.scrollIntoView({block:'nearest'});target?.querySelector('button')?.focus();});
   const row=el('article',undefined,'wander-map-row');row.dataset.index=i;row.append(el('small',roleNames[item.kind]),el('h3',item.title),el('p',item.summary||item.topicTitle));const actions=el('div');const locate=el('button','去这里 ↗'),read=el('button','打开');listen(locate,'click',()=>{map.close();world()?.locate(item.id,item);navigate('/planet');positionSave();});listen(read,'click',()=>openItem(item));actions.append(locate,read);row.append(actions);list.append(row);
  }
  if(filtered.length>30)for(const cluster of memoryLayout(filtered))dot(cluster.title,memoryPosition(cluster),String(cluster.members?.length||1),'wander-map-dot',()=>openItem(cluster));
  const w=world()?.walker;if(w)dot('我在这里',w,'●','wander-map-me');if(!filtered.length)list.append(el('p',query?'没有找到这段往事。':'从一个想法开始，世界会慢慢留下你的来路。','wander-map-empty'));$('#wander-map-count').textContent=`${mode==='story'?'故事演示':'我的记录'} · ${filtered.length} 处记忆`;
 }
 function openMap(){world()?.walker.stop();pressed.clear();renderMap();if(!map.open)map.showModal();$('#wander-close-map').focus();}
 for(const b of hud.querySelectorAll('[data-memory-mode]'))listen(b,'click',()=>{mode=b.dataset.memoryMode;clusterIds=null;refresh();positionSave();});
 for(const b of map.querySelectorAll('[data-map-view]'))listen(b,'click',()=>{mapMode=b.dataset.mapView;renderMap();});
 listen($('#wander-map-button'),'click',()=>{clusterIds=null;navigate('/planet/map');});listen($('#wander-all-memories'),'click',()=>{clusterIds=null;renderMap();});listen($('#wander-close-map'),'click',()=>{map.close();navigate('/planet');});listen(map,'cancel',()=>navigate('/planet'));listen($('#wander-search'),'input',e=>{query=e.target.value.trim();renderMap();});
 listen($('#wander-start-story'),'click',()=>navigate('/planet/story/living-room'));
 listen($('#wander-open-near'),'click',()=>openItem(world()?.nearest?.item));
 for(const selector of ['#wander-sit','#wander-mobile-sit'])listen($(selector),'click',()=>{world()?.sit();pressed.clear();});
 listen($('#wander-reset-story'),'click',()=>{$('#wander-reset-actions').hidden=false;$('#wander-reset-story').hidden=true;});listen($('#wander-cancel-reset'),'click',()=>{$('#wander-reset-actions').hidden=true;$('#wander-reset-story').hidden=false;});listen($('#wander-confirm-reset'),'click',()=>{const result=story.reset();if(result.ok){$('#wander-reset-actions').hidden=true;$('#wander-reset-story').hidden=false;refresh();toast('故事回到了最初。');}else toast(result.error||'演示重置未保存');});
 const isBlocked=()=>view()!=='planet'||map.open||storyUI.isOpen()||document.body.dataset.reading==='true'||!$('#sound-panel').hidden;
 const controls=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright','shift','e']);
 listen(document,'keydown',e=>{const key=e.key.toLowerCase();if(isBlocked()||e.target.closest('input,textarea,select,[contenteditable="true"]')||!controls.has(key))return;e.preventDefault();if(key==='e'&&!e.repeat){openItem(world()?.nearest?.item);return;}pressed.add(key);audio.unlock();});
 listen(document,'keyup',e=>pressed.delete(e.key.toLowerCase()));
 function stop(){pressed.clear();pointer=null;stick.x=stick.z=0;world()?.walker.stop();positionSave();}
 listen(window,'blur',stop);listen(document,'visibilitychange',()=>{if(document.hidden)stop();});
 const canvas=document.querySelector('#universe');listen(canvas,'pointerdown',e=>{if(isBlocked()||e.button!==0)return;e.preventDefault();pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);audio.unlock();});
 listen(canvas,'pointermove',e=>{if(!pointer||pointer.id!==e.pointerId||isBlocked())return;const dx=e.clientX-pointer.lastX,dy=e.clientY-pointer.lastY;if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>5)pointer.moved=true;if(pointer.moved&&world()){world().walker.yaw-=dx*.005;world().walker.pitch=Math.min(.75,Math.max(.05,world().walker.pitch+dy*.003));}pointer.lastX=e.clientX;pointer.lastY=e.clientY;});
 listen(canvas,'pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const p=pointer;pointer=null;if(!p.moved&&!isBlocked()){const hit=world()?.pick(e.clientX,e.clientY);if(hit?.memory&&world()?.nearest?.item.id===hit.memory)openItem(world().nearest.item);else if(hit?.position)world()?.goTo(hit.position);}positionSave();});listen(canvas,'pointercancel',()=>{pointer=null;});
 const joystick=$('#wander-joystick');let joyId=null;function joy(e){const r=joystick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),d=Math.max(30,Math.hypot(dx,dy));stick.x=dx/d;stick.z=dy/d;joystick.querySelector('i').style.transform=`translate(${stick.x*27}px,${stick.z*27}px)`;}
 listen(joystick,'pointerdown',e=>{if(isBlocked())return;e.preventDefault();joyId=e.pointerId;joystick.setPointerCapture(joyId);joy(e);audio.unlock();});listen(joystick,'pointermove',e=>{if(e.pointerId===joyId)joy(e);});for(const event of ['pointerup','pointercancel'])listen(joystick,event,()=>{joyId=null;stick.x=stick.z=0;joystick.querySelector('i').style.transform='';positionSave();});listen($('#wander-run'),'click',e=>{stick.run=!stick.run;e.currentTarget.setAttribute('aria-pressed',String(stick.run));});
 const unsubscribe=story.subscribe(state=>{refresh();if(storyUI.isOpen()&&view()==='planet'){const path='/planet/story/'+encodeURIComponent(state.activeMemoryId||'living-room');if(location.hash!=='#'+path)navigate(path);}}),unreal=api.store.subscribe(refresh);refresh();
 return{
  route(route){if(disposed)return;if(route.view!=='planet'){if(map.open)map.close();if(storyUI.isOpen())storyUI.close({silent:true});stop();return;}if(route.storyId){mode='story';refresh();storyUI.open(route.storyId);if(map.open)map.close();}else if(route.overlay==='map')openMap();else{if(map.open)map.close();if(storyUI.isOpen())storyUI.close({silent:true});if(route.section){mode='personal';refresh();const item=items.find(i=>i.kind===route.section&&i.recordId===route.itemId);if(item&&lastView!=='planet'){world()?.locate(item.id,item);positionSave();}}}},
  start(){return navigate('/planet/story/living-room');},
  frame(dt){if(disposed)return;hud.hidden=view()!=='planet';const w=world();if(!w)return;const blocked=isBlocked();w.blocked=blocked;if(view()==='planet'&&audio.scene!==(blocked?'reading':'planet'))audio.setScene(blocked?'reading':'planet');w.keys={x:(pressed.has('d')||pressed.has('arrowright')?1:0)-(pressed.has('a')||pressed.has('arrowleft')?1:0)+stick.x,z:(pressed.has('s')||pressed.has('arrowdown')?1:0)-(pressed.has('w')||pressed.has('arrowup')?1:0)+stick.z,run:pressed.has('shift')||stick.run};
   if(lastView!==view()){w.walker.stop();pressed.clear();if(lastView==='world')w.lastView=null;lastView=view();}if(view()!=='planet')return;
   const near=w.nearest?.item;$('#wander-near').hidden=!near||blocked;hud.querySelector('.wander-invitation').hidden=mode!=='story'||!!near||blocked;
   if(near&&lastNearest!==near.id){lastNearest=near.id;$('#wander-near-title').textContent=near.title;$('#wander-near-kind').textContent=near.main?'一段新的故事':roleNames[near.kind];}
   for(const item of sceneItems){const b=pins.get(item.id),p=memoryPosition(item),screen=w.project(p);b.hidden=blocked||!screen.visible||Math.hypot(w.walker.x-p.x,w.walker.z-p.z)>32;if(!b.hidden){b.style.transform=`translate(${screen.x.toFixed(1)}px,${screen.y.toFixed(1)}px) translate(-50%,-50%)`;b.classList.toggle('is-near',near?.id===item.id);}}
   let area='花田入口',distance=15;for(const a of Object.values(AREAS)){const d=Math.hypot(w.walker.x-a.x,w.walker.z-a.z);if(d<distance){area=a.label;distance=d;}}if($('#wander-location-name').textContent!==area)$('#wander-location-name').textContent=area;
   $('#wander-sit').textContent=w.walker.pose==='sit'?'站起来':'坐一会';if(w.walker.speed>.1&&!blocked){step+=w.walker.speed*dt;if(step>.85){step=0;audio.cue('step',{strength:pathDistance(w.walker.x,w.walker.z)<2?.35:.18});}saveElapsed+=dt;if(saveElapsed>.8){positionSave();saveElapsed=0;}}
  },
  debug(){return{mode,items:items.map(i=>({id:i.id,kind:i.kind,position:memoryPosition(i)})),story:story.getState(),map:map.open};},
  dispose(){positionSave();disposed=true;life.abort();unsubscribe();unreal();storyUI.dispose();hud.remove();map.remove();}
 };
}
