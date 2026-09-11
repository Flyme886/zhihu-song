import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionStore,STORAGE_KEY} from '../session.js';
import {buildHistory,queryHistory,parseRoute,captureSource,dateLabel} from '../history.js';
const memory=()=>{const m=new Map();return{m,getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
const catalog=[{id:'one',title:'问题一'},{id:'two',title:'问题二'}];
test('legacy migration backs up bytes, preserves text, never invents historical dates',()=>{
 const disk=memory(),raw=JSON.stringify({version:1,lastTopic:'one',topics:{one:{input:'以前的判断',draft:'草稿',records:[],read:[],eggs:[],overrides:[]}}});disk.setItem(STORAGE_KEY,raw);
 const store=new SessionStore(disk);store.preparePlanet();assert.equal(disk.getItem(STORAGE_KEY+'.before-planet'),raw);assert.equal(store.get('one').opinions[0].text,'以前的判断');assert.equal(store.get('one').opinions[0].createdAt,null);assert.equal(dateLabel(null),'时间未记录');store.preparePlanet();assert.equal(store.get('one').opinions.length,1);assert.equal(disk.getItem(STORAGE_KEY+'.before-planet'),raw);
});
test('draft changes do not create history; explicit revisions deduplicate and survive reload',()=>{
 const disk=memory(),store=new SessionStore(disk);store.preparePlanet();store.update('one',{draft:'草稿'});assert.equal(buildHistory(store.data,catalog).opinions.length,0);
 store.addOpinion('one','第一次');store.addOpinion('one','第一次');store.addOpinion('one','第二次');store.addOpinion('two','另外的话题');const again=new SessionStore(disk);again.preparePlanet();const h=buildHistory(again.data,catalog);assert.equal(h.opinions.length,3);assert.equal(h.opinions[1].previous,'第一次');assert.equal(h.cases.length,2);assert.equal(h.records.length,0);
});
test('read sources remain immutable across later upstream text changes',()=>{
 const store=new SessionStore(memory());const source={id:'a',author:'甲',body:'当时的内容',url:'https://example.com/a',el:{private:true}};captureSource(store,'one',source);source.body='新内容';assert.equal(store.get('one').sources[0].body,'当时的内容');assert.equal(store.get('one').sources[0].el,undefined);assert.equal(buildHistory(store.data,catalog).cases.length,1);
});
test('search combines topic with query, bounds pages, and retains undated records',()=>{
 const items=Array.from({length:23},(_,i)=>({id:String(i),topicId:i%2?'two':'one',title:'历史判断 '+i,date:i?new Date(1700000000000+i*1000).toISOString():null}));const q=queryHistory(items,{query:'历史',topicId:'one',page:9,size:8});assert.equal(q.total,12);assert.equal(q.page,1);assert.equal(q.pages,2);assert.ok(q.items.some(n=>n.date===null));assert.equal(queryHistory(items,{query:'无匹配'}).total,0);
});
test('storage failure preserves current-page history and export without overwriting legacy backup',()=>{
 const disk=memory(),store=new SessionStore(disk);store.addOpinion('one','已保存');const before=disk.getItem(STORAGE_KEY);disk.setItem=()=>{throw Error('quota');};store.addOpinion('one','仍在本页');assert.equal(store.failed,true);assert.equal(disk.getItem(STORAGE_KEY),before);assert.equal(JSON.parse(store.exportJSON()).topics.one.opinions.length,2);
});
test('hash routes handle encoded IDs and corrupted/unknown routes without throwing',()=>{
 assert.deepEqual(parseRoute('#/world/two',catalog),{view:'world',topicId:'two'});assert.deepEqual(parseRoute('#/planet/records/a%20b',catalog),{view:'planet',section:'records',itemId:'a b'});assert.equal(parseRoute('#/planet/%E0%A4%A',catalog).view,'home');assert.equal(parseRoute('#/world/unknown',catalog).topicId,null);
});
test('record snapshots, settings and raw JSON backup round-trip',()=>{
 const disk=memory(),store=new SessionStore(disk);store.preparePlanet();store.setting('audio',{enabled:false,master:.3});store.addRecord('one',{id:'rec',note:'确认',source:{body:'旧'},target:{body:'另一个'},messages:[],savedAt:null});const raw=JSON.parse(store.exportJSON());const h=buildHistory(raw,catalog);assert.equal(h.records[0].note,'确认');assert.equal(new SessionStore(disk).setting('audio').enabled,false);assert.equal(h.records[0].source.body,'旧');
});
