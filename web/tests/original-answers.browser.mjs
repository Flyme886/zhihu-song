import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {stable} from './browser-harness.mjs';
export const PREFIX='planet-originals-20260911.';
const catalog=JSON.parse(await fs.readFile(new URL('../cases/catalog.json',import.meta.url),'utf8'));
export async function verifyOriginals(page){
 const results=[];
 for(const topic of catalog){
  await page.evaluate(id=>{location.hash='/world/'+id;},topic.id);
  await page.waitForFunction(({id,count})=>document.querySelector('.topic-row[aria-current="page"]')?.dataset.topic===id&&document.querySelectorAll('.node:not([data-node="me"])').length===count,{id:topic.id,count:topic.answers.length});
  await page.waitForFunction(()=>!document.querySelector('#detail').open);
  await page.focus(`[data-node="${topic.answers[0].id}"]`);
  await page.press(`[data-node="${topic.answers[0].id}"]`,'Enter');
  await page.waitForSelector('#detail[open]',{state:'visible'});
  let dimensions;
  for(const [i,answer] of topic.answers.entries()){
   await stable(page);
   const state=await page.evaluate(()=>{const d=document.querySelector('#detail'),b=document.querySelector('#detail-body'),r=d.getBoundingClientRect();return{id:d.dataset.answerId,author:document.querySelector('#detail-author').textContent,url:document.querySelector('#detail-link').href,body:b.innerText,paragraphs:b.querySelectorAll('p').length,images:b.querySelectorAll('img').length,count:document.querySelector('#detail-count').textContent,scrollTop:b.scrollTop,width:r.width,height:r.height,bodyHeight:b.clientHeight,viewport:innerHeight,bottom:r.bottom};});
   assert.equal(state.id,answer.answerId);assert.equal(state.author,answer.author);assert.equal(state.url,answer.url);assert.equal(state.count,`${i+1} / ${topic.answers.length}`);assert.equal(state.scrollTop,0);
   assert.ok(state.bodyHeight>100,'original body needs usable scrolling space');assert.ok(state.bottom<=state.viewport+1,'dialog stays in viewport');
   if(dimensions)assert.deepEqual([state.width,state.height],dimensions);else dimensions=[state.width,state.height];
   const normalize=s=>s.replace(/\s|\u200b/g,'');
   const actual=normalize(state.body),expected=normalize(answer.body);
   assert.ok(actual.includes(expected.slice(0,40)),`${answer.id}: opening text preserved`);
   assert.ok(actual.includes(expected.slice(-40)),`${answer.id}: ending text preserved`);
   assert.ok(actual.length>=expected.length*.98,`${answer.id}: original not truncated`);
   await page.evaluate(()=>{const body=document.querySelector('#detail-body');body.scrollTop=body.scrollHeight;});
   if(i<topic.answers.length-1)await page.click('#detail-next');
  }
  // Navigation wraps back without retaining the previous article or scroll.
  await page.click('#detail-next');
  assert.equal(await page.evaluate(()=>document.querySelector('#detail').dataset.answerId),topic.answers[0].answerId);
  await page.click('#close-detail');
  await page.waitForFunction(()=>!document.querySelector('#detail').open);
  results.push({topic:topic.id,originals:topic.answers.length});
 }
 assert.deepEqual(await page.evaluate(()=>window.__qaErrors),[]);
 return results;
}
export async function verifySanitizer(page){
 const state=await page.evaluate(async()=>{
  const {renderOriginal}=await import('/original-answer.js');const box=document.createElement('div');document.body.append(box);window.__injected=false;
  renderOriginal(box,{contentStatus:'full',url:'https://www.zhihu.com/question/1/answer/2',contentHtml:'<p onclick="window.__injected=true">原始<strong>段落</strong></p><script>window.__injected=true</script><a href="javascript:window.__injected=true">危险链接</a><iframe src="https://example.com"></iframe><img src="https://evil.example/track" onerror="window.__injected=true"><noscript><img src="https://evil.example/duplicate"></noscript><blockquote>引用</blockquote><a href="/question/1/answer/2">原文</a>'});
  const result={text:box.innerText,html:box.innerHTML,injected:window.__injected,scripts:box.querySelectorAll('script,iframe,img,[onclick],[onerror]').length,links:[...box.querySelectorAll('a')].map(a=>a.getAttribute('href'))};box.remove();return result;
 });
 assert.equal(state.injected,false);assert.equal(state.scripts,0);assert.equal(state.links[0],null);assert.equal(state.links[1],'https://www.zhihu.com/question/1/answer/2');assert.ok(state.text.includes('原始段落'));return {inertMarkup:true};
}
export async function verifyHover(page){
 await page.evaluate(()=>{location.hash='/world/sun';});
 await page.waitForSelector('[data-node="layers"]',{state:'visible'});
 await page.hover('[data-node="layers"]');
 await page.waitForSelector('#hover-card:not([hidden])',{state:'visible'});
 const first=await page.evaluate(()=>{const card=document.querySelector('#hover-card'),p=document.querySelector('#answer-text p'),r=card.getBoundingClientRect();return{id:card.dataset.answerId,width:r.width,height:r.height,top:r.top,bottom:r.bottom,x:r.x,paragraphClamp:getComputedStyle(p).webkitLineClamp,bodyHeight:document.querySelector('#answer-text').clientHeight,scrollHeight:document.querySelector('#answer-text').scrollHeight};});
 assert.equal(first.id,'3380704164');assert.ok(Math.abs(first.width/first.height-9/16)<.003);assert.equal(first.paragraphClamp,'none');assert.ok(first.scrollHeight>first.bodyHeight);
 await page.click('#answer-next');
 const next=await page.evaluate(()=>{const card=document.querySelector('#hover-card'),r=card.getBoundingClientRect();return{id:card.dataset.answerId,width:r.width,height:r.height,top:r.top,x:r.x,scrollTop:document.querySelector('#answer-text').scrollTop,author:document.querySelector('#answer-author').textContent};});
 assert.equal(next.id,'131055050');assert.equal(next.author,'Mandelbrot');assert.equal(next.scrollTop,0);assert.deepEqual([first.width,first.height,first.top,first.x],[next.width,next.height,next.top,next.x]);
 await page.click('#expand-hover');
 await page.waitForFunction(()=>{const img=document.querySelector('#detail-body img');return img?.complete&&img.naturalWidth>0;},undefined,{timeout:15000});
 const images=await page.evaluate(()=>[...document.querySelectorAll('#detail-body img')].map(img=>({src:img.src,loaded:img.complete&&img.naturalWidth>0})));
 const dimensions=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,body:document.querySelector('#detail-body').clientHeight}));assert.equal(dimensions.overflow,false);assert.ok(dimensions.body>100);
 return {card:{width:first.width,height:first.height},switching:true,firstImageLoaded:images[0].loaded,images:images.length};
}
