import test from 'node:test';
import assert from 'node:assert/strict';
import {placeHoverCard} from '../hover-card.js';
import {Relationships} from '../relationship-ui.js';

test('planet previews flip at the right edge and keep the target visible',()=>{
  const viewport={width:1000,height:768,top:72,bottom:108},card={width:360,height:560};
  const left=placeHoverCard({x:80,y:350,radius:40},card,viewport);
  const right=placeHoverCard({x:920,y:350,radius:40},card,viewport);
  assert.equal(left.side,'right');assert.ok(left.left>=120);
  assert.equal(right.side,'left');assert.ok(right.left+card.width<=880);
  for(const position of [left,right]){
    assert.ok(position.top>=72);
    assert.ok(position.top+card.height<=660,'sound and canvas controls keep their space');
  }
});
test('narrow and short viewports keep each preview within its usable bounds',()=>{
  for(const [width,height,bottom] of [[358,740,144],[780,768,108],[1140,500,108]]){
    const viewport={width,height,top:72,bottom};
    const card={width:Math.min(360,width-32),height:Math.min(560,height-72-bottom)};
    for(const x of [25,width/2,width-25])for(const y of [25,height/2,height-25]){
      const position=placeHoverCard({x,y,radius:35},card,viewport);
      assert.ok(position.left>=16&&position.left+card.width<=width-16);
      assert.ok(position.top>=72&&position.top+card.height<=height-bottom);
    }
  }
});

function relationships(){
  const r=Object.create(Relationships.prototype),elements=new Map();
  globalThis.document={querySelector(selector){if(!elements.has(selector))elements.set(selector,{hidden:true,dataset:{}});return elements.get(selector);}};
  const me={id:'me',x:0,y:0,r:80,body:'我的判断'};
  const near={id:'near',x:140,y:0,r:40,title:'距离更近的观点'};
  const reading={id:'reading',x:400,y:0,r:40,title:'正在阅读的观点'};
  r.api={me,nodes:[me,near,reading],app:{dataset:{}},hideHover(){r.hoverNode=null;}};
  r.candidate=near;r.hoverNode=reading;r.overrides=new Map();r.partner=null;
  r.effects={emit(){},contact(a,b){r.contactTarget=b;}};r.refreshCard=()=>{};
  return {r,me,near,reading};
}
test('connecting after switching answers uses the visible answer instead of the nearest planet',()=>{
  const {r,near,reading}=relationships();r.confirmHover('similar');
  assert.equal(r.partner,reading);assert.equal(r.overrides.get(reading.id),'similar');
  assert.equal(r.overrides.has(near.id),false);assert.equal(r.api.app.dataset.paired,'true');
});
test('changing a connected preview to repulsion unpairs it and applies force to that answer',()=>{
  const {r,near,reading}=relationships();r.partner=reading;r.confirmHover('different');
  assert.equal(r.partner,null);assert.equal(r.contactTarget,reading);
  assert.equal(r.overrides.get(reading.id),'different');assert.equal(r.overrides.has(near.id),false);
});
test('the separate encounter card acts on its own planet while a different answer was last read',()=>{
  const {r,near,reading}=relationships();r.cardNode=near;
  r.confirmRelation('similar',r.cardNode);
  assert.equal(r.partner,near);
  assert.equal(r.overrides.has(reading.id),false);
});
test('dismissing an unrelated encounter leaves both planets unpaired',()=>{
  const {r,near}=relationships();r.confirmRelation('unrelated',near);
  assert.equal(r.partner,null);assert.equal(r.dismissed,near);
  assert.equal(r.overrides.get(near.id),'unrelated');
});
test('drag release discovers its actual current neighbor before opening a preview',()=>{
  const {r,near,reading}=relationships();r.candidate=reading;
  r.api.showEncounter=node=>{r.preview=node;};r.released(true);
  assert.equal(r.preview,near);
  r.preview=null;r.released(false);assert.equal(r.preview,null,'background clicks do not open an encounter');
});
