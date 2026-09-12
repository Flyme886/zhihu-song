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
export async function verifyRelations(page,options={}){
  const initial=await nodePositions(page),me=initial[0],other=initial[1];
  const d=me.r+other.r+24;
  await dragPlanet(page,me,{x:other.x+d,y:other.y},options);
  await page.waitForFunction(()=>!document.querySelector('#relation-card').hidden);
  assert.equal(await page.evaluate(()=>document.querySelector('#relation-card').dataset.kind),'unknown');
  assert.equal(await page.evaluate(()=>document.querySelector('#relation-card').parentElement.id),'app');
  assert.equal(await page.evaluate(()=>document.querySelector('#hover-card').hidden),true);
  await page.click('[data-confirm-relation="similar"]');
  await page.waitForFunction(()=>document.querySelector('#app').dataset.paired==='true');
  const paired=await nodePositions(page);
  await dragPlanet(page,paired[0],{x:paired[0].x+65,y:paired[0].y+90},options);
  await page.waitForFunction(({id,startY})=>{
    const r=document.querySelector(`[data-node="${id}"]`).getBoundingClientRect();return r.y+r.height/2>startY+55;
  },{id:paired[1].id,startY:paired[1].y});
  assert.equal(await page.evaluate(()=>document.body.dataset.view),'world','dragging my planet must not enter the archive');
  const bridge=await page.evaluate(()=>{
    const c=document.querySelector('#connections'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])visible++;return visible;
  });
  assert.ok(bridge>20,'a connected pair must have a visible particle bridge');
  await page.click('#unlink');
  // Move away from the classified sphere, then approach another unknown viewpoint.
  const second=(await nodePositions(page))[2],current=(await nodePositions(page))[0];
  await dragPlanet(page,current,{x:second.x-second.r-current.r-15,y:second.y},options);
  await page.waitForFunction(()=>!document.querySelector('#relation-card').hidden&&document.querySelector('#relation-card').dataset.kind==='unknown');
  await page.click('[data-confirm-relation="different"]');
  await page.waitForFunction(()=>document.querySelector('#relation-card').dataset.kind==='different');
  const before=await nodePositions(page);
  await dragPlanet(page,before[0],{x:before[2].x-before[0].r-before[2].r+28,y:before[2].y},options);
  await page.waitForFunction(id=>{
    const center=el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,r:r.width/2};};
    const a=center(document.querySelector('[data-node="me"]')),b=center(document.querySelector(`[data-node="${id}"]`));
    return Math.hypot(a.x-b.x,a.y-b.y)-a.r-b.r>a.r/80*26;
  },before[2].id);
  const after=await nodePositions(page);
  assert.ok(Math.hypot(after[2].x-before[2].x,after[2].y-before[2].y)>8,'the other sphere yields to a drag');
  assert.equal(await page.evaluate(()=>document.body.dataset.view),'world');
  assert.deepEqual(await page.evaluate(()=>window.__qaErrors),[]);
  return {bridgePixels:bridge,repelledDistance:Math.hypot(after[2].x-before[2].x,after[2].y-before[2].y)};
}
