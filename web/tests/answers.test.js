import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeAnswers,styleAnswers,loadAnswers} from '../answers.js';
const original=(id,body='原始正文')=>({id:'zhihu-'+id,answerId:id,body,contentHtml:`<p>${body}</p>`,contentStatus:'full',url:`https://www.zhihu.com/question/1/answer/${id}`});

test('originals replace matching versions while retaining planet identity; summaries and excerpts never become planets',()=>{
 const preset=[{...original('123'),id:'curated'},{id:'editorial',body:'旧概括',sourceKind:'editorial'}];
 const merged=mergeAnswers(preset,[{id:'excerpt',answerId:'123',body:'搜索截取',contentStatus:'excerpt'},original('456'),original('456'),original('123','更新后的原文')]);
 assert.equal(merged.length,2);assert.equal(merged[0].id,'curated');assert.equal(merged[0].body,'更新后的原文');
 assert.equal(merged[1].answerId,'456');assert.equal(preset[0].body,'原始正文');
 const styled=styleAnswers(Array.from({length:12},(_,id)=>original(String(id+1))));
 assert.equal(new Set(styled.map(n=>`${n.x},${n.y}`)).size,12);
});

test('discovery keeps unread originals as external entries; unavailable service keeps the full corpus',async()=>{
 const previous=globalThis.fetch,topic={id:'snail',answers:[original('123')]};
 try{
  globalThis.fetch=async()=>({ok:true,json:async()=>({topicId:'snail',answers:[{id:'excerpt',answerId:'456',contentStatus:'excerpt'},original('123')],syncedAt:1})});
  const loaded=await loadAnswers(topic);assert.equal(loaded.answers.length,1);assert.equal(loaded.pendingOriginals[0].answerId,'456');
  globalThis.fetch=async()=>({ok:false});
  const failed=await loadAnswers(topic);assert.equal(failed.answers[0].contentHtml,'<p>原始正文</p>');assert.ok(failed.error);
  globalThis.fetch=async()=>({ok:true,json:async()=>({topicId:'another',answers:[original('789')]})});
  assert.equal((await loadAnswers(topic)).answers[0].answerId,'123');
 }finally{globalThis.fetch=previous;}
});
