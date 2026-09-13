import {analysisKey,material,taskRequest,RELATION_LABELS,BASIS_LABELS} from './thought-client.js';
const $=s=>document.querySelector(s);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};

export class ThoughtAdvice{
 constructor(api){
  this.api=api;this.version=0;this.result=null;this.attempted=new Set();
  $('#open-advice').addEventListener('click',()=>{$('#advice-dialog').showModal();this.render();});
  $('#close-advice').addEventListener('click',()=>$('#advice-dialog').close());
  $('#analyze-thought').addEventListener('click',()=>this.analyze());
  $('#cancel-analysis').addEventListener('click',()=>{this.cancel();this.status('分析已停止，已有判断保留，可稍后重试。');});
 }
 candidates(){return this.api.nodes.filter(n=>n.id!=='me'&&n.body).slice(0,8);}
 status(text){$('#advice-status').textContent=text;$('#advice-badge').textContent=this.busy?'正在理解…':this.result?'查看关系建议':'找值得聊的观点';}
 cancel(){this.version++;this.controller?.abort();this.busy=false;$('#analyze-thought').disabled=false;$('#cancel-analysis').hidden=true;}
 clear(){
  this.cancel();this.result=null;this.attempted.clear();this.api.relations.suggestions=new Map();this.api.relations.cancelEncounter(false);
  for(const n of this.api.nodes){delete n.analysis;if(n.originalTitle)n.title=n.originalTitle;if(n.originalClaim)n.claim=n.originalClaim;this.label(n);}
  this.status(this.api.me.body?'AI 比较观点后，靠近停留即可自动连接或进入辩论。':'先写下自己的想法，再看看哪些观点值得接近。');this.render();
 }
 label(n){if(n.id==='me')return;if(n.label)n.label.textContent=n.title;n.el?.setAttribute('aria-label',n.title+'，查看观点');}
 async restore(saved){
  this.clear();const version=this.version;if(!saved||!this.api.me.body)return;
  const key=await analysisKey(this.api.topic(),this.api.me,this.candidates());
  if(version!==this.version)return;
  const legacyKey=key===saved.key?key:await analysisKey(this.api.topic(),this.api.me,this.candidates().slice(0,6));
  if(version!==this.version)return;
  if(key===saved.key||legacyKey===saved.key){this.apply({...saved,key});this.status('已恢复观点关系，靠近并停留 1.5 秒即可相遇。');}
 }
 apply(result){
  this.result=result;this.api.me.analysis=result.me;
  this.api.relations.suggestions=new Map(result.candidates.map(n=>[n.id,n]));this.api.relations.cancelEncounter(false);
  for(const item of result.candidates){const n=this.api.nodes.find(n=>n.id===item.id);if(!n)continue;n.originalTitle??=n.title;n.originalClaim??=n.claim;n.analysis=item;n.title=item.title;n.claim=item.claim;this.label(n);}
  if(this.api.relations.partner)$('#pair-name').textContent=this.api.relations.partner.title;
  this.api.relations.refreshPicker();this.render();this.api.updated?.();
 }
 ensure(node){
  if(this.busy||this.attempted.has(node.id)||this.api.relations.suggestions.has(node.id))return;
  return this.analyze({missingOnly:true});
 }
 async analyze({missingOnly=false}={}){
  if(this.busy)return;
  if(!this.api.me.body){this.status('先写下自己的想法，再让 AI 比较。');$('#advice-dialog').close();$('#compose').click();return;}
  const allCandidates=this.candidates(),candidates=missingOnly?allCandidates.filter(n=>!this.api.relations.suggestions.has(n.id)):allCandidates;if(!candidates.length){this.status('本题还没有可供比较的材料。');return;}
  this.cancel();const version=this.version,topic=this.api.topic(),me=material(this.api.me),snapshot=candidates.map(material);
  candidates.forEach(n=>this.attempted.add(n.id));
  this.busy=true;this.controller=new AbortController();const controller=this.controller,signal=controller.signal;
  $('#analyze-thought').disabled=true;$('#cancel-analysis').hidden=false;this.status('正在阅读你的条件与本题材料…');
  const timeout=setTimeout(()=>controller.abort(),65000);
  try{
   const key=await analysisKey(topic,me,allCandidates);
   // Keep the server's six-material limit; compare every displayed sphere in batches.
   const analyzed=[];let data;
   for(let i=0;i<snapshot.length;i+=6){
    data=await taskRequest('/api/thought/analyze',{topicId:topic.id,me,candidates:snapshot.slice(i,i+6)},signal);
    if(signal.aborted||version!==this.version)return;
    if(!data.me||!Array.isArray(data.candidates))throw Error('分析结果格式不完整');
    analyzed.push(...data.candidates);
   }
   const merged=new Map(missingOnly?(this.result?.candidates||[]).map(n=>[n.id,n]):[]);
   analyzed.forEach(n=>merged.set(n.id,n));
   data={...data,candidates:[...merged.values()]};
   if(signal.aborted||version!==this.version)return;
   if(key!==await analysisKey(this.api.topic(),this.api.me,this.candidates())||version!==this.version)return;
   if(!data.me||!Array.isArray(data.candidates))throw Error('分析结果格式不完整');
   this.apply({...data,key});this.api.store.update(topic.id,{analysis:this.result});
   this.status(`已比较 ${data.candidates.length} 条材料。靠近停留即可相遇，判断依据可查看和纠正。`);
   $('#world-mode').textContent='靠近并停留 1.5 秒 · 相近连接，有分歧就聊聊';
  }catch(error){if(version===this.version)this.status(signal.aborted?'分析等待已结束，原观点保留，可手动重试。':error.message);}
  finally{clearTimeout(timeout);if(version===this.version){this.busy=false;$('#analyze-thought').disabled=false;$('#cancel-analysis').hidden=true;$('#advice-badge').textContent=this.result?'查看关系建议':'重新分析关系';}}
 }
 render(){
  const list=$('#advice-results');list.replaceChildren();
  if(!this.result)return;
  const mine=el('section',undefined,'thought-extract');mine.append(el('small','AI 对你的理解 · 原文始终保留'),el('h3',this.result.me.title),el('p',this.result.me.claim),el('p','适用条件：'+this.result.me.conditions));
  const correct=el('button','这不是我的意思，修改原观点','text-button');correct.addEventListener('click',()=>{$('#advice-dialog').close();$('#compose').click();});mine.append(correct);list.append(mine);
  const order={similar:0,different:1,unknown:2,unrelated:3};
  for(const item of [...this.result.candidates].sort((a,b)=>order[a.relation]-order[b.relation])){
   const card=el('article',undefined,'advice-item');card.append(el('small',RELATION_LABELS[item.relation]),el('h3',item.title),el('p',item.reason),el('small',BASIS_LABELS[item.basis]));
   const button=el('button','查看依据与原回答 ↗','text-button');button.addEventListener('click',()=>{const n=this.api.nodes.find(n=>n.id===item.id);if(n){$('#advice-dialog').close();this.api.detail(n);}});card.append(button);list.append(card);
  }
 }
 detail(n){
  const panel=$('#detail-insight');panel.replaceChildren();panel.hidden=!n.analysis;
  if(!n.analysis)return;
  if(panel.tagName==='DETAILS'){panel.open=false;panel.append(el('summary','AI 如何理解这条观点与关系 ↗'));}
  const a=n.analysis;panel.append(el('small','AI 提炼 · 可与下方原文核对'),el('h2',a.title),el('p',a.claim),el('p','适用条件：'+a.conditions));
  if(a.reason)panel.append(el('p',`${RELATION_LABELS[a.relation]} · ${a.reason}`),el('small',BASIS_LABELS[a.basis]));
  panel.append(el('blockquote',a.quote));if(a.myQuote)panel.append(el('small','你的原文：'+a.myQuote));
 }
}
