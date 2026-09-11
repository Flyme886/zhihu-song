import {loadCatalog,loadAnswers,styleAnswers} from './answers.js';
import {SessionStore,LatestRequest,eggAvailable} from './session.js';
import {setupRecords} from './records.js';
import {setupPlanet} from './planet-ui.js';
import {captureSource} from './history.js';
let planetUI=null;
const catalog=await loadCatalog();
let storage;try{storage=localStorage;}catch{}
const store=new SessionStore(storage,text=>{const el=document.querySelector('#storage-warning');el.hidden=false;el.textContent=text;});
let currentTopic=catalog[0],example=currentTopic.example,topic=currentTopic.title,answers=[];
const loads=new LatestRequest();let switching=false,topicReady=false,filter='all',pendingCondition='',loadInfo={};
let ParticleWorld;try{({ParticleWorld}=await import('./particles.js'));}catch(error){console.warn('3D renderer unavailable',error);}
import {Relationships} from './relationship-ui.js';
const $=s=>document.querySelector(s),app=$('#app'),canvas=$('#universe'),layer=$('#node-layer');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const nodes=[{id:'me',title:'我',author:'我',sourceKind:'personal',source:'我的输入',body:'',x:0,y:0,r:80,tint:[1,1,1],color:'#d7eaff',offset:0}];
function mountNodes(){layer.replaceChildren();for(const [i,n] of nodes.entries()){n.time=3+i*.77;n.dx=0;n.dy=0;n.sx=0;n.sy=0;n.sr=0;n.el=document.createElement('button');n.el.className='node'+(i===0?' mine':'');n.el.dataset.node=n.id;n.el.setAttribute('aria-label',i===0?'我的星球，查看历史观点与讨论':n.title+'，查看观点');n.el.tabIndex=0;n.label=document.createElement('span');n.label.className='node-label';n.label.textContent=n.title;n.el.append(n.label);layer.append(n.el);n.el.addEventListener('click',e=>{if(performance.now()<suppressClick)return;e.stopPropagation();if(n.id==='me'&&planetUI){planetUI.enter();return;}if(e.detail===0){openDetail(n);return;}if(lastPointerType==='touch'&&hovered!==n){showHover(n);return;}openDetail(n);});n.el.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'&&stage==='world'&&!drag)showHover(n);});n.el.addEventListener('pointerleave',()=>scheduleHide());n.el.addEventListener('focus',()=>{if(stage==='world')showHover(n);});}}
let renderer;try{if(!ParticleWorld)throw Error('3D unavailable');renderer=new ParticleWorld(canvas);}catch(e){document.body.dataset.renderer='fallback';$('#fallback').hidden=false;$('#fallback').textContent='已切换为轻量景观，所有记忆与操作仍可使用。';console.warn(e.message);}
let width=innerWidth,height=innerHeight,base=1,stage='world',transitionStart=0,pan={x:0,y:0},zoom=1,targetZoom=1;
let clock=0,last=performance.now(),paused=reduced,visible=true,raf=0,drag=null,suppressClick=0,lastPointerType='mouse',hovered=null,hoverTimer=0,selected=null,query='',cameraTween=null,nearest=null;
const pointers=new Map();let pinch=null;const me=nodes[0];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
let approachFrame=0, savedCamera=null;
function stopMovement(){if(approachFrame)cancelAnimationFrame(approachFrame);approachFrame=0;drag=null;pointers.clear();pinch=null;}
const relations=new Relationships({me,nodes,app,detail:openDetail,hideHover,stopMovement,topic:()=>currentTopic,changed:persist,event:discoverEgg,saveRecord, takePending(){const text=pendingCondition;pendingCondition='';return text;},
  frameDiscussion(target,source=me){
    savedCamera??={pan:{...pan},zoom:targetZoom};
    const involved=[source,target];
    const bounds={left:Math.min(...involved.map(n=>n.x-n.r)),right:Math.max(...involved.map(n=>n.x+n.r)),top:Math.min(...involved.map(n=>n.y-n.r)),bottom:Math.max(...involved.map(n=>n.y+n.r))};
    const mid={x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
    const side=innerWidth>1200;const available=side?width-$('#discussion').getBoundingClientRect().width:width;
    const availableHeight=side?height-180:height*.3-50;
    const fit=Math.min(1,(available-40)/(bounds.right-bounds.left)/base,availableHeight/(bounds.bottom-bounds.top)/base);
    targetZoom=clamp(fit,.3,1);
    const cy=side?height/2:60+availableHeight/2;
    cameraTween={from:{...pan},to:{x:-mid.x+(available/2-width/2)/(base*targetZoom),y:-mid.y+(cy-height/2)/(base*targetZoom)},start:performance.now()};
  },
  restoreCamera(){if(savedCamera){targetZoom=savedCamera.zoom;cameraTween={from:{...pan},to:savedCamera.pan,start:performance.now()};savedCamera=null;}}
});
const travelProgress=now=>stage==='input'?0:stage==='world'?1:smooth((now-transitionStart)/(reduced?50:3400));
function resize(){width=app.clientWidth;height=app.clientHeight;base=clamp(Math.min(width/1000,height/850),.40,1.25);renderer?.resize(width,height);hideHover();if(relations.discussion)relations.api.frameDiscussion(relations.discussion.target,relations.discussion.source);draw(performance.now(),0);}
const ro=new ResizeObserver(resize);ro.observe(app);
function draw(now,dt,elapsed=dt){if(planetUI?.frame(elapsed))return;const p=travelProgress(now);if(stage==='travel'&&p>=1){stage='world';app.dataset.stage='world';nodes.forEach(n=>n.el.tabIndex=0);$('#announcer').textContent='已进入思想世界。可拖动画布、缩放，或选择星球阅读观点。';}
  if(cameraTween){const f=smooth((now-cameraTween.start)/800);pan.x=lerp(cameraTween.from.x,cameraTween.to.x,f);pan.y=lerp(cameraTween.from.y,cameraTween.to.y,f);if(f===1)cameraTween=null;}
  zoom=lerp(zoom,targetZoom,1-Math.exp(-dt*10));if(Math.abs(zoom-targetZoom)<.0005)zoom=targetZoom;
  const radiusIn=Math.min(188,width*.25,height*.225),inputY=height*(height<690&&width>600?.275:.325);
  const scale=base*zoom,travelScale=lerp(3.6,1,p);const centerX=width*.5,centerY=lerp(inputY,height*.5,p);
  if(stage==='world')relations.tick(dt,paused,drag?.kind==='star'?drag.node:null);
  const render=[];nearest=null;let nearDist=Infinity;
  if(stage==='world'){for(const n of nodes.slice(1)){const d=Math.hypot(n.x-me.x,n.y-me.y);const proximity=d-n.r-me.r;if(n!==relations.partner&&proximity<nearDist){nearDist=proximity;nearest=n;}}if(nearDist>90)nearest=null;}
  const responsive=1-Math.exp(-dt*5.8);
  for(const [i,n] of nodes.entries()){
    if(i===0&&!me.body){n.el.style.display='none';continue;}
    const mine=i===0,match=mine||!!relations.discussion||!query||n.title.toLowerCase().includes(query)||n.author.toLowerCase().includes(query)||n.body.toLowerCase().includes(query);
    if(!paused)n.time+=dt*(mine?lerp(1.5,.27,p):.10+i*.008)*(relations.speaking(n)?2.4:1);
    const attracted=n===relations.candidate&&relations.kind(n)==='similar';const vx=me.x-n.x,vy=me.y-n.y,d=Math.max(1,Math.hypot(vx,vy));
    n.dx=lerp(n.dx,attracted?vx/d*18:0,responsive);n.dy=lerp(n.dy,attracted?vy/d*18:0,responsive);
    const driftX=mine||n===relations.partner||relations.discussion?0:Math.sin(clock*.14+i*2.4)*5,driftY=mine||n===relations.partner||relations.discussion?0:Math.cos(clock*.11+i*1.3)*6;
    const x=centerX+(n.x+pan.x+n.dx+driftX)*scale*travelScale*p;
    const y=centerY+(n.y+pan.y+n.dy+driftY)*scale*travelScale*p;
    const r=mine?lerp(radiusIn,n.r*scale,p):n.r*scale*travelScale;
    const participant=relations.discussion&&(n.id===relations.discussion.source.id||n.id===relations.discussion.target.id);
    const opacity=(mine?1:smooth((p-.17)/.7))*(match?1:.12)*(relations.discussion&&!participant? .4:1);
    n.sx=x;n.sy=y;n.sr=r;
    if((mine||p>.17)&&x+r>-15&&x-r<width+15&&y+r>-15&&y-r<height+15){
      render.push({x,y,r,time:n.time,chaos:1,glow:1,offset:n.offset,opacity,tint:n.tint});
      n.el.style.display=stage==='world'?'block':'none';n.el.style.width=2*r+'px';n.el.style.height=2*r+'px';n.el.style.transform=`translate(${x-r}px,${y-r}px)`;n.el.style.opacity=opacity;
      n.label.style.opacity=mine||r>40&&match?'1':'0';
    }else n.el.style.display='none';
  }
  renderer?.render(render);
  if(stage==='world')relations.draw(width,height,scale);
  $('#zoom-value').textContent=Math.round(zoom*100)+'%';
  if(stage==='world')$('#hint').textContent=relations.partner?'两颗星球，各自完整，一起前行':relations.candidate?'相似的观点结伴，不同的观点对话':'拖动你的星球，发现思想之间的关系';
}
function loop(now){raf=0;if(!visible||document.hidden)return;const elapsed=Math.max(0,(now-last)/1000),dt=Math.min(elapsed,.1);last=now;if(!paused)clock+=dt;draw(now,dt,elapsed);raf=requestAnimationFrame(loop);}
function start(){if(!raf&&visible&&!document.hidden){last=performance.now();raf=requestAnimationFrame(loop);}}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&raf){cancelAnimationFrame(raf);raf=0;}else start();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer=null;document.body.dataset.renderer='fallback';$('#fallback').hidden=false;$('#fallback').textContent='已切换为轻量景观，所有记忆与操作仍可使用。';});
function enterWorld(text){
 const value=String(text).trim();if(!value||value.length>3000)return;
 me.body=value;me.claim=value;me.topicId=currentTopic.id;me.question='这个判断适用于哪些条件？';
 store.addOpinion(currentTopic.id,value);planetUI?.onSave();relations.setInput(value,example);relations.refreshPicker();app.dataset.composing='false';$('#compose').textContent='＋ 补充我的想法';persist();
}
$('#knowledge').addEventListener('input',()=>{$('#enter').disabled=!$('#knowledge').value.trim();persist();});
$('#knowledge-form').addEventListener('submit',e=>{e.preventDefault();enterWorld($('#knowledge').value);});
$('#try-example').addEventListener('click',()=>{$('#knowledge').value=example;$('#enter').disabled=false;persist();});
$('#compose').addEventListener('click',()=>{app.dataset.composing='true';$('#knowledge').focus();});
$('#close-composer').addEventListener('click',()=>{app.dataset.composing='false';persist();});
function hideHover(){clearTimeout(hoverTimer);hovered=null;$('#hover-card').hidden=true;}
function scheduleHide(){clearTimeout(hoverTimer);hoverTimer=setTimeout(hideHover,180);}
function showHover(n){
 if(n===me){hideHover();return;}
 if(stage!=='world'||$('#detail').open||$('#agent-picker').open||relations.discussion||drag)return;
 clearTimeout(hoverTimer);hovered=n;const card=$('#hover-card');
 card.style.setProperty('--planet-color',n.color);card.querySelector('h2').textContent=n===me?'我的观点':(n.questionTitle||topic);
 $('#answer-text').textContent=n.body;$('#answer-text').setAttribute('aria-label',n.sourceKind==='zhihu'?'知乎回答摘要，可滚动':'观点内容，可滚动');$('#answer-text').scrollTop=0;
 $('#answer-author').textContent=n.author;$('#answer-bio').textContent=n.bio||'这颗星球由你写下';
 $('#answer-avatar').hidden=!n.avatar;$('#avatar-fallback').hidden=!!n.avatar;$('#avatar-fallback').textContent=n.author.slice(0,1);
 if(n.avatar){$('#answer-avatar').src=n.avatar;$('#answer-avatar').alt=n.author+'的头像';}
 $('#hover-card .zhihu-logo').hidden=n.sourceKind!=='zhihu';$('#answer-source').textContent=n.source||'我的输入';$('#answer-context').textContent=n.context||'';$('#answer-context').hidden=!n.context;
 $('#answer-link').hidden=!n.url;if(n.url)$('#answer-link').href=n.url;
 $('#answer-date').textContent=n.url?`摘要 · ${n.captured||'本次'} 核对`:n===me?'个人输入 · 本机保存':'案例策划';
 card.hidden=false;const cardWidth=Math.min(306,width-28,(height-110)*9/16),cardHeight=cardWidth*16/9;
 card.style.width=cardWidth+'px';const right=n.sx+n.sr+18;
 card.style.left=clamp(right+cardWidth<width-14?right:n.sx-n.sr-cardWidth-18,14,width-cardWidth-14)+'px';
 card.style.top=clamp(n.sy-cardHeight*.35,78,height-cardHeight-14)+'px';
}
$('#answer-avatar').addEventListener('error',()=>{$('#answer-avatar').hidden=true;$('#avatar-fallback').hidden=false;});
$('#close-hover').addEventListener('click',hideHover);
$('#hover-debate').addEventListener('click',()=>{if(hovered)relations.chooseAgents(hovered);});
$('#start-agents').addEventListener('click',()=>relations.chooseAgents());
$('#hover-card').addEventListener('pointerenter',()=>clearTimeout(hoverTimer));$('#hover-card').addEventListener('pointerleave',scheduleHide);$('#expand-hover').addEventListener('click',()=>{if(hovered)openDetail(hovered);});
function openDetail(n){if(relations.discussion)return;markRead(n); stopMovement();selected=n;relations.configureDetail(n);hideHover();$('#detail-type').textContent=n===me?'我的星球':n.source;$('#detail-title').textContent=n===me?'我的知识':n.title;$('#detail-body').textContent=n.body;$('#detail-meta').textContent=n===me?'本机保存的个人输入':`${n.sourceKind==='zhihu'?'答主':'讨论视角'}：${n.author} · ${n.context||'请核对完整上下文'}`;$('#approach').hidden=n===me||n===relations.partner;$('#edit-knowledge').hidden=n!==me;$('#edit-form').hidden=true;$('#detail-pair').hidden=n===me;$('#detail-pair').disabled=!me.body;$('#detail-pair').textContent=me.body?'确认相近并结伴':'先写下我的想法，再结伴';$('#detail-debate').hidden=n===me;if(!$('#detail').open)$('#detail').showModal();}
$('#close-detail').addEventListener('click',()=>$('#detail').close());$('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#profile').textContent='我的星球';$('#profile').setAttribute('aria-label','进入我的星球');$('#profile').addEventListener('click',()=>planetUI?.enter());
$('#edit-knowledge').addEventListener('click',()=>{$('#edit-form').hidden=false;$('#edit-text').value=me.body;$('#edit-text').focus();});
$('#edit-form').addEventListener('submit',e=>{e.preventDefault();const value=$('#edit-text').value.trim();if(!value){$('#edit-text').setCustomValidity('请保留至少一句知识或观点');$('#edit-text').reportValidity();return;}me.body=value;me.claim=value;store.addOpinion(currentTopic.id,value);planetUI?.onSave();relations.setInput(value,example);$('#detail-body').textContent=value;$('#edit-form').hidden=true;$('#announcer').textContent='我的知识已更新';$('#knowledge').value=value;relations.refreshPicker();persist();});
$('#edit-text').addEventListener('input',()=>$('#edit-text').setCustomValidity(''));
function recenter(){hideHover();targetZoom=1;cameraTween={from:{...pan},to:{x:-me.x,y:-me.y},start:performance.now()};}
$('#home').setAttribute('aria-label','返回宇宙首页');$('#home').addEventListener('click',()=>planetUI?.navigate('/home'));$('#recenter').addEventListener('click',recenter);
function setZoom(value){targetZoom=clamp(value,.45,2.2);hideHover();}
$('#zoom-in').addEventListener('click',()=>setZoom(targetZoom*1.2));$('#zoom-out').addEventListener('click',()=>setZoom(targetZoom/1.2));
function pauseState(){const b=$('#pause');b.textContent=paused?'▷':'Ⅱ';b.setAttribute('aria-label',paused?'播放动画':'暂停动画');b.setAttribute('aria-pressed',String(paused));app.dataset.paused=String(paused);}pauseState();$('#pause').addEventListener('click',()=>{paused=!paused;pauseState();planetUI?.setPaused(paused);});
function zoomAt(newZoom,x,y){const rect=app.getBoundingClientRect();x-=rect.left;y-=rect.top;const before=zoom;newZoom=clamp(newZoom,.45,2.2);pan.x+=(x-width/2)/base*(1/newZoom-1/before);pan.y+=(y-height/2)/base*(1/newZoom-1/before);zoom=targetZoom=newZoom;cameraTween=null;hideHover();}
app.addEventListener('wheel',e=>{if(planetUI?.view!=='world'||stage!=='world'||!e.target.closest('#universe,#node-layer,.node'))return;e.preventDefault();zoomAt(zoom*Math.exp(-clamp(e.deltaY,-100,100)*.0015),e.clientX,e.clientY);},{passive:false});
app.addEventListener('pointerdown',e=>{if(planetUI?.view!=='world'||stage!=='world'||!e.target.closest('#universe,.node'))return;if(e.button!==0)return;suppressClick=0;if(approachFrame)cancelAnimationFrame(approachFrame);approachFrame=0;lastPointerType=e.pointerType;const node=nodes.find(n=>n.el===e.target.closest('.node'));pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});e.target.setPointerCapture(e.pointerId);if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom,mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};drag=null;hideHover();return;}drag={id:e.pointerId,kind:node===me||node===relations.partner?'star':node?'click':'pan',node,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};cameraTween=null;});
app.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2&&pinch){const [a,b]=[...pointers.values()],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;zoomAt(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance),mx,my);pan.x+=(mx-pinch.mid.x)/(base*zoom);pan.y+=(my-pinch.mid.y)/(base*zoom);pinch.mid={x:mx,y:my};suppressClick=performance.now()+500;return;}if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;if(drag.moved){hideHover();canvas.style.cursor='grabbing';if(drag.kind==='star'){drag.node.x+=dx/(base*zoom);drag.node.y+=dy/(base*zoom);}else if(drag.kind==='pan'){pan.x+=dx/(base*zoom);pan.y+=dy/(base*zoom);}}drag.lastX=e.clientX;drag.lastY=e.clientY;});
function pointerEnd(e){pointers.delete(e.pointerId);if(pinch){pinch=null;drag=null;suppressClick=performance.now()+400;}if(drag?.id===e.pointerId){if(drag.moved){suppressClick=performance.now()+400;if(drag.kind==='star'&&nearest)$('#announcer').textContent=`已靠近${nearest.title}，可以查看观点`; }else if(drag.kind==='pan')hideHover();drag=null;}canvas.style.cursor='grab';relations.released();}
app.addEventListener('pointerup',pointerEnd);app.addEventListener('pointercancel',pointerEnd);
$('#approach').addEventListener('click',()=>{
  if(!selected||selected===me)return;
  stopMovement();const target=selected;$('#detail').close();
  const distance=target.r+me.r+42,dx=me.x-target.x,dy=me.y-target.y,len=Math.hypot(dx,dy)||1;
  const from={x:me.x,y:me.y},to={x:target.x+(dx/len||-1)*distance,y:target.y+dy/len*distance};
  const began=performance.now();
  const move=now=>{const p=smooth((now-began)/(reduced?1:1100));me.x=lerp(from.x,to.x,p);me.y=lerp(from.y,to.y,p);
    if(p<1)approachFrame=requestAnimationFrame(move);else{approachFrame=0;relations.released();recenter();}};
  approachFrame=requestAnimationFrame(move);
});
function search(value){query=value.trim().toLowerCase();const results=$('#search-results');results.replaceChildren();results.hidden=!query;if(!query)return;const matches=nodes.filter(n=>n.title.toLowerCase().includes(query)||n.author.toLowerCase().includes(query)||n.body.toLowerCase().includes(query));if(!matches.length){const p=document.createElement('p');p.textContent='没有找到相关观点';results.append(p);}for(const n of matches){const b=document.createElement('button');b.textContent=n===me?'我的知识':n.title;b.addEventListener('click',()=>{cameraTween={from:{...pan},to:{x:-n.x,y:-n.y},start:performance.now()};openDetail(n);results.hidden=true;});results.append(b);}}
$('#search').addEventListener('input',e=>search(e.target.value));$('#search').addEventListener('focus',()=>{if(query)$('#search-results').hidden=false;});$('#search').addEventListener('keydown',e=>{if(e.key==='Enter')$('#search-results button')?.click();if(e.key==='Escape'){$('#search').value='';search('');$('#search').blur();}});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.search-wrap'))$('#search-results').hidden=true;});
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea')||$('#detail').open||$('#agent-picker').open||relations.discussion)return;if(stage!=='world'||planetUI?.view!=='world')return;if(e.altKey&&e.target.matches('.node')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){const node=nodes.find(n=>n.el===e.target);if(node===me||node===relations.partner){e.preventDefault();node.x+=e.key==='ArrowLeft'?-24:e.key==='ArrowRight'?24:0;node.y+=e.key==='ArrowUp'?-24:e.key==='ArrowDown'?24:0;relations.released();}return;}if(e.key==='/'){e.preventDefault();$('#search').focus();}if(e.key==='Escape')hideHover();if(e.key==='+'||e.key==='=')setZoom(targetZoom*1.2);if(e.key==='-')setZoom(targetZoom/1.2);if(e.key==='Home'){e.preventDefault();recenter();}if(e.target===document.body&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();pan.x+=e.key==='ArrowLeft'?70:e.key==='ArrowRight'?-70:0;pan.y+=e.key==='ArrowUp'?70:e.key==='ArrowDown'?-70:0;}});

function persist(){
 if(switching||!topicReady)return;
 const old=store.get(currentTopic.id);
 const patch={title:currentTopic.title,draft:$('#knowledge').value,input:me.body,overrides:[...relations.overrides],partner:relations.partner?.id||null,positions:nodes.map(n=>({id:n.id,x:n.x,y:n.y})),camera:{pan:{...pan},zoom:targetZoom}};
 if(relations.discussion&&!relations.discussion.saved)patch.discussion={...relations.snapshot(),hostDraft:$('#interrupt-text').value};
 store.update(currentTopic.id,patch);renderTopics();$('#resume-discussion').hidden=!old.discussion||!!relations.discussion;
}
function saveRecord(record){store.addRecord(currentTopic.id,record);if(record.note&&record.change!=='keep'){store.addOpinion(currentTopic.id,record.note);me.body=record.note;me.claim=record.note;$('#knowledge').value=record.note;}planetUI?.onSave();store.update(currentTopic.id,{discussion:null});renderTopics();$('#resume-discussion').hidden=true;}
function markRead(n){if(n===me)return;captureSource(store,currentTopic.id,n);const state=store.get(currentTopic.id);if(!state.read.includes(n.id)){state.read.push(n.id);store.save();renderTopics();}}
function renderTopics(){
 const list=$('#topic-list'),q=$('#topic-search').value.trim().toLowerCase();list.replaceChildren();
 catalog.forEach((t,i)=>{if(filter!=='all'&&t.group!==filter||q&&!`${t.title} ${t.shortTitle}`.toLowerCase().includes(q))return;
   const state=store.get(t.id),button=document.createElement('button');button.className='topic-row';button.dataset.topic=t.id;button.setAttribute('aria-current',t.id===currentTopic.id?'page':'false');
   const num=document.createElement('span');num.className='topic-number';num.textContent=String(i+1).padStart(2,'0');
   const content=document.createElement('span');content.className='topic-copy';const title=document.createElement('strong');title.textContent=t.shortTitle;
   const meta=document.createElement('small');meta.textContent=`${t.category}${t.group==='hot'?' · 2026-09-11 精选':''} · ${state.records.length?'有讨论记录':state.read.length?'已读 '+state.read.length+' 条':'等你探索'}`;
   content.append(title,meta);button.append(num,content);if(state.records.length){const dot=document.createElement('i');dot.className='record-dot';button.append(dot);}button.addEventListener('click',()=>selectTopic(t.id));list.append(button);
 });
 if(!list.children.length){const p=document.createElement('p');p.className='empty-topics';p.textContent='没有找到这个问题，试试别的关键词。';list.append(p);}
 $('#record-count').textContent=catalog.reduce((sum,t)=>sum+store.get(t.id).records.length,0);
}
function closeTopics(){document.body.dataset.sidebar='closed';$('#sidebar-backdrop').hidden=true;$('#open-topics').setAttribute('aria-expanded','false');$('#topic-sidebar').inert=innerWidth<=900;}
function openTopics(){document.body.dataset.sidebar='open';$('#topic-sidebar').inert=false;$('#sidebar-backdrop').hidden=false;$('#open-topics').setAttribute('aria-expanded','true');$('#topic-search').focus();}
$('#open-topics').addEventListener('click',openTopics);$('#close-topics').addEventListener('click',closeTopics);$('#sidebar-backdrop').addEventListener('click',closeTopics);
addEventListener('resize',()=>{if(innerWidth>900){closeTopics();$('#topic-sidebar').inert=false;}else if(document.body.dataset.sidebar!=='open')$('#topic-sidebar').inert=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.dataset.sidebar==='open'){closeTopics();$('#open-topics').focus();}if(e.key==='Tab'&&document.body.dataset.sidebar==='open'){const elements=[...$('#topic-sidebar').querySelectorAll('button,input,a')].filter(el=>!el.disabled&&el.getClientRects().length);if(e.shiftKey&&document.activeElement===elements[0]){e.preventDefault();elements.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===elements.at(-1)){e.preventDefault();elements[0].focus();}}});
$('#topic-search').addEventListener('input',renderTopics);
for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));renderTopics();});
function populateTopic(){
 topic=currentTopic.title;example=currentTopic.example;$('#world-context h1').textContent=topic;$('#topic-description').textContent=currentTopic.description;
 $('#case-heading').textContent=topic;$('#case-description').textContent=currentTopic.description;$('#case-rules').textContent=currentTopic.rules;
 $('#case-background').replaceChildren();for(const item of currentTopic.background){const a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.title+' ↗';const p=document.createElement('p');p.textContent=item.note;$('#case-background').append(a,p);}
 $('#scenario-prompts').replaceChildren();for(const item of currentTopic.scenarios){const b=document.createElement('button');b.textContent=item.title;b.addEventListener('click',()=>{$('#interrupt-text').value=item.text;$('#interrupt-text').focus();persist();});$('#scenario-prompts').append(b);}
 const real=answers.filter(a=>a.sourceKind==='zhihu').length,label=`${real} 条知乎摘要 · ${answers.length-real} 个策划视角`;
 $('#case-mode').textContent=label;$('#case-status').textContent=label+(loadInfo.error?' · '+loadInfo.error:'');$('#world-mode').textContent='先读一颗星球，再写下你的想法';
 $('#egg-trigger').hidden=!currentTopic.egg||!store.get(currentTopic.id).eggs.includes(currentTopic.egg.id);
 $('#case-egg').hidden=$('#egg-trigger').hidden;if(currentTopic.egg)$('#egg-trigger').textContent=currentTopic.egg.symbol;
 $('#compose').textContent=me.body?'＋ 补充我的想法':'＋ 写下我的想法';
 $('#resume-discussion').hidden=!store.get(currentTopic.id).discussion;
}
async function selectTopic(id,{historyMode='push',force=false}={}){
 const next=catalog.find(t=>t.id===id)||catalog[0];if(historyMode!=='none'&&planetUI){const url=new URL(location.href);url.searchParams.delete('topic');url.hash='/world/'+encodeURIComponent(next.id);history[historyMode==='replace'?'replaceState':'pushState']({},'',url);planetUI.showWorld(next.id);}if(!force&&next.id===currentTopic.id&&nodes.length>1){closeTopics();return;}
 persist();const request=loads.begin();switching=true;stopMovement();relations.reset();
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());hideHover();app.inert=false;app.dataset.composing='false';query='';$('#search').value='';$('#search-results').hidden=true;pendingCondition='';
 currentTopic=next;store.data.lastTopic=next.id;store.save();
 // The scene controller owns hash navigation; topic changes retain their camera.
 const session=store.get(next.id);me.body=session.input||'';me.claim=me.body;me.topicId=next.id;me.x=0;me.y=0;$('#knowledge').value=session.draft||session.input||'';$('#enter').disabled=!$('#knowledge').value.trim();
 answers=styleAnswers(next.answers);loadInfo={};installNodes(session);topicReady=true;populateTopic();renderTopics();closeTopics();switching=false;resize();start();
 const controller=loads.controller;const timeout=setTimeout(()=>controller.abort(),6000);
 try{const data=await loadAnswers(next,request.signal);if(!request.current())return;loadInfo=data;if(data.syncedAt){persist();answers=data.answers;installNodes(store.get(next.id));}populateTopic();}catch{if(request.current())$('#case-status').textContent+=' · 在线缓存读取失败';}finally{clearTimeout(timeout);}
}
function installNodes(session){
 nodes.splice(1,nodes.length-1,...answers);for(const saved of session.positions||[]){const n=nodes.find(n=>n.id===saved.id);if(n&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){n.x=saved.x;n.y=saved.y;}}
 mountNodes();relations.refreshPicker();relations.overrides=new Map(session.overrides||[]);relations.candidate=null;relations.dismissed=null;relations.cardKey='';relations.partner=null;
 const partner=nodes.find(n=>n.id===session.partner);if(partner&&me.body){relations.candidate=partner;relations.overrides.set(partner.id,'similar');relations.act();}
 pan=session.camera?.pan?{...session.camera.pan}:{x:0,y:0};zoom=targetZoom=session.camera?.zoom||1;cameraTween=null;savedCamera=null;
}
$('#open-case').addEventListener('click',()=>$('#case-info').showModal());$('#topic-rules').addEventListener('click',()=>$('#case-info').showModal());$('#close-case').addEventListener('click',()=>$('#case-info').close());
$('#detail-pair').addEventListener('click',()=>{if(!selected||!me.body)return;relations.unlink(false);relations.overrides.set(selected.id,'similar');relations.candidate=selected;relations.act();$('#detail').close();persist();});
$('#detail-debate').addEventListener('click',()=>{$('#detail').close();relations.chooseAgents(selected);});
$('#resume-discussion').addEventListener('click',()=>{const d=store.get(currentTopic.id).discussion;if(d){const record=structuredClone(d);relations.restore(record);$('#interrupt-text').value=record.hostDraft||'';}});
for(const id of ['record-note','record-common','record-change','interrupt-text'])$('#'+id).addEventListener('input',persist);
app.addEventListener('pointerup',persist);
$('#discussion').addEventListener('click',()=>{if(!relations.discussion)persist();});addEventListener('pagehide',persist);// Hash navigation and back/forward are owned by the scene controller.
let syncBusy=false;
$('#sync-zhihu').addEventListener('click',async()=>{
 if(syncBusy)return;syncBusy=true;const id=currentTopic.id,button=$('#sync-zhihu');button.disabled=true;$('#case-status').textContent='正在同步本题材料，最多两次搜索…';
 try{const r=await fetch('/api/zhihu/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topicId:id}),signal:AbortSignal.timeout(120000)});const data=await r.json();if(!r.ok)throw Error(data.error||'同步失败');if(currentTopic.id===id){await selectTopic(id,{historyMode:'replace',force:true});$('#case-info').showModal();$('#case-status').textContent='已更新材料，已有讨论保留当时的来源快照。';}}
 catch(e){if(currentTopic.id===id)$('#case-status').textContent=e.name==='TimeoutError'?'同步等待超时；保留原材料，稍后可查看服务缓存。':e.message;}
 finally{syncBusy=false;button.disabled=false;}
});
fetch('/api/zhihu/status').then(r=>r.json()).then(s=>$('#api-connection').textContent=s.configured?'知乎凭证已配置 · 可手动同步当前问题':'已核对的策展材料可直接阅读；在线同步尚未配置。').catch(()=>$('#api-connection').textContent='在线服务暂不可用，仍可阅读策展材料。');
function discoverEgg(event){if(switching||!eggAvailable(currentTopic,event))return;const state=store.get(currentTopic.id);if(!state.eggs.includes(currentTopic.egg.id)){state.eggs.push(currentTopic.egg.id);store.save();}$('#egg-trigger').textContent=currentTopic.egg.symbol;$('#egg-trigger').hidden=false;$('#case-egg').hidden=false;}
function openEgg(){const egg=currentTopic.egg;if(!egg)return;$('#egg-heading').textContent=egg.title;$('#egg-options').replaceChildren();for(const option of egg.options){const b=document.createElement('button');b.className='enter-button';b.textContent=option.title;b.addEventListener('click',()=>{$('#egg-dialog').close();if(relations.discussion){$('#interrupt-text').value=option.text;$('#interrupt-text').focus();persist();}else{pendingCondition=option.text;$('#case-info').close();relations.chooseAgents();}});$('#egg-options').append(b);}$('#egg-dialog').showModal();}
$('#egg-trigger').addEventListener('click',openEgg);$('#case-egg').addEventListener('click',openEgg);$('#close-egg').addEventListener('click',()=>$('#egg-dialog').close());
$('#scenario-details').addEventListener('toggle',()=>{if($('#scenario-details').open)discoverEgg('prompts');});
document.body.append($('#egg-trigger'));
setupRecords({store,catalog,selectTopic,relations,renderTopics,closeTopics,openArchive:()=>planetUI?.navigate('/planet/records')});
closeTopics();
planetUI=setupPlanet({store,catalog,renderer:()=>renderer,
 loadTopic:id=>selectTopic(id,{historyMode:'none'}),
 setPaused(value){paused=value;pauseState();},
 stop(){visible=false;if(raf)cancelAnimationFrame(raf);raf=0;ro.disconnect();stopMovement();relations.stopAgent();},
 leaveWorld(){persist();stopMovement();hideHover();if(relations.discussion)relations.closeDiscussion();if(cameraTween){pan={...cameraTween.to};cameraTween=null;}zoom=targetZoom;persist();},
 continueRecord(record){const copy=structuredClone(record);copy.id=crypto.randomUUID();copy.finished=false;copy.turn=0;copy.messages=[{who:'材料 A · '+copy.source.author,text:copy.source.body,kind:'note'},{who:'材料 B · '+copy.target.author,text:copy.target.body,kind:'note'}];copy.note='';copy.common='';copy.change='keep';relations.restore(copy);}
});
document.body.append($('#profile'));
// Read-only diagnostics used by the local acceptance checks; no private text exposed.
window.planetDiagnostics=()=>planetUI.debug();
await planetUI.init();resize();start();
