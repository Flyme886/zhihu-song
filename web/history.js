import {snapshotNode} from './session.js';

export const SECTIONS={opinions:'我的观点',cases:'参与过的案例',records:'讨论记录'};
export function timestamp(value){const t=Date.parse(value);return Number.isFinite(t)?t:0;}
export function dateLabel(value){return timestamp(value)?new Date(value).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'}):'时间未记录';}
export function buildHistory(data,catalog){
 const topics=new Map(catalog.map(t=>[t.id,t])),opinions=[],cases=[],records=[];
 for(const [topicId,state] of Object.entries(data.topics)){
  const topic=topics.get(topicId),title=topic?.title||state.title||state.records?.[0]?.topicTitle||topicId;
  const versions=state.opinions||[];
  const captured=[...(state.sources||[]),...(state.records||[]).flatMap(r=>[r.source,r.companion,r.target].filter(Boolean))];const sources=captured.filter((n,i)=>captured.findIndex(v=>v.id===n.id&&v.body===n.body)===i);
  versions.forEach((item,i)=>opinions.push({...item,kind:'opinions',topicId,topicTitle:title,title:i?'后来，我这样想':'最初的想法',version:i+1,previous:versions[i-1]?.text||'',body:item.text,date:item.createdAt}));
  (state.records||[]).forEach(item=>records.push({...item,kind:'records',topicId,topicTitle:item.topicTitle||title,title:item.note||'一次留下来的对话',body:item.note||'',date:item.savedAt}));
  if(versions.length||state.records?.length||state.visitedAt||state.read?.length||state.discussion){
   cases.push({id:topicId,kind:'cases',topicId,topicTitle:title,title,body:topic?.description||'',date:state.visitedAt||versions[0]?.createdAt||state.records?.[0]?.savedAt||null,latest:state.input||'',opinionCount:versions.length,recordCount:state.records?.length||0,sources,background:topic?.background||[],rules:topic?.rules||''});
  }
 }
 return {opinions,cases,records};
}
export function queryHistory(items,{query='',topicId='',order='newest',page=0,size=8}={}){
 const q=query.trim().toLocaleLowerCase();
 const filtered=items.filter(n=>(!topicId||n.topicId===topicId)&&(!q||[n.title,n.body,n.topicTitle,n.note,n.common].some(x=>String(x||'').toLocaleLowerCase().includes(q))));
 filtered.sort((a,b)=>(timestamp(a.date)-timestamp(b.date))*(order==='oldest'?1:-1)||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(filtered.length/size)),index=Math.max(0,Math.min(page,pages-1));
 return {items:filtered.slice(index*size,(index+1)*size),total:filtered.length,page:index,pages};
}
export function parseRoute(hash,catalog){
 const ids=new Set(catalog.map(t=>t.id));let parts;try{parts=hash.replace(/^#\/?/,'').split('/').map(decodeURIComponent);}catch{return{view:'home'};}
 if(parts[0]==='world')return{view:'world',topicId:ids.has(parts[1])?parts[1]:null};
 if(parts[0]==='planet')return{view:'planet',section:SECTIONS[parts[1]]?parts[1]:null,itemId:parts[2]||null};
 return{view:'home'};
}
export function captureSource(store,topicId,node){
 const state=store.get(topicId);state.sources??=[];
 if(!state.sources.some(n=>n.id===node.id&&n.body===node.body))state.sources.push(snapshotNode(node));
 state.visitedAt??=new Date().toISOString();store.save();
}
