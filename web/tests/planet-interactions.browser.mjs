// Run inside ego-browser nodejs after selecting a TaskSpace and Page.
import assert from 'node:assert/strict';
import {prepare} from './browser-harness.mjs';

export async function inspectParticles(page){
  await page.evaluate(async()=>{
    const {CosmosRenderer}=await import('/cosmos.js');
    if(CosmosRenderer.prototype.__qaObserved)return;
    CosmosRenderer.prototype.__qaObserved=true;
    const original=CosmosRenderer.prototype.render;
    CosmosRenderer.prototype.render=function(nodes){
      const result=original.call(this,nodes);
      window.__particleFrame={nodes:structuredClone(nodes),counts:this.worldNodes.filter(n=>n.visible).map(n=>n.children[0]?.geometry.drawRange.count),kinds:this.worldNodes.filter(n=>n.visible).map(n=>n.children[0]?.type)};
      return result;
    };
  });
  await page.waitForFunction(()=>!!window.__particleFrame);
}
export async function verifyFormation(page){
  await prepare(page,{prefix:`planet-interactions-${Date.now()}.`});
  await page.evaluate(()=>{location.hash='/world/snail';});
  await page.waitForSelector('#compose',{state:'visible'});
  // Same-document hash navigation keeps the storage shim in place.
  assert.equal(await page.evaluate(()=>window.__planetQA),true);
  await inspectParticles(page);
  await page.click('#compose');
  await page.fill('#knowledge','');
  await page.waitForFunction(()=>window.__particleFrame?.nodes.length===1&&window.__particleFrame.nodes[0].fill<.14);
  const seed=await page.evaluate(()=>window.__particleFrame);
  assert.equal(seed.kinds[0],'Points');
  assert.ok(seed.nodes[0].r>65);
  await page.fill('#knowledge','我愿意接受，但必须明确规则。');
  await page.waitForFunction(()=>window.__particleFrame.nodes[0].fill>.22);
  const short=await page.evaluate(()=>window.__particleFrame);
  await page.fill('#knowledge','我愿意接受这笔钱，但必须先明确规则和风险边界，同时为意外预留足够的应对方案。'.repeat(5));
  await page.waitForFunction(()=>window.__particleFrame.nodes[0].fill>.82);
  const full=await page.evaluate(()=>window.__particleFrame);
  assert.ok(full.counts[0]>short.counts[0]&&short.counts[0]>seed.counts[0]);
  await page.waitForFunction(t=>window.__particleFrame.nodes[0].time>t+.25,full.nodes[0].time);
  assert.equal(await page.evaluate(()=>window.planetDiagnostics().history.opinions),0,'typing must not save an opinion');
  await page.click('#close-composer');
  assert.equal(await page.evaluate(()=>window.planetDiagnostics().history.opinions),0);
  await page.click('#compose');
  assert.ok((await page.evaluate(()=>document.querySelector('#knowledge').value)).length>100);
  await page.click('#enter');
  await page.waitForFunction(()=>document.querySelector('#app').dataset.stage==='world');
  assert.equal(await page.evaluate(()=>window.planetDiagnostics().history.opinions),1);
  assert.equal(await page.evaluate(()=>document.querySelector('[data-node="me"]').getClientRects().length),1);
  assert.deepEqual(await page.evaluate(()=>window.__qaErrors),[]);
  return {seed:seed.counts[0],short:short.counts[0],full:full.counts[0],savedOpinions:1};
}
export async function nodePositions(page){
  return page.evaluate(()=>[...document.querySelectorAll('.node')].map(el=>{
    const r=el.getBoundingClientRect();return{id:el.dataset.node,x:r.x+r.width/2,y:r.y+r.height/2,r:r.width/2};
  }));
}
export async function dragPlanet(page,from,to,{touch=false}={}){
  if(touch){
    await page.cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y}]});
    for(let step=1;step<=16;step++)await page.cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*step/16,y:from.y+(to.y-from.y)*step/16}]});
    await page.cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    return;
  }
  await page.mouse.move(from.x,from.y);
  // An answer card opened while crossing another planet can cover the drag
  // start. Dismiss it as a user would before grabbing the intended sphere.
  if(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('#hover-card'),from)){
    await page.click('#close-hover');await page.mouse.move(from.x,from.y);
  }
  await page.mouse.down();
  for(let step=1;step<=16;step++)await page.mouse.move(from.x+(to.x-from.x)*step/16,from.y+(to.y-from.y)*step/16);
  await page.mouse.up();
}
// Run with real, already analyzed viewpoints (or an explicitly seeded QA session).
// The caller chooses which known similar/different planets to exercise.
export async function verifyRelations(page,{similarId,differentId,...options}={}){
  assert.ok(similarId&&differentId,'provide the IDs of content-classified viewpoints');
  const initial=await nodePositions(page),me=initial.find(n=>n.id==='me'),other=initial.find(n=>n.id===similarId);
  await dragPlanet(page,me,{x:other.x+me.r+other.r+20,y:other.y},options);
  await page.waitForFunction(()=>document.querySelector('#app').dataset.paired==='true');
  assert.equal(await page.evaluate(()=>!!document.querySelector('#relation-card')),false);
  assert.equal(await page.evaluate(()=>document.querySelector('#hover-card').hidden),true);
  const paired=await nodePositions(page),leader=paired.find(n=>n.id==='me'),companion=paired.find(n=>n.id===similarId);
  await dragPlanet(page,leader,{x:leader.x+65,y:leader.y+90},options);
  await page.waitForFunction(({id,startY})=>{
    const r=document.querySelector(`[data-node="${id}"]`).getBoundingClientRect();return r.y+r.height/2>startY+55;
  },{id:companion.id,startY:companion.y});
  assert.equal(await page.evaluate(()=>document.body.dataset.view),'world');
  const before=await nodePositions(page),current=before.find(n=>n.id==='me'),different=before.find(n=>n.id===differentId);
  await dragPlanet(page,current,{x:different.x+different.r+current.r+20,y:different.y},options);
  await page.waitForFunction(()=>!document.querySelector('#discussion').hidden);
  assert.equal(await page.evaluate(()=>document.querySelector('#discussion-companion').hidden),false);
  await page.click('#close-discussion');
  assert.equal(await page.evaluate(()=>document.querySelector('#encounter-progress').hidden),true);
  assert.deepEqual(await page.evaluate(()=>window.__qaErrors),[]);
  return {automaticPair:true,automaticDebate:true,companionRetained:true};
}
