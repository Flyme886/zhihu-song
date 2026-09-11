import assert from 'node:assert/strict';

// Real Web Audio renders the exact production cues offline. Only the context's
// state getter is adapted because an offline context schedules before rendering.
export async function verifySoundSynthesis(page) {
  const result=await page.evaluate(async()=>{
    const {PlanetAudio}=await import('/audio.js'),renders=[];
    for(const name of ['pair','unpair','repel']){
      const context=new OfflineAudioContext(2,44100*3,44100);
      const audio=new PlanetAudio({ambient:0});audio.initialize(context);
      audio.context=new Proxy(context,{get(target,key){if(key==='state')return 'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
      const played=audio.cue(name,{pan:.25,strength:1}),duplicate=audio.cue(name);
      const rendered=await context.startRendering(),data=rendered.getChannelData(0);
      let peak=0,energy=0,tail=0,finite=true;
      for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));energy+=data[i]**2;finite&&=Number.isFinite(data[i]);if(i>44100*2.5)tail+=data[i]**2;}
      renders.push({name,played,duplicate,peak,rms:Math.sqrt(energy/data.length),tailRms:Math.sqrt(tail/(44100*.5)),finite,active:audio.active.size});
    }
    return renders;
  });
  for(const r of result){assert.ok(r.played);assert.equal(r.duplicate,false);assert.ok(r.finite);assert.ok(r.peak>.015&&r.peak<.5);assert.ok(r.rms>.001);assert.ok(r.tailRms<.0001);assert.equal(r.active,0);}
  assert.equal(new Set(result.map(r=>r.rms)).size,3);
  return result;
}

export async function verifyInteractionAudio(page) {
  const audio=await page.evaluate(()=>planetDiagnostics().audio);
  assert.equal(audio.state,'running');
  for(const name of ['pair','unpair','repel'])assert.ok(audio.events.some(e=>e.name===name),`${name} must reach the running audio engine`);
  const repel=audio.events.filter(e=>e.name==='repel');
  for(let i=1;i<repel.length;i++)assert.ok(repel[i].time-repel[i-1].time>=.7);
  return audio.events.filter(e=>['pair','unpair','repel'].includes(e.name));
}

// Run after the interaction check, with an existing personal opinion in the
// isolated browser session. Exercise the browser's real suspended AudioContext.
export async function verifyPlaybackControls(page) {
  const before=await page.evaluate(()=>planetDiagnostics().audio.events.length);
  await page.click('#sound-toggle');
  await page.press('[data-node="flight"]','Enter');await page.click('#detail-pair');
  await page.click('#unlink');
  assert.equal(await page.evaluate(()=>planetDiagnostics().audio.events.length),before);
  await page.click('#sound-toggle');
  await page.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await page.waitForFunction(()=>document.querySelector('#app').dataset.paused==='true');
  await page.press('[data-node="flight"]','Enter');await page.click('#detail-pair');
  assert.deepEqual(await page.evaluate(()=>planetDiagnostics().interactions.active),[]);
  assert.equal(await page.evaluate(()=>document.querySelector('#app').dataset.paired),'true');
  const pairs=await page.evaluate(()=>planetDiagnostics().audio.events.filter(e=>e.name==='pair').length);
  await page.evaluate(()=>{location.hash='/home';});await page.waitForFunction(()=>document.body.dataset.view==='home');
  await page.evaluate(()=>{location.hash='/world/snail';});await page.waitForFunction(()=>document.querySelector('#app').dataset.paired==='true'&&document.body.dataset.view==='world');
  assert.equal(await page.evaluate(()=>planetDiagnostics().audio.events.filter(e=>e.name==='pair').length),pairs);
  await page.evaluate(async()=>{
    const {PlanetAudio}=await import('/audio.js'),debug=PlanetAudio.prototype.debug;
    PlanetAudio.prototype.debug=function(){window.__liveAudio=this;return debug.call(this);};
    planetDiagnostics();PlanetAudio.prototype.debug=debug;
    await window.__liveAudio.context.suspend();delete window.__liveAudio;
  });
  const previous=await page.evaluate(()=>planetDiagnostics().audio.events.filter(e=>e.name==='unpair').length);
  await page.click('#unlink');
  await page.waitForFunction(count=>planetDiagnostics().audio.events.filter(e=>e.name==='unpair').length===count+1,previous);
  assert.deepEqual(await page.evaluate(()=>window.__qaErrors),[]);
  return {muted:true,reducedMotion:true,silentRestore:true,resumedFirstCue:true};
}
