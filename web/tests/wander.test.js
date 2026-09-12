import test from 'node:test';
import assert from 'node:assert/strict';
import {Walker,findPath,walkable,memoryPosition,memoryLayout,terrainHeight,SPAWN,WORLD_RADIUS} from '../wander-controller.js';
import {parseRoute} from '../history.js';

test('walking and running cover consistent distance across frame rates without leaving the island',()=>{
 const distances=[];for(const rate of [30,60,120]){const w=new Walker();for(let i=0;i<rate*3;i++)w.update(1/rate,{z:-1});assert.ok(walkable(w.x,w.z));distances.push(SPAWN.z-w.z);}
 assert.ok(Math.max(...distances)-Math.min(...distances)<.1);
 const run=new Walker();for(let i=0;i<180;i++)run.update(1/60,{z:-1,run:true});assert.ok(SPAWN.z-run.z>distances[0]*1.5);
 for(let i=0;i<10000;i++)run.update(1/60,{z:1,run:true});assert.ok(Math.hypot(run.x,run.z+8)<WORLD_RADIUS);
});

test('manual movement slides along solid obstacles and a reading panel stops movement immediately',()=>{
 const w=new Walker({x:0,z:4},[{x:0,z:0,r:1}]);for(let i=0;i<300;i++)w.update(1/60,{z:-1});assert.ok(w.z>=1.38);
 const before=w.snapshot();w.update(.05,{z:-1,run:true},true);assert.deepEqual(w.snapshot(),before);assert.equal(w.speed,0);assert.equal(w.path.length,0);
});

test('click to walk finds and completes a route around a blocking bench',()=>{
 const obstacles=[{x:0,z:0,r:2}],w=new Walker({x:0,z:6},obstacles);const route=findPath(w,{x:0,z:-6},obstacles);assert.ok(route.length>0);assert.ok(route.some(p=>Math.abs(p.x)>2));w.goTo({x:0,z:-6});
 for(let i=0;i<1600;i++){w.update(1/60);assert.ok(walkable(w.x,w.z,obstacles));}
 assert.ok(Math.hypot(w.x,w.z+6)<.4);assert.equal(w.path.length,0);
});

test('saved coordinates and camera restore safely; invalid or occupied coordinates recover',()=>{
 const w=new Walker({x:NaN,z:Infinity,yaw:NaN,pitch:300});assert.deepEqual({x:w.x,z:w.z},{x:SPAWN.x,z:SPAWN.z});assert.ok(Number.isFinite(w.yaw));assert.equal(w.pitch,.75);
 const occupied=new Walker({x:21,z:-13});assert.ok(walkable(occupied.x,occupied.z));occupied.yaw=1.5;assert.deepEqual(new Walker(occupied.snapshot()).snapshot(),occupied.snapshot());
});

test('a reachable click near a trunk does not fail when its rounded grid cell is occupied',()=>{
 const obstacles=[{x:0,z:0,r:1}],w=new Walker({x:0,z:6},obstacles),target={x:0,z:1.45};
 assert.equal(w.goTo(target),true);for(let i=0;i<600;i++)w.update(1/60);
 assert.ok(Math.hypot(w.x-target.x,w.z-target.z)<.4);assert.ok(walkable(w.x,w.z,obstacles));
});

test('memory placement stays stable when records are added, sorted, or removed',()=>{
 const original=[{id:'canteen-case',kind:'cases'},{id:'personal:records:test:123',kind:'records'},{id:'living-room-record',kind:'records'}];const before=new Map(original.map(i=>[i.id,memoryPosition(i)]));
 for(const item of [...original].reverse())assert.deepEqual(memoryPosition(item),before.get(item.id));assert.notDeepEqual(memoryPosition(original[0]),memoryPosition(original[2]));for(const item of original){const p=memoryPosition(item);assert.ok(Number.isFinite(terrainHeight(p.x,p.z)));}
});

test('story and map deep links coexist with existing history detail links',()=>{
 assert.deepEqual(parseRoute('#/planet/story/cat-art-record',[]),{view:'planet',storyId:'cat-art-record'});
 assert.deepEqual(parseRoute('#/planet/map',[]),{view:'planet',overlay:'map'});
 assert.deepEqual(parseRoute('#/planet/records/old-id',[]),{view:'planet',section:'records',itemId:'old-id'});
});

test('large histories form bounded spatial clusters without dropping or moving records',()=>{
 const items=Array.from({length:1200},(_,i)=>({id:`record-${i}`,kind:['cases','records','opinions'][i%3]}));
 const layout=memoryLayout(items);assert.ok(layout.length<90);
 assert.deepEqual(layout.flatMap(i=>i.members||[i]).map(i=>i.id).sort(),items.map(i=>i.id).sort());
 const next=memoryLayout([...items,{id:'another',kind:'records'}]);for(const item of layout.filter(i=>i.cluster)){const match=next.find(i=>i.id===item.id);if(match)assert.deepEqual(memoryPosition(match),memoryPosition(item));}
});
