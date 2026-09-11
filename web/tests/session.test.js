import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionStore,LatestRequest,snapshotDiscussion,eggAvailable,recordMarkdown} from '../session.js';
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}};
test('topic drafts and multiple records survive refresh independently',()=>{
 const disk=memory(),s=new SessionStore(disk);s.update('snail',{draft:'my snail'});s.update('cat-art',{draft:'my cat'});
 s.addRecord('snail',{id:'1',note:'one'});s.addRecord('snail',{id:'2',note:'two'});
 const reloaded=new SessionStore(disk);assert.equal(reloaded.get('cat-art').draft,'my cat');assert.equal(reloaded.get('snail').records.length,2);
 reloaded.deleteRecord('snail','1');assert.equal(reloaded.get('snail').records[0].id,'2');assert.equal(s.get('snail').records.length,2);
});
test('failed storage retains in-page state without overwriting prior data',()=>{
 let error='';const s=new SessionStore({getItem(){return 'invalid';},setItem(){throw Error();}},m=>error=m);s.update('snail',{draft:'not lost'});assert.ok(error);assert.equal(s.get('snail').draft,'not lost');
});
test('new selection and cancellation reject late responses',()=>{
 const req=new LatestRequest(),a=req.begin(),b=req.begin();assert.ok(a.signal.aborted);assert.equal(a.current(),false);assert.equal(b.current(),true);req.cancel();assert.equal(b.current(),false);
});
test('snapshot does not persist DOM, requests, animation state or credentials',()=>{
 const n={id:'a',body:'text',contentHtml:'<p>完整原文</p>',contentStatus:'full',publishedText:'发布于2018-07-24',author:'A',source:'source',el:{cycle:null},time:44,apiKey:'no'};n.el.cycle=n;
 const d={source:n,target:{...n,id:'b'},turn:1,messages:[],additions:[],auto:true,busy:true};const snapshot=snapshotDiscussion(d);
 assert.doesNotThrow(()=>JSON.stringify(snapshot));assert.equal(snapshot.source.apiKey,undefined);assert.equal(snapshot.auto,undefined);assert.equal(snapshot.source.contentHtml,n.contentHtml);assert.equal(snapshot.source.contentStatus,'full');assert.equal(snapshot.source.publishedText,n.publishedText);
});
test('eggs trigger only on their explicit event; export keeps reviewed note and source links',()=>{
 assert.equal(eggAvailable({egg:{event:'paired'}},'two-turns'),false);assert.equal(eggAvailable({egg:{event:'paired'}},'paired'),true);
 const n={author:'A',source:'摘要',body:'body',url:'https://www.zhihu.com/answer/1'};
 const text=recordMarkdown({topicTitle:'题目',savedAt:'date',note:'我的确认',source:n,target:n,messages:[{who:'Agent',text:'延展'}]});
 assert.ok(text.includes('我的确认'));assert.ok(text.includes(n.url));assert.ok(text.includes('不代表原答主'));
});
