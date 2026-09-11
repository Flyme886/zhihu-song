import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {demoTurn,participantsValid} from '../agent-turns.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../cases/catalog.json',import.meta.url)));
const {answers,scenarios}=catalog.find(t=>t.id==='robotaxi');
test('two agents require distinct source nodes',()=>{
 assert.equal(participantsValid(answers[0],answers[0]),false);
 assert.equal(participantsValid(answers[0],answers[1]),true);
});
test('robotaxi retains transition-specific reasoning',()=>{
 const output=demoTurn(answers[1],answers[0],2,[scenarios[0].text]);
 assert.ok(output.includes(scenarios[0].text));assert.ok(output.includes(answers[0].question));assert.ok(output.includes('未转岗成功'));
});
test('all nine topics provide six source-grounded local turns without leaking robotaxi',()=>{
 assert.equal(catalog.length,9);
 for(const topic of catalog){
  assert.equal(topic.scenarios.length,3);assert.ok(topic.answers.length>=4);
  for(let i=0;i<6;i++){
   const text=demoTurn(topic.answers[i%2],topic.answers[(i+1)%2],i,[topic.scenarios[0].text],topic);
   assert.ok(text.length>30);assert.ok(!text.includes('undefined'));
   if(topic.id!=='robotaxi')assert.ok(!/转岗|无人车|扩区门槛/.test(text));
   if(i>=2)assert.ok(text.includes(topic.scenarios[0].text));
  }
 }
});
test('every claimed real source is linked; editorial viewpoints have no fake author provenance',()=>{
 for(const t of catalog)for(const n of t.answers){
  assert.equal(n.exampleRelation,'unknown');
  if(n.sourceKind==='zhihu'){assert.match(n.url,/https:\/\/www.zhihu.com\/question\/\d+\/answer\/\d+/);assert.equal(n.captured,'2026-09-11');}
  else{assert.ok(!n.url);assert.ok(!n.avatar);}
 }
});
