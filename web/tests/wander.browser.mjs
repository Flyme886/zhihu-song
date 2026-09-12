import assert from 'node:assert/strict';
import {QA_SCRIPT,QA_PREFIX} from './browser-harness.mjs';

// Run in an Ego task page. Both WebGL failure and storage are isolated to this tab.
export async function verifyFallbackStory(page){
 const prefix=`wander-fallback-${Date.now()}.`;
 const source=QA_SCRIPT.replaceAll(QA_PREFIX,prefix)+`;(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl/.test(type)?null:get.call(this,type,...args);};window.__modelRequests=[];const request=window.fetch;window.fetch=function(input,...args){if(['/api/agent/turn','/api/thought/','/api/discussion/summary'].some(path=>String(input).includes(path)))window.__modelRequests.push(String(input));return request.call(this,input,...args);};})();`;
 const {identifier}=await page.cdp('Page.addScriptToEvaluateOnNewDocument',{source});
 const click=action=>page.click(`[data-story-action="${action}"]`);
 try{
  await page.reload();await page.waitForFunction(()=>!!window.planetDiagnostics);
  await page.evaluate(()=>{location.hash='/planet/map';});await page.waitForSelector('#wander-map[open]');
  assert.equal(await page.evaluate(()=>document.body.dataset.renderer),'fallback');
  const sessionBefore=await page.evaluate(()=>localStorage.getItem('gravity.sessions.v1'));
  await page.click('[data-map-view="list"]');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.wander-map-row').length),7);
  await page.click('.wander-map-row:first-child button:last-child');
  await page.waitForSelector('.story-overlay[open]');
  assert.ok((await page.evaluate(()=>document.querySelector('.story-memory-paper').innerText)).length>40);
  await click('resume');await click('begin');
  for(const id of ['ning','he']){await click('read-'+id);await click('select-'+id);}
  await click('begin-dialogue');
  await click('next-round');
  const alone=await page.evaluate(()=>document.querySelector('.story-messages').innerText);
  await click('condition-family');
  const family=await page.evaluate(()=>document.querySelector('.story-messages').innerText);
  assert.notEqual(alone,family);
  for(let i=0;i<3;i++)await click('next-round');
  const notes=[];for(const id of ['keep','supplement','changed']){await click('ending-'+id);notes.push(await page.evaluate(()=>document.querySelector('#story-note').value));}
  assert.equal(new Set(notes).size,3);
  const note='我想先和家人试着挪一次椅子，再决定客厅的样子。';await page.fill('#story-note',note);
  await page.reload();await page.waitForSelector('#story-note',{state:'visible'});
  assert.equal(await page.evaluate(()=>document.querySelector('#story-note').value),note);
  await click('save');await page.waitForSelector('.story-memory-note');
  assert.equal(await page.evaluate(()=>document.querySelector('.story-memory-note').textContent),note);
  await page.screenshot({path:'/tmp/planet-story-mobile.png'});
  await click('return-memory');await page.click('#wander-map-button');await page.click('[data-map-view="list"]');
  await page.fill('#wander-search',note);await page.click('.wander-map-row button:last-child');
  assert.equal(await page.evaluate(()=>document.querySelector('.story-memory-note').textContent),note);
  assert.equal(await page.evaluate(()=>localStorage.getItem('gravity.sessions.v1')),sessionBefore);
  assert.deepEqual(await page.evaluate(()=>window.__modelRequests),[]);
  await click('return-memory');await page.click('#wander-map-button');await page.fill('#wander-search','');
  await page.click('#wander-reset-story');await page.click('#wander-confirm-reset');
  assert.equal(await page.evaluate(()=>window.planetDiagnostics().wander.story.main.record),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('gravity.sessions.v1')),sessionBefore);
  assert.deepEqual(await page.evaluate(()=>window.__qaErrors),[]);
  return {webglFallback:true,listReading:true,conditionsDiffer:true,threeEndings:true,editReload:true,saveRevisit:true,resetIsolated:true,modelRequests:0};
 }finally{await page.cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier});}
}
