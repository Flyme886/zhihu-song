export const STORAGE_KEY='gravity.sessions.v1';
const nodeFields=['id','topicId','title','author','body','claim','question','response','sourceKind','source','url','context','bio','avatar','captured','questionTitle','color','exampleRelation'];
export function snapshotNode(node){return Object.fromEntries(nodeFields.filter(k=>node[k]!==undefined).map(k=>[k,node[k]]));}
export function snapshotDiscussion(d,note='',change='keep',common=''){
  if(!d)return null;
  return {id:d.id,source:snapshotNode(d.source),target:snapshotNode(d.target),mode:d.mode,turn:d.turn,additions:[...d.additions],messages:d.messages.map(m=>({...m})),finished:!!d.finished,note,change,common};
}
export class SessionStore{
  constructor(storage,onFailure=()=>{}){
    this.storage=storage;this.onFailure=onFailure;this.data={version:1,lastTopic:'snail',topics:{},planetVersion:1,settings:{}};this.failed=false;this.listeners=new Set();
    try{const raw=storage?.getItem(STORAGE_KEY);if(raw){const value=JSON.parse(raw);if(value.version!==1||!value.topics||typeof value.topics!=='object'||Array.isArray(value.topics))throw Error('未知存储版本');for(const state of Object.values(value.topics)){if(!state||!['records','eggs','read','overrides'].every(k=>Array.isArray(state[k]))||typeof state.draft!=='string'||typeof state.input!=='string')throw Error('存储内容不完整');}this.data=value;}}catch{this.fail();}
  }
  fail(){this.failed=true;this.onFailure('本机保存不可用；本次修改仅保留在本页，请及时导出。原有存储未被覆盖。');}
  get(id){if(!Object.hasOwn(this.data.topics,id))this.data.topics[id]={draft:'',input:'',overrides:[],records:[],eggs:[],read:[],discussion:null};return this.data.topics[id];}
  save(){if(!this.failed)try{if(!this.storage)throw Error();this.storage.setItem(STORAGE_KEY,JSON.stringify(this.data));}catch{this.fail();}for(const fn of this.listeners)fn(this.data);}
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  preparePlanet(){
    if(!this.data.planetVersion&&!this.failed){try{const original=this.storage?.getItem(STORAGE_KEY);if(original&&!this.storage.getItem(STORAGE_KEY+'.before-planet'))this.storage.setItem(STORAGE_KEY+'.before-planet',original);}catch{this.fail();}}
    for(const [id,state] of Object.entries(this.data.topics)){
      if(!Array.isArray(state.opinions))state.opinions=state.input?[{id:'legacy-'+id,text:state.input,createdAt:null}]:[];
      state.sources??=[];
    }
    this.data.planetVersion=1;this.data.settings??={};this.save();
  }
  addOpinion(id,text){
    const state=this.get(id);state.opinions??=[];text=String(text).trim();
    if(!text||state.opinions.at(-1)?.text===text)return false;
    const now=new Date().toISOString();state.opinions.push({id:crypto.randomUUID(),text,createdAt:now});state.visitedAt??=now;this.save();return true;
  }
  setting(key,value){this.data.settings??={};if(value!==undefined){this.data.settings[key]=value;this.save();}return this.data.settings[key];}
  exportJSON(){return JSON.stringify({application:'思想引力场',exportedAt:new Date().toISOString(),...this.data},null,2);}
  update(id,patch){Object.assign(this.get(id),patch);this.save();}
  addRecord(id,record){const s=this.get(id);const i=s.records.findIndex(r=>r.id===record.id);if(i<0)s.records.push(record);else s.records[i]=record;this.save();}
  deleteRecord(id,recordId){const s=this.get(id);const removed=s.records.find(r=>r.id===recordId);s.records=s.records.filter(r=>r.id!==recordId);this.save();return removed;}
}
export class LatestRequest{
  begin(){this.cancel();this.controller=new AbortController();const controller=this.controller,token=++this.token;return {signal:controller.signal,current:()=>this.token===token&&!controller.signal.aborted};}
  token=0;
  cancel(){this.controller?.abort();this.token++;}
}
export function eggAvailable(topic,event){return Boolean(topic.egg&&topic.egg.event===event);}
export function recordMarkdown(record){
  const labels={keep:'保留原判断',supplement:'补充原判断',changed:'改变原判断'};
  return `# ${record.topicTitle}\n\n${record.savedAt||'时间未记录'}\n\n## 我现在的想法\n\n${record.note||'未填写'}\n\n${labels[record.change]||labels.keep}\n\n## 我确认的共同点\n\n${record.common||'尚未确认'}\n\n## 来源快照\n\n`+[record.source,record.target].map(n=>`${n.author} · ${n.source}\n\n${n.body}\n\n${n.url||'案例策划或个人输入'}\n\n${n.context||''}`).join('\n\n')+`\n\n## 讨论全文\n\n`+record.messages.map(m=>`**${m.who}**\n\n${m.text}`).join('\n\n')+'\n\nAgent 发言是基于材料的延展，不代表原答主本人。\n';
}
