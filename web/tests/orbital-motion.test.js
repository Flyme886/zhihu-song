import test from 'node:test';
import assert from 'node:assert/strict';
import {PairOrbit, portalLayout, fieldPressure, pairOffset, dragThroughField} from '../orbital-motion.js';
import {followPair} from '../relations.js';
import {CelestialScene} from '../celestial-scene.js';

test('binary orbit preserves separation and centre across frame rates without winding indefinitely', () => {
  for (const hz of [24, 30, 60, 120]) {
    const a = {x: -110, y: -30}, b = {x: 110, y: 30}, orbit = new PairOrbit();
    const distance = Math.hypot(b.x - a.x, b.y - a.y), angle = Math.atan2(b.y - a.y, b.x - a.x);
    for (let i = 0; i < hz * 120; i++) orbit.advance(a, b, 1 / hz);
    assert.ok(Math.abs(a.x + b.x) < 1e-8 && Math.abs(a.y + b.y) < 1e-8);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - distance) < 1e-7);
    assert.ok(Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - angle) < .41);
    const before = JSON.stringify([a, b, orbit]);
    for (let i = 0; i < 100; i++) orbit.advance(a, b, .1, false);
    assert.equal(JSON.stringify([a, b, orbit]), before, 'dragging, reading or pause must freeze the orbit');
  }
});

test('discussion layout keeps both spheres inside the space beside or above the reading panel', () => {
  for (const [w,h,panel] of [[1140,900,{left:700,top:0,height:900}],[980,720,{left:540,top:0,height:720}],[390,844,{left:0,top:253,height:591}],[360,740,{left:0,top:222,height:518}],[724,742,{left:0,top:223,height:519}]]) {
    const f=portalLayout(w,h,panel),right=f.side?panel.left:w,bottom=f.side?h:panel.top;
    for(const p of [f.source,f.target]) {
      assert.ok(p.x-f.planetRadius>=0 && p.x+f.planetRadius<=right);
      assert.ok(p.y-f.planetRadius>=0 && p.y+f.planetRadius+30<=bottom);
    }
    assert.ok(f.radius > 30);
  }
});

test('force appearance is bounded at exact overlap and fades out before leaving an encounter', () => {
  const a={x:0,y:0,r:80},b={x:0,y:0,r:60};
  assert.equal(fieldPressure(a,b),1);
  b.x=200;assert.ok(fieldPressure(a,b)>0&&fieldPressure(a,b)<1);
  b.x=500;assert.equal(fieldPressure(a,b),0);
});

test('pair formation chooses room for the companion and converges while its orbit turns', () => {
  const a={x:0,y:0,r:70,sx:490,sy:360,sr:70},b={x:180,y:-60,r:43};
  const neighbors=[{x:180,y:0,r:43},{x:180,y:90,r:43}];
  let offset=pairOffset(a,b,[a,b,...neighbors],{width:980,top:250,bottom:540});
  assert.ok(offset.x<0,'crowded right side should leave the left side for the companion');
  const orbit=new PairOrbit(),velocity={x:0,y:0};
  for(let i=0;i<180;i++){
    followPair(a,b,offset,1/60,velocity);
    const turn=orbit.advance(a,b,1/60),c=Math.cos(turn),s=Math.sin(turn);
    offset={x:offset.x*c-offset.y*s,y:offset.x*s+offset.y*c};
  }
  assert.ok(Math.hypot(b.x-a.x-offset.x,b.y-a.y-offset.y)<.1);
});

test('confirmed force resists inward movement while release and tangential motion remain free', () => {
  const a={x:0,y:0,r:70},b={x:150,y:0,r:50};
  const inward=dragThroughField(a,20,10,[b]);
  assert.ok(inward.x>0&&inward.x<20);assert.equal(inward.y,10);
  assert.deepEqual(dragThroughField(a,-20,10,[b]),{x:-20,y:10});
  assert.deepEqual(dragThroughField(a,20,10,[]),{x:20,y:10});
});

const makeScene = enabled => new CelestialScene({width:100,height:100,getContext:()=>({clearRect(){}})},enabled);
test('changing motion preferences cancels transient arrivals and flights without changing discussion anchors', () => {
  let enabled=true;const scene=makeScene(()=>enabled),a={id:'a',sx:50,sy:150,sr:40},b={id:'b',sx:350,sy:150,sr:40};
  scene.enter();scene.emit('pair',a,b);scene.open(a,b);scene.message(a);
  scene.layout(500,800,{left:0,top:240,height:560});scene.advance(.1);
  enabled=false;scene.advance(.1);
  assert.equal(scene.intro,null);assert.equal(scene.flights.length,0);assert.equal(scene.pulses.length,0);
  assert.deepEqual(scene.project(a,0,0,0),{...scene.portalFrame.source,r:scene.portalFrame.planetRadius});
  scene.close();enabled=true;scene.advance(.1);assert.equal(scene.flights.length,0);
});

test('interrupting entry, rapid reentry, and leaving discard old space effects', () => {
  const scene=makeScene(()=>true),a={id:'a'},b={id:'b'};
  scene.enter();scene.advance(.1);scene.interrupt();assert.equal(scene.intro,null);
  scene.open(a,b);for(let i=0;i<30;i++){scene.message(a);scene.emit('repel',a,b);}
  assert.equal(scene.flights.length,8);assert.equal(scene.pulses.length,5);
  scene.clear();assert.equal(scene.portal,null);assert.equal(scene.flights.length,0);assert.equal(scene.pulses.length,0);
  scene.enter();for(let i=0;i<25;i++)scene.advance(.1);assert.equal(scene.intro,null);
});
