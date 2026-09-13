import test from 'node:test';
import assert from 'node:assert/strict';
import {EncounterDwell} from '../encounter-dwell.js';
import {Relationships} from '../relationship-ui.js';
import {relationFor} from '../relations.js';

const a={id:'a'}, b={id:'b'};
test('a stationary approach fires once after 1.5 seconds, without an animation clock',()=>{
  const d=new EncounterDwell();
  assert.equal(d.update(a,'similar',9000),null,'initial layout does not trigger encounters');
  d.arm();assert.equal(d.update(a,'similar',100),null);
  assert.equal(d.update(a,'similar',1599),null);
  assert.equal(d.update(a,'similar',1600),a);
  assert.equal(d.update(a,'similar',5000),null,'remaining nearby does not repeat an action');
});
test('dragging, a new target, and a changed judgment each restart the full delay',()=>{
  const d=new EncounterDwell();d.arm();d.update(a,'similar',0);
  d.update(a,'similar',1400,true);assert.equal(d.progress,0);
  d.update(a,'similar',1500);assert.equal(d.update(a,'similar',2900),null);
  d.update(b,'similar',2950);assert.equal(d.update(b,'similar',4400),null);
  d.update(b,'different',4450);assert.equal(d.update(b,'different',5900),null);
  assert.equal(d.update(b,'different',5950),b);
});
test('leaving range, hidden-page cancellation and closing a discussion discard elapsed time',()=>{
  const d=new EncounterDwell();d.arm();d.update(a,'different',0);
  d.update(null,'different',1400);d.update(a,'different',2000);
  assert.equal(d.update(a,'different',3499),null);
  d.cancel();d.update(a,'different',50000);
  assert.equal(d.update(a,'different',51499),null,'returning to a hidden tab gets a fresh delay');
  d.reset();assert.equal(d.update(a,'different',60000),null,'closing stays disarmed until a new approach');
});
test('unknown and unrelated content never become agreement because of distance or time',()=>{
  const d=new EncounterDwell();d.arm();
  for(const kind of ['unknown','unrelated',undefined]){
    assert.equal(d.update(a,kind,0),null);assert.equal(d.update(a,kind,9000),null);
    assert.equal(d.target,null);
  }
  d.update(a,'similar',10000);assert.equal(d.update(a,'similar',11499),null);
  assert.equal(d.update(a,'similar',11500),a,'AI arrival starts a fresh, cancelable dwell');
});
test('AI content judgments are usable directly and optional corrections take priority',()=>{
  const suggestions=new Map([['a',{relation:'similar'}]]),overrides=new Map();
  assert.equal(relationFor(a,false,overrides,suggestions),'similar');
  overrides.set('a','different');assert.equal(relationFor(a,false,overrides,suggestions),'different');
  assert.equal(relationFor(b,false,overrides,suggestions),'unknown');
});

function fixture(t){
  const original=globalThis.document,elements=new Map();
  globalThis.document={querySelector(selector){
    if(!elements.has(selector))elements.set(selector,{hidden:true,dataset:{},style:{setProperty(){}},setAttribute(){},removeAttribute(){}});
    return elements.get(selector);
  },querySelectorAll(){return [];}};
  t.after(()=>{globalThis.document=original;});
  const r=Object.create(Relationships.prototype),me={id:'me',x:0,y:0,r:50,body:'我的判断'},near={id:'near',x:145,y:0,r:40,title:'相近观点'},other={id:'other',x:180,y:0,r:40,title:'不同观点'};
  let blocked=false;
  Object.assign(r,{dwell:new EncounterDwell(),overrides:new Map(),suggestions:new Map([['near',{relation:'similar'}],['other',{relation:'different'}]]),partner:null,discussion:null});
  r.api={me,nodes:[me,near,other],app:{dataset:{}},hideHover(){},showEncounter(){},encounterBlocked:()=>blocked};
  r.effects={emit(){},advance(){},contact(){}};r.openDiscussion=node=>{r.discussion={target:node};};
  return {r,me,near,other,block(value){blocked=value;}};
}
test('release pairs the current neighboring viewpoint without changing its AI judgment to an override',t=>{
  const {r,near,other}=fixture(t);r.candidate=other;r.released(true);
  assert.equal(r.candidate,near);r.updateEncounter(0);r.updateEncounter(1499);assert.equal(r.partner,null);
  r.updateEncounter(1500);assert.equal(r.partner,near);assert.equal(r.api.app.dataset.paired,'true');
  assert.equal(r.overrides.size,0,'auto behavior preserves the distinction between AI and user correction');
});
test('carrying a companion approaches disagreement, then opens discussion directly',t=>{
  const {r,near,other}=fixture(t);r.partner=near;r.released(true);
  assert.equal(r.candidate,other);r.updateEncounter(0);r.updateEncounter(1500);
  assert.equal(r.discussion.target,other);assert.equal(r.partner,near);
});
test('restoring an existing pair stays silent and does not turn AI analysis into a user correction',t=>{
  const {r,near}=fixture(t);r.suggestions.clear();
  r.act({node:near,restored:true,feedback:false});
  assert.equal(r.partner,near);assert.equal(r.overrides.size,0);assert.equal(r.dwell.armed,false);
});
test('the reading approach retains its selected target when several spheres are nearby',t=>{
  const {r,other}=fixture(t);r.released(true,other);assert.equal(r.candidate,other);
  r.updateEncounter(0);r.updateEncounter(1500);assert.equal(r.discussion.target,other);
});
test('reading or interacting elsewhere blocks an already running encounter',t=>{
  const {r,block}=fixture(t);r.released(true);r.updateEncounter(0);block(true);r.updateEncounter(1600);
  assert.equal(r.partner,null);block(false);r.updateEncounter(3000);r.updateEncounter(4499);assert.equal(r.partner,null);
  r.updateEncounter(4500);assert.ok(r.partner);
});
test('correcting a read answer never connects it or mutates a different nearby answer',t=>{
  const {r,near,other}=fixture(t);r.candidate=near;r.correctRelation('similar',other);
  assert.equal(r.partner,null);assert.equal(r.overrides.get(other.id),'similar');assert.equal(r.overrides.has(near.id),false);
  r.partner=other;r.correctRelation('different',other);assert.equal(r.partner,null);
});

// A compressed field used to push a stationary user toward another candidate,
// preventing the countdown from completing even though the pointer had stopped.
test('a stationary dwell keeps its position and target despite nearby repulsion',t=>{
  const {r,me,near,other}=fixture(t);r.suggestions.set(near.id,{relation:'different'});
  near.x=75;other.x=100;r.released(true);
  const start={x:me.x,y:me.y};
  for(let i=0;i<60;i++)r.tick(1/60,false,null);
  assert.deepEqual({x:me.x,y:me.y},start);assert.equal(r.candidate,near);
});
