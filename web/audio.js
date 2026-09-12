// Original, locally synthesized soundscape. No external media or network requests.
const clamp=x=>Math.max(0,Math.min(1,Number(x)||0));
export class PlanetAudio {
 constructor(settings={},save=()=>{}){this.settings={enabled:true,master:.3,ambient:.65,effects:.75,transitions:.6,...settings};this.save=save;this.context=null;this.active=new Set();this.events=[];this.scene='home';this.lastCue={};this.ready=false;}
 async unlock(){
  if(!this.settings.enabled)return;
  try{if(!this.context){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;this.initialize(new C());}await this.context.resume();this.ready=true;this.setScene(this.scene);}catch{this.ready=false;}
 }
 initialize(context){
  this.context=context;const c=context;this.master=c.createGain();this.master.gain.value=this.settings.enabled?this.settings.master:0;
  const compressor=c.createDynamicsCompressor();compressor.threshold.value=-12;compressor.knee.value=16;compressor.ratio.value=8;compressor.attack.value=.008;compressor.release.value=.25;this.master.connect(compressor);compressor.connect(c.destination);this.output=compressor;
  this.ambient=c.createGain();this.ambient.gain.value=0;this.ambient.connect(this.master);this.effects=c.createGain();this.effects.gain.value=this.settings.effects;this.effects.connect(this.master);this.travel=c.createGain();this.travel.gain.value=this.settings.transitions;this.travel.connect(this.master);
  this.noise=this.noiseBuffer(12,411);
  const wind=c.createBufferSource();wind.buffer=this.noise;wind.loop=true;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=580;const gain=c.createGain();gain.gain.value=.19;wind.connect(filter);filter.connect(gain);gain.connect(this.ambient);wind.start();this.wind=wind;
  // Slowly beating open fifths; independent partials keep the bed spacious.
  this.drones=[];
  [130.81,196,261.63,329.63,392].forEach((hz,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=hz;g.gain.value=[.035,.023,.012,.008,.004][i];o.connect(g);g.connect(this.ambient);o.start();const lfo=c.createOscillator(),lg=c.createGain();lfo.frequency.value=.027+i*.007;lg.gain.value=g.gain.value*.24;lfo.connect(lg);lg.connect(g.gain);lfo.start();this.drones.push(o,lfo);});
 }
 noiseBuffer(seconds,seed){const c=this.context,b=c.createBuffer(2,c.sampleRate*seconds,c.sampleRate);for(let channel=0;channel<2;channel++){const a=b.getChannelData(channel);let value=0;for(let i=0;i<a.length;i++){seed=(seed*1664525+1013904223)>>>0;value=.965*value+.035*((seed/4294967296)*2-1);const edge=Math.min(1,i/(c.sampleRate*.12),(a.length-1-i)/(c.sampleRate*.12));a[i]=value*edge;}}return b;}
 ramp(param,value,seconds=.5){const t=this.context.currentTime;if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(t);else{const held=param.value;param.cancelScheduledValues(t);param.setValueAtTime(held,t);}param.setTargetAtTime(value,t,Math.max(.01,seconds/3));}
 setScene(scene){this.scene=scene;if(!this.context)return;const level=scene==='reading'?.398:scene==='travel'?.65:1;this.ramp(this.ambient.gain,this.settings.ambient*.34*level,1.1);}
 update(patch){Object.assign(this.settings,patch);for(const k of ['master','ambient','effects','transitions'])this.settings[k]=clamp(this.settings[k]);this.save({...this.settings});if(this.context){this.ramp(this.master.gain,this.settings.enabled?this.settings.master:0,.15);this.ramp(this.effects.gain,this.settings.effects,.15);this.ramp(this.travel.gain,this.settings.transitions,.15);this.setScene(this.scene);}}
 track(source,gain,duration,bus){const item={source,gain,bus};this.active.add(item);source.onended=()=>{this.active.delete(item);source.disconnect();gain.disconnect();};source.start();source.stop(this.context.currentTime+duration+.08);return item;}
 tone(hz,duration,level=.2,pan=0,bus='effects',{delay=0,endHz=hz*.995}={}){
  const c=this.context,o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner(),start=c.currentTime+delay;o.type='sine';o.frequency.setValueAtTime(hz,start);o.frequency.exponentialRampToValueAtTime(endHz,start+duration);g.gain.setValueAtTime(0,c.currentTime);g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(level,start+.025);g.gain.exponentialRampToValueAtTime(.0001,start+duration);p.pan.value=Math.max(-1,Math.min(1,pan));o.connect(g);g.connect(p);p.connect(this[bus]);const item=this.track(o,g,duration+delay,bus);o.onended=()=>{this.active.delete(item);o.disconnect();g.disconnect();p.disconnect();};
 }
 impact(strength,pan){
  const c=this.context,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),p=c.createStereoPanner(),t=c.currentTime;
  s.buffer=this.noise;f.type='bandpass';f.Q.value=.7;f.frequency.setValueAtTime(950,t);f.frequency.exponentialRampToValueAtTime(180,t+.27);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(strength*1.6,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.3);
  p.pan.value=pan;s.connect(f);f.connect(g);g.connect(p);p.connect(this.effects);
  const item=this.track(s,g,.32,'effects');s.onended=()=>{this.active.delete(item);s.disconnect();f.disconnect();g.disconnect();p.disconnect();};
 }
 sweep(duration=1.5){const c=this.context,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),p=c.createStereoPanner();s.buffer=this.noise;s.loop=true;f.type='bandpass';f.Q.value=.6;f.frequency.setValueAtTime(180,c.currentTime);f.frequency.exponentialRampToValueAtTime(2300,c.currentTime+duration*.65);f.frequency.exponentialRampToValueAtTime(400,c.currentTime+duration);g.gain.setValueAtTime(0,c.currentTime);g.gain.linearRampToValueAtTime(1.7,c.currentTime+duration*.5);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);p.pan.setValueAtTime(-.7,c.currentTime);p.pan.linearRampToValueAtTime(.7,c.currentTime+duration);s.connect(f);f.connect(g);g.connect(p);p.connect(this.travel);const item=this.track(s,g,duration,'travel');s.onended=()=>{this.active.delete(item);s.disconnect();f.disconnect();g.disconnect();p.disconnect();};}
 cue(name,{pan=0,strength=1}={}){
  if(!this.context||!this.settings.enabled||this.context.state!=='running'||!this.settings.master)return false;
  const bus=['enter','ring'].includes(name)?'transitions':'effects';if(!this.settings[bus])return false;
  const t=this.context.currentTime,cooldown={pair:.45,unpair:.4,repel:.7}[name]??.18;
  if(t-(this.lastCue[name]??-10)<cooldown)return false;
  pan=Math.max(-.8,Math.min(.8,Number(pan)||0));strength=clamp(strength);
  this.lastCue[name]=t;this.events.push({name,time:t,pan,strength});if(this.events.length>40)this.events.shift();
  if(name==='enter'){this.tone(49,2,.5,0,'travel');this.tone(146.83,2.8,.14,-.3,'travel');}
  else if(name==='ring'){this.sweep(1.7);this.tone(65.4,1.6,.38,0,'travel');}
  else if(name==='land'){this.tone(130.81,2.7,.17,-.3);this.tone(196,3.2,.10,.3);}
  else if(name==='step'){this.impact(.045*strength,0);}
  else if(name==='focus'){this.tone(392,.9,.13,-.2);this.tone(587.33,1.3,.045,.25);}
  else if(name==='save'){this.tone(261.63,1.3,.2,-.15);this.tone(392,1.8,.09,.15);this.tone(523.25,2.1,.03,.35);}
  else if(name==='pair'){
   this.tone(196,.85,.23,pan-.2);this.tone(293.66,1.05,.17,pan+.2,'effects',{delay:.10});
   this.tone(392,1.4,.13,pan,'effects',{delay:.23});this.tone(784,.8,.025,pan,'effects',{delay:.3});
  }
  else if(name==='unpair'){
   this.tone(392,.42,.14,pan-.15,'effects',{endHz:261.63});
   this.tone(196,.65,.16,pan+.15,'effects',{delay:.06,endHz:146.83});
  }
  else if(name==='repel'){
   this.tone(148,.4,.36*strength,pan,'effects',{endHz:48});
   this.tone(233,.24,.14*strength,pan,'effects',{endHz:139});this.impact(strength,pan);
  }
  else if(name==='leave'){this.tone(146.83,1.1,.10);}
  return true;
 }
 cancelCues(bus){if(!this.context)return;for(const item of this.active)if(!bus||item.bus===bus){this.ramp(item.gain.gain,.0001,.05);try{item.source.stop(this.context.currentTime+.08);}catch{}}}
 cancelTravel(){this.cancelCues('travel');}
 async suspend(){if(!this.context)return;this.cancelCues();await this.context.suspend();}
 async resume(){if(this.ready&&this.settings.enabled){this.master.gain.cancelScheduledValues(this.context.currentTime);this.master.gain.setValueAtTime(0,this.context.currentTime);await this.unlock();this.ramp(this.master.gain,this.settings.master,.8);}}
 dispose(){this.wind?.stop();this.drones?.forEach(o=>o.stop());this.context?.close();this.active.clear();}
 debug(){return{state:this.context?.state||'uninitialized',active:this.active.size,scene:this.scene,settings:{...this.settings},events:[...this.events]};}
}
