import test from 'node:test';
import assert from 'node:assert/strict';
import {relationFor, nearestRelated, followPair, separate, gap} from '../relations.js';

test('free input never inherits example agreement; explicit correction wins', () => {
  const node = {id:'a', exampleRelation:'similar'}, overrides = new Map();
  assert.equal(relationFor(node, false, overrides), 'unknown');
  assert.equal(relationFor(node, true, overrides), 'similar');
  overrides.set('a', 'unrelated');
  assert.equal(relationFor(node, true, overrides), 'unrelated');
});

test('proximity excludes unknown viewpoints and an existing partner', () => {
  const me={x:0,y:0,r:50}, partner={x:110,y:0,r:50}, other={x:170,y:0,r:50}, unknown={x:10,y:0,r:50};
  assert.equal(nearestRelated(me,[me,partner,other,unknown],partner,n=>n===unknown?'unknown':'similar'),other);
  assert.equal(nearestRelated(me,[me,unknown],null,()=> 'unknown'),null);
});

test('pair follows to a finite stable separation across frame rates and long pauses', () => {
  for(const dt of [1/30,1/60,1/120,4]){
    const leader={x:240,y:90}, follower={x:0,y:0}, velocity={x:0,y:0};
    for(let i=0;i<1000;i++)followPair(leader,follower,{x:-190,y:25},dt,velocity);
    assert.ok(Math.abs(follower.x-50)<.01);
    assert.ok(Math.abs(follower.y-115)<.01);
  }
});

test('repulsion yields the other sphere without stealing dragged position', () => {
  const me={x:0,y:0,r:50}, other={x:70,y:0,r:50};
  for(let i=0;i<120;i++)separate(me,other,1/60,me);
  assert.equal(me.x,0);
  assert.ok(gap(me,other)>35.9);
  const same={x:0,y:0,r:50};separate(me,same,1/60,me);
  assert.ok(Number.isFinite(same.x)&&same.x!==0);
});

test('approaching an unconfirmed viewpoint offers a choice without inventing agreement', async () => {
  const {nearestUnconfirmed} = await import('../relations.js');
  const me={id:'me',x:0,y:0,r:50}, near={id:'a',x:135,y:0,r:50}, far={id:'b',x:400,y:0,r:50};
  const overrides=new Map(), classify=n=>relationFor(n,false,overrides);
  assert.equal(nearestUnconfirmed(me,[me,near,far],classify),near);
  assert.equal(classify(near),'unknown');
  overrides.set('a','unrelated');
  assert.equal(nearestUnconfirmed(me,[me,near,far],classify),null);
});

test('the nearest unknown sphere can be chosen even beside a previously classified viewpoint', async () => {
  const {nearestEncounter}=await import('../relations.js');
  const me={id:'me',x:0,y:0,r:50}, known={id:'a',x:-150,y:0,r:50}, unknown={id:'b',x:115,y:0,r:50};
  const classify=n=>n===known?'similar':'unknown';
  assert.equal(nearestEncounter(me,[me,known,unknown],null,classify),unknown);
  unknown.x=190;
  assert.equal(nearestEncounter(me,[me,known,unknown],null,classify),known);
});
