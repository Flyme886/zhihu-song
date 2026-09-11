import test from 'node:test';
import assert from 'node:assert/strict';
import {RelationshipEffects} from '../relationship-effects.js';

const planets = () => [{id:'me',x:0,y:0,r:80},{id:'other',x:180,y:0,r:80}];

test('one collision per encounter; settling does not retrigger, pulling away rearms', () => {
  const events=[],fx=new RelationshipEffects(kind=>events.push(kind)),[a,b]=planets();
  assert.equal(fx.contact(a,b,a),true);
  for(let i=0;i<180;i++){b.x=194+Math.sin(i)*3;fx.contact(a,b,a);fx.advance(1/60);}
  assert.deepEqual(events,['repel']);
  b.x=235;fx.contact(a,b,a);
  b.x=180;assert.equal(fx.contact(a,b,a),true);
  assert.deepEqual(events,['repel','repel']);
});

test('restoring a close pair is silent, unrelated pointer movement cannot cause a hit', () => {
  const events=[],fx=new RelationshipEffects(kind=>events.push(kind)),[a,b]=planets();
  fx.contact(a,b,null);fx.contact(a,b,a);
  assert.deepEqual(events,[]);
  b.x=240;fx.contact(a,b,a);b.x=180;fx.contact(a,b,{id:'other-gesture'});
  assert.deepEqual(events,[]);
});

test('reduced motion retains audible feedback but removes transient motion immediately', () => {
  const events=[];let motion=true;
  const fx=new RelationshipEffects(kind=>events.push(kind),()=>motion),[a,b]=planets();
  fx.emit('pair',a,b);fx.advance(.1);assert.ok(fx.appearance(a).scale>1);
  motion=false;fx.advance(.01);fx.emit('unpair',a,b);
  assert.deepEqual(fx.appearance(a),{scale:1,glow:1});
  assert.deepEqual(fx.debug().active,[]);assert.deepEqual(events,['pair','unpair']);
});

test('feedback expires, is bounded, and clears when leaving the world', () => {
  const fx=new RelationshipEffects(),[a,b]=planets();
  for(let i=0;i<30;i++)fx.emit('pair',a,{...b,id:String(i)});
  assert.equal(fx.debug().active.length,12);
  for(let i=0;i<100;i++)fx.advance(.02);
  assert.equal(fx.debug().active.length,0);
  fx.contact(a,b,a);fx.clear();assert.deepEqual(fx.debug(),{active:[],contacts:0});
});

test('disconnecting during the connection animation replaces its visual feedback', () => {
  const fx=new RelationshipEffects(),[a,b]=planets();
  fx.emit('pair',a,b);fx.advance(.1);fx.emit('unpair',a,b);
  assert.deepEqual(fx.debug().active,['unpair']);
});
