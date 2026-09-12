import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {CosmosRenderer,surfaceLandmarkTargets} from '../cosmos.js';
import {createParticleNode,updateParticleNode,particleBudget} from '../world-particles.js';
import {RelationshipEffects} from '../relationship-effects.js';

function surface(width,height,widths){
  const renderer=Object.create(CosmosRenderer.prototype);
  Object.assign(renderer,{width,height,mobile:width<=700,landmarkWidths:widths});
  renderer.beacons=[-7,0,7].map((x,i)=>{const g=new THREE.Group();g.position.set(x,-1,i===1?-18:-14);return g;});
  renderer.memories={geometry:new THREE.BufferGeometry()};
  renderer.memories.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(108*3),3));
  renderer.camera=new THREE.PerspectiveCamera(renderer.mobile?55:48,width/height,.1,400);
  renderer.camera.position.set(0,1,6);renderer.camera.lookAt(0,1,-23);renderer.camera.updateMatrixWorld();
  renderer.fitLandmarks();
  return renderer;
}

test('landmark labels and real beacon cores share safe screen coordinates at narrow and wide sizes',()=>{
  for(const [width,height] of [[390,844],[390,700],[700,800],[701,800],[914,900],[1440,900],[914,600]]){
    const widths=width<=700?[104,120,104]:[150,190,150],renderer=surface(width,height,widths);
    const projected=renderer.projectLandmarks(),targets=surfaceLandmarkTargets(width,height,widths);
    projected.forEach((p,i)=>{
      assert.equal(p.visible,true,`${width}px landmark ${i} visible`);
      assert.ok(p.x-widths[i]/2>=19.99&&p.x+widths[i]/2<=width-19.99);
      assert.ok(Math.abs(p.x-targets[i].x)<.01);
      assert.ok(Math.abs(p.y+12.5-targets[i].y)<.01,'DOM beacon centre exactly matches 3D core');
      assert.ok(renderer.beacons[i].position.z>-85,'beacon remains in front of backdrop');
    });
  }
});

test('resizing landmarks preserves each memory cluster offset from its beacon',()=>{
  const renderer=surface(914,900,[150,190,150]);
  const before=renderer.beacons.map((b,i)=>renderer.memories.geometry.attributes.position.getX(i*36)-b.position.x);
  renderer.width=390;renderer.height=844;renderer.mobile=true;renderer.setLandmarkBounds([104,120,104]);
  renderer.beacons.forEach((b,i)=>assert.ok(Math.abs(renderer.memories.geometry.attributes.position.getX(i*36)-b.position.x-before[i])<.0001));
});

test('halo renders fewer particles while retaining body density and sharing the same seed buffer',()=>{
  const group=createParticleNode(),node={x:200,y:200,r:130,time:0,opacity:1,tint:[1,1,1],fill:.6};
  updateParticleNode(group,node,914,900,1.5);
  const budget=particleBudget(node.r,node.fill),[halo,body]=group.children;
  assert.equal(body.geometry.drawRange.count,budget.body);
  assert.equal(halo.geometry.drawRange.count,budget.halo);
  assert.ok(budget.body+budget.halo<budget.body*1.19);
  assert.equal(halo.geometry.attributes.seed.data,body.geometry.attributes.seed.data);
  assert.ok(Math.abs(halo.material.uniforms.gain.value*budget.halo-body.material.uniforms.gain.value*budget.body)<.001);
  assert.equal(particleBudget(1000).body,165000);
});

test('connection gathers before its persistent bridge appears and settles within 840ms',()=>{
  const fx=new RelationshipEffects(),a={id:'a'},b={id:'b'};
  fx.emit('pair',a,b);assert.equal(fx.bridgeVisibility(a,b),0);
  fx.advance(.1);fx.advance(.1);assert.equal(fx.bridgeVisibility(a,b),0);
  fx.advance(.1);assert.ok(fx.bridgeVisibility(a,b)>0&&fx.bridgeVisibility(a,b)<.2);
  for(let i=0;i<6;i++)fx.advance(.1);
  assert.deepEqual(fx.debug().active,[]);assert.equal(fx.bridgeVisibility(a,b),1);
});

test('repulsion compression and rebound are visual only and expire in 780ms',()=>{
  const fx=new RelationshipEffects(),a={id:'a',x:0,y:0,r:80},b={id:'b',x:180,y:0,r:80};
  const original=JSON.stringify([a,b]);fx.emit('repel',a,b);fx.advance(.1);
  assert.ok(fx.appearance(a).scale<1);
  fx.advance(.1);fx.advance(.1);assert.ok(fx.appearance(a).scale>1);
  for(let i=0;i<5;i++)fx.advance(.1);
  assert.deepEqual(fx.appearance(a),{scale:1,glow:1});assert.equal(JSON.stringify([a,b]),original);
});


test('reduced motion removes a save pulse immediately and does not replay it later',()=>{
  const renderer=surface(914,900,[150,190,150]);
  const calls=[];
  Object.assign(renderer,{time:4,pulse:1,wander:{update(...args){calls.push(args);}},renderer:{setClearColor(){}},recordFrame(){}});
  renderer.frame('planet',1,1/60,true,true);
  assert.equal(renderer.pulse,0);assert.equal(renderer.time,4);
  assert.deepEqual(calls[0],['planet',1,1/60,true,true]);
  renderer.frame('planet',1,1/60,false,false);
  assert.equal(renderer.pulse,0);assert.deepEqual(calls[1],['planet',1,1/60,false,false]);
});
