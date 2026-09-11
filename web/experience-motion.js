// Short, interruptible visual feedback. Persistence and relationship decisions
// stay with their existing owners; callers emit only after successful actions.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease='cubic-bezier(.18,.8,.2,1)';

export function createExperienceMotion(enabled=()=>true){
 const active=new Set();
 function run(el,frames,options){
  if(!enabled()||document.hidden||!el?.animate)return null;
  const animation=el.animate(frames,{easing:ease,fill:'both',...options});
  active.add(animation);animation.finished.catch(()=>{}).finally(()=>{active.delete(animation);animation.cancel();});
  return animation;
 }
 function pulse(el){run(el,[{boxShadow:'0 0 0 0 #b5e9ff00'},{boxShadow:'0 0 0 12px #b5e9ff35',offset:.35},{boxShadow:'0 0 0 26px #b5e9ff00'}],{duration:850});}
 function stream(from,to,{color='#d8f4ff',count=12,duration=900,land}={}){
  if(!enabled()||document.hidden){land?.();return Promise.resolve(true);}
  const group=document.createElement('div');group.className='memory-flight';group.setAttribute('aria-hidden','true');document.body.append(group);
  const dx=to.x-from.x,dy=to.y-from.y,arc=Math.min(130,Math.abs(dx)*.25+45);
  let final,resolveFlight;const completed=new Promise(resolve=>{resolveFlight=resolve;});
  for(let i=0;i<count;i++){
   const dot=document.createElement('i');dot.style.setProperty('--flight-color',color);dot.style.width=dot.style.height=(i?2+i%3:7)+'px';group.append(dot);
   const frames=Array.from({length:17},(_,j)=>{const t=j/16,drift=Math.sin(Math.PI*t)*(i-count/2)*1.3;return{transform:`translate(${from.x+dx*t+drift}px,${from.y+dy*t-Math.sin(Math.PI*t)*arc}px) scale(${.5+Math.sin(Math.PI*t)*.5})`,opacity:j===0||j===16?0:i? .6:1,offset:t};});
   const a=run(dot,frames,{duration,delay:i*13,easing:'cubic-bezier(.4,0,.2,1)'});if(i===0)a?.finished.then(()=>{if(!document.hidden)land?.();resolveFlight(true);}).catch(()=>resolveFlight(false));final=a;
  }
  final?.finished.catch(()=>{}).finally(()=>group.remove());if(!final){group.remove();resolveFlight(false);}return completed;
 }
 function clear(){for(const a of active)a.cancel();active.clear();document.querySelectorAll('.memory-flight').forEach(el=>el.remove());}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 return {run,pulse,stream,clear};
}

export function createDetailTransition(dialog,motion){
 let source=null,closing=false,token=0;
 function place(){
  const mobile=innerWidth<=700,rect=document.querySelector('#app').getBoundingClientRect();
  const w=Math.min(mobile?innerWidth-24:500,innerWidth-32);
  const h=Math.min(mobile?innerHeight*.79:innerHeight-140,760);
  const left=mobile?12:clamp((source?.sx||rect.width/2)+rect.left+30,Math.max(16,rect.left+16),innerWidth-w-22);
  const top=mobile?innerHeight-h-12:clamp((source?.sy||innerHeight/2)-h*.35,84,innerHeight-h-24);
  for(const [key,value] of Object.entries({left,top,width:w,height:h}))dialog.style.setProperty('--detail-'+key,value+'px');
  dialog.dataset.presentation='anchored';
 }
 function open(node){
  const switching=dialog.open&&!closing;source=node;closing=false;token++;place();
  dialog.style.setProperty('--planet-color',node.color||'#c5e9fa');
  if(!dialog.open)dialog.showModal();
  const rect=dialog.getBoundingClientRect(),app=document.querySelector('#app').getBoundingClientRect();
  if(switching){motion.run(dialog.querySelector('#detail-body'),[{opacity:.35,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:220});return;}
  const origin={x:app.left+(node.sx||app.width/2),y:app.top+(node.sy||app.height/2)};
  motion.run(dialog,[{opacity:0,transform:`translate(${(origin.x-rect.x-32)*.45}px,${(origin.y-rect.y-50)*.45}px) scale(.84)`},{opacity:1,transform:'none'}],{duration:380});
  const orb=dialog.querySelector('.detail-orbit');
  if(orb){const r=orb.getBoundingClientRect();motion.run(orb,[{transform:`translate(${origin.x-r.x-r.width/2}px,${origin.y-r.y-r.height/2}px) scale(${clamp((node.sr||40)/18,1,4)})`,opacity:.3},{transform:'none',opacity:1}],{duration:480});}
  document.body.dataset.detailReading='true';
 }
 function close({immediate=false}={}){
  if(!dialog.open||closing)return;closing=true;const current=++token;
  const rect=dialog.getBoundingClientRect(),app=document.querySelector('#app').getBoundingClientRect();
  const dx=source?app.left+source.sx-rect.x-32:0,dy=source?app.top+source.sy-rect.y-50:0;
  const a=immediate?null:motion.run(dialog,[{opacity:1,transform:'none'},{opacity:0,transform:`translate(${dx*.15}px,${dy*.15}px) scale(.94)`}],{duration:190});
  const done=()=>{if(current!==token||!dialog.open)return;dialog.close();closing=false;source?.el?.focus({preventScroll:true});};
  if(a)a.finished.then(done).catch(()=>{if(current===token)done();});else done();
 }
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.addEventListener('close',()=>{if(dialog.open)return;token++;closing=false;for(const a of dialog.getAnimations({subtree:true}))a.cancel();document.body.dataset.detailReading='false';});
 window.addEventListener('resize',()=>{if(dialog.open)place();});
 return {open,close};
}

export function setupSpatialPicker({nodes,me,motion,onOpen,onClose}){
 const dialog=document.querySelector('#agent-picker'),slots=['a','b'];let activeSlot='b';
 const $=s=>dialog.querySelector(s);
 function update(){
  for(const slot of slots){const node=nodes.find(n=>n.id===$('#agent-'+slot).value),button=$(`[data-slot="${slot}"]`);button.classList.toggle('active',slot===activeSlot);button.setAttribute('aria-pressed',String(slot===activeSlot));button.style.setProperty('--planet-color',node?.color||'#a1cfe5');button.querySelector('.selection-planet-name').textContent=node?.title||'选择一颗星球';button.setAttribute('aria-label',`选择观点 ${slot.toUpperCase()}，当前${node?.title||'未选择'}`);}
  for(const n of nodes){const slot=slots.find(s=>$('#agent-'+s).value===n.id);if(n.el){if(slot)n.el.dataset.picked='true';else n.el.removeAttribute('data-picked');}if(n.el){n.el.dataset.pickSlot=slot||'';if(dialog.open)n.el.setAttribute('aria-label',`选择${n.title}参与对谈${slot?'，已选为'+slot.toUpperCase():''}`);}}
 }
 function open(){activeSlot='b';dialog.dataset.spatial='true';document.body.dataset.picking='true';$('#picker-settings').open=false;dialog.show();onOpen?.();update();motion.run(dialog,[{opacity:0,transform:'translateY(22px)'},{opacity:1,transform:'none'}],{duration:300});$('#selection-instruction').textContent='点击画布上的星球，换一个对谈对象。';}
 function pick(node){
  if(!dialog.open||!node.body)return false;
  const other=activeSlot==='a'?'b':'a',old=$('#agent-'+activeSlot).value;
  if($('#agent-'+other).value===node.id)$('#agent-'+other).value=old;
  $('#agent-'+activeSlot).value=node.id;activeSlot=other;update();motion.pulse($(`[data-slot="${other==='a'?'b':'a'}"]`));return true;
 }
 for(const slot of slots){$(`[data-slot="${slot}"]`).addEventListener('click',()=>{activeSlot=slot;update();$('#selection-instruction').textContent=`在画布上点选观点 ${slot.toUpperCase()}。`;});$('#agent-'+slot).addEventListener('change',update);}
 dialog.addEventListener('close',()=>{document.body.dataset.picking='false';for(const n of nodes){n.el?.removeAttribute('data-picked');n.el?.removeAttribute('data-pick-slot');n.el?.setAttribute('aria-label',n===me?'我的星球，查看历史观点与讨论':n.title+'，查看观点');}onClose?.();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog.open){e.preventDefault();dialog.close();}});
 return {open,pick,update,get active(){return dialog.open;}};
}
