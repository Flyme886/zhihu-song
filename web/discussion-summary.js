import {SUMMARY_GROUPS,taskRequest,providerFor} from './thought-client.js';
const $=s=>document.querySelector(s);
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};

export function renderSummary(parent,summary,messages,{editable=false,onChange=()=>{},useInsight,onReference}={}){
 parent.replaceChildren();
 for(const [key,title] of Object.entries(SUMMARY_GROUPS)){
  const group=el('section');group.className='summary-block';group.append(el('h3',title));
  const items=summary[key]||[];
  if(!items.length)group.append(el('p',key==='common'?'没有足够的双方发言支持共同点，保留分歧。':'本次尚未整理出这一项。'));
  for(const [i,item] of items.entries()){
   const article=el('article');article.className='summary-item';
   if(editable){const input=el('textarea');input.value=item.text;input.rows=3;input.maxLength=600;input.setAttribute('aria-label',`${title} ${i+1}`);input.addEventListener('input',()=>{item.originalText??=item.text;item.text=input.value;onChange();});article.append(input);}
   else article.append(el('p',item.text));
   if(item.originalText&&item.originalText!==item.text)article.append(el('small','此条由用户编辑，引用保留供核对。'));
   for(const ref of item.citations||[]){const source=messages.find(m=>m.id===ref.messageId);const b=el('button',`${source?.who||'相关发言'}：“${ref.quote}” ↗`);b.className='citation-link';b.type='button';b.addEventListener('click',()=>onReference?.(ref.messageId));article.append(b);}
   if(editable&&key==='insights'&&useInsight){const b=el('button','作为我的收获');b.className='text-button';b.type='button';b.addEventListener('click',()=>useInsight(item.text));article.append(b);}
   group.append(article);
  }
  parent.append(group);
 }
}

export class DiscussionSummary{
 constructor(api){
  this.api=api;
  $('#retry-summary').addEventListener('click',()=>this.generate());
  $('#cancel-summary').addEventListener('click',()=>{this.cancel();this.status('已停止整理，可以填写自己的收获。');});
 }
 status(message){$('#summary-status').textContent=message;}
 cancel(){this.controller?.abort();this.controller=null;$('#save-record').disabled=false;$('#retry-summary').disabled=false;$('#cancel-summary').hidden=true;for(const input of document.querySelectorAll('#summary-items textarea'))input.disabled=false;}
 showReference(id){
  $('#transcript').open=true;const p=[...$('#transcript-body').children].find(n=>n.dataset.messageId===id);if(p){p.tabIndex=-1;p.focus({preventScroll:true});p.scrollIntoView({block:'center',behavior:'smooth'});}
 }
 render(){
  const d=this.api.discussion();if(!d)return;
  $('#transcript-body').replaceChildren();
  for(const m of d.messages){const p=el('p',m.who+'：'+m.text);p.dataset.messageId=m.id;$('#transcript-body').append(p);}
  $('#summary-items').replaceChildren();
  if(d.summary){renderSummary($('#summary-items'),d.summary,d.messages,{editable:!d.saved,onChange:this.api.changed,
    useInsight:text=>{$('#record-note').value=text;this.api.changed();},onReference:id=>this.showReference(id)});
   this.status(d.summary.reviewedAt?'这份整理已由你确认，可回看对应发言。':'AI 整理草稿 · 引文已核对；请确认含义，编辑后保存。');
  }else this.status(d.mode==='demo'?'离线演示没有生成 AI 整理，可以自行记录收获。':'整理仅依据本次已完成的发言，判断由你确认。');
  $('#retry-summary').hidden=d.mode==='demo'||!!d.saved;
 }
 async generate(){
  const d=this.api.discussion();if(!d||!d.finished||d.mode==='demo')return;
  if(!d.messages.some(m=>['mine','other'].includes(m.kind))){this.status('还没有已完成的 Agent 发言，可先留下自己的想法。');return;}
  this.cancel();const request=new AbortController();this.controller=request;
  $('#save-record').disabled=true;$('#retry-summary').disabled=true;$('#cancel-summary').hidden=false;
  for(const input of document.querySelectorAll('#summary-items textarea'))input.disabled=true;
  this.status('正在从本次发言整理收获与分歧…');
  const timer=setTimeout(()=>request.abort(),65000);
  try{
   const result=await taskRequest('/api/discussion/summary',{provider:providerFor(d.mode),topicId:this.api.topic().id,messages:d.messages},request.signal);
   if(request.signal.aborted||this.controller!==request||this.api.discussion()!==d)return;
   d.summary=Object.fromEntries(['insights','common','differences','questions','provider','model','requestId','generatedAt'].map(k=>[k,result[k]]));
   this.render();this.api.changed();
  }catch(error){if(this.controller===request&&this.api.discussion()===d)this.status(request.signal.aborted?'整理等待已结束，已有内容保留。可重试或自行记录。':error.message);}
  finally{clearTimeout(timer);if(this.controller===request)this.cancel();}
 }
}
