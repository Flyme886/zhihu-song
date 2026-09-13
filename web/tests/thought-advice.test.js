import test from 'node:test';
import assert from 'node:assert/strict';
import {ThoughtAdvice} from '../thought-advice.js';
import {analysisKey} from '../thought-client.js';

function fixture(t){
  const document=globalThis.document,fetch=globalThis.fetch,elements=new Map();
  globalThis.document={querySelector(s){if(!elements.has(s))elements.set(s,{});return elements.get(s);}};
  t.after(()=>{globalThis.document=document;globalThis.fetch=fetch;});
  const me={id:'me',body:'不接受追杀条件',author:'我'},nodes=[me,...Array.from({length:8},(_,i)=>({id:String(i),body:'观点 '+i,author:'作者 '+i}))];
  const topic={id:'snail',rules:'题目规则'},saved=[],requests=[];
  const advice=Object.create(ThoughtAdvice.prototype);
  Object.assign(advice,{version:0,result:null,attempted:new Set(),render(){},api:{me,nodes,topic:()=>topic,relations:{suggestions:new Map(),cancelEncounter(){},refreshPicker(){}},store:{update(id,data){saved.push(data);}}}});
  globalThis.fetch=async(path,options)=>{
    const request=JSON.parse(options.body);requests.push(request);
    return {ok:true,json:async()=>({provider:'compatible',me:{title:'我的主张'},candidates:request.candidates.map(n=>({id:n.id,title:n.body,claim:n.body,relation:Number(n.id)%2?'different':'similar'}))})};
  };
  return {advice,me,nodes,topic,saved,requests};
}
test('all eight visible viewpoints are analyzed within the six-material API batch limit',async t=>{
  const {advice,requests,saved}=fixture(t);await advice.analyze();
  assert.deepEqual(requests.map(r=>r.candidates.length),[6,2]);
  assert.equal(advice.api.relations.suggestions.size,8);
  assert.equal(saved.at(-1).analysis.key,await analysisKey(advice.api.topic(),advice.api.me,advice.candidates()));
});
test('existing six-viewpoint analyses restore without another request; encountering an uncovered sphere fills the remainder',async t=>{
  const {advice,me,nodes,topic,requests}=fixture(t);
  const candidates=nodes.slice(1,7).map(n=>({id:n.id,title:n.body,claim:n.body,relation:'similar'}));
  await advice.restore({key:await analysisKey(topic,me,nodes.slice(1,7)),me:{title:'旧分析'},candidates});
  assert.equal(requests.length,0);assert.equal(advice.api.relations.suggestions.size,6);
  await advice.ensure(nodes[8]);assert.deepEqual(requests[0].candidates.map(n=>n.id),['6','7']);
  assert.equal(advice.api.relations.suggestions.size,8);
  await advice.ensure(nodes[8]);assert.equal(requests.length,1,'a completed comparison is reused');
});
test('an interrupted analysis cannot apply results to a newly edited opinion',async t=>{
  const {advice,saved}=fixture(t);let resolve,requested;
  const started=new Promise(r=>{requested=r;});
  globalThis.fetch=()=>new Promise(r=>{resolve=r;requested();});
  const task=advice.analyze();
  await started;
  advice.api.me.body='新的不同观点';advice.clear();
  resolve({ok:true,json:async()=>({provider:'compatible',me:{},candidates:[]})});await task;
  assert.equal(advice.result,null);assert.equal(saved.length,0);assert.equal(advice.api.relations.suggestions.size,0);
});
test('failed automatic analysis is not retried on every frame and leaves an explicit manual retry',async t=>{
  const {advice,nodes}=fixture(t);let requests=0;
  globalThis.fetch=async()=>{requests++;throw Error('temporary failure');};
  await advice.ensure(nodes[1]);await advice.ensure(nodes[1]);await advice.ensure(nodes[2]);
  assert.equal(requests,1);assert.equal(advice.api.relations.suggestions.size,0);
  await advice.analyze();assert.equal(requests,2,'manual retry remains available');
});
