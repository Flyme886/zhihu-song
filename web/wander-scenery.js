import * as THREE from './vendor/three/three.module.js';
import {terrainHeight,pathDistance,TREE_POSITIONS,OBSTACLES} from './wander-controller.js';

// Deterministic scenery: rebuilding the scene never moves a saved memory or path.
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const surface=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.94,...extra});
const noiseGLSL=`
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float grain(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}`;

export function meadowMaterial(){
 const mat=surface(0xffffff);
 mat.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 meadowPosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nmeadowPosition=position;');
  shader.fragmentShader='varying vec3 meadowPosition;\n'+noiseGLSL+'\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 p=meadowPosition.xz;
   float track=min(min(abs(length(vec2(p.x,p.y+8.))-29.),abs(p.x-2.*sin(p.y*.08))),abs(p.y+9.+.13*p.x));
   float broad=grain(p*.21),fine=grain(p*9.),speck=grain(p*43.);
   float edge=track+(grain(p*2.3)-.5)*.48;
   float lawn=smoothstep(1.08,2.02,edge);
   vec3 green=mix(vec3(.125,.18,.066),vec3(.275,.325,.135),broad);
   vec3 earth=mix(vec3(.39,.305,.185),vec3(.53,.447,.30),grain(p*.65));
   diffuseColor.rgb*=mix(earth,green,lawn)*(.89+.16*fine+.09*speck);
  `);
 };
 return mat;
}

function geometry(vertices){
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();return geo;
}

// Curved petals have a lifted rim and tapered tips rather than flat triangles.
export function wildflowerGeometry(){
 const verts=[];
 for(let petal=0;petal<8;petal++){
  const angle=petal/8*Math.PI*2;
  const point=(t,side)=>{const r=.022+t*.17,w=Math.sin(t*Math.PI)*.050*side;return[Math.cos(angle)*r-Math.sin(angle)*w,.49+Math.sin(t*Math.PI)*.025+t*t*.052,Math.sin(angle)*r+Math.cos(angle)*w];};
  for(let k=0;k<4;k++){const a=point(k/4,-1),b=point((k+1)/4,-1),c=point((k+1)/4,1),d=point(k/4,1);verts.push(...a,...c,...b,...a,...d,...c);}
 }
 return geometry(verts);
}

export function buildUnderstory(scene,wind){
 const rng=random(91832),dummy=new THREE.Object3D(),col=new THREE.Color();
 const verts=[];
 for(let i=0;i<4;i++){
  const a=i*2.4,h=.22+i*.05,dx=Math.cos(a),dz=Math.sin(a);
  const point=(t,side)=>{const lean=t*t*.18,width=(1-t)*.017*side;return[dx*lean-dz*width,h*t,dz*lean+dx*width];};
  for(let k=0;k<3;k++){const a=point(k/3,-1),b=point((k+1)/3,-1),c=point((k+1)/3,1),d=point(k/3,1);verts.push(...a,...b,...c,...a,...c,...d);}
 }
 const mat=surface(0xffffff,{side:THREE.DoubleSide});
 mat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{meadowTime:wind.time,meadowWind:wind.amount});
  shader.vertexShader='uniform float meadowTime,meadowWind;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vec3 origin=instanceMatrix[3].xyz;transformed.x+=sin(meadowTime*1.1+origin.x*.4+origin.z*.3)*position.y*position.y*.27*meadowWind;`);
 };
 const grass=new THREE.InstancedMesh(geometry(verts),mat,32000);
 let n=0;while(n<grass.instanceMatrix.count){
  const x=(rng()-.5)*108,z=(rng()-.5)*108-10;
  if(pathDistance(x,z)<1.45||OBSTACLES.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+.2))continue;
  dummy.position.set(x,terrainHeight(x,z)-.025,z);dummy.rotation.set(0,rng()*6.28,0);dummy.scale.setScalar(.65+rng()*1.2);dummy.updateMatrix();grass.setMatrixAt(n,dummy.matrix);
  col.set([0x6b793d,0x879151,0xa4a165,0x626f38,0xb5ac72][Math.floor(rng()*5)]);grass.setColorAt(n++,col);
 }
 grass.receiveShadow=true;scene.add(grass);
 const stones=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),surface(0xc5b99b),420);
 for(let i=0;i<420;i++){
  const z=(rng()-.5)*89-8,x=2*Math.sin(z*.08)+(rng()-.5)*2.6;
  dummy.position.set(x,terrainHeight(x,z),z);dummy.rotation.set(rng(),rng()*6.28,rng());const s=.025+rng()*.055;dummy.scale.set(s*1.4,s*.45,s);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);
 }stones.receiveShadow=true;scene.add(stones);
 return grass;
}

export function buildGrove(scene){
 const rng=random(75219),dummy=new THREE.Object3D(),col=new THREE.Color(),up=new THREE.Vector3(0,1,0);
 // Leaf-shaped geometry, batched into a single draw call for the whole grove.
 const leaf=geometry([0,0,0,-.12,.015,.18,0,.045,.41,0,0,0,0,.045,.41,.12,.015,.18]);
 const foliage=new THREE.InstancedMesh(leaf,surface(0xffffff,{side:THREE.DoubleSide,emissive:0x80713c,emissiveIntensity:.16}),TREE_POSITIONS.length*2800);
 const wood=surface(0x776047),branches=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,7),wood,TREE_POSITIONS.length*13);
 let branchIndex=0,leafIndex=0;
 const branch=(a,b,r1,r2)=>{const direction=b.clone().sub(a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize());dummy.scale.set(r1,direction.length(),r2);dummy.updateMatrix();branches.setMatrixAt(branchIndex++,dummy.matrix);};
 for(const [x,z] of TREE_POSITIONS){
  const ground=terrainHeight(x,z),s=.85+rng()*.35;
  branch(new THREE.Vector3(x,ground,z),new THREE.Vector3(x+.18,ground+5.5*s,z),.19,.22);
  const clusters=[];
  for(let b=0;b<6;b++){
   const a=b*2.4+rng()*.5,r=(1.5+rng()*.8)*s,y=ground+(3.9+rng()*1.8)*s;
   const end=new THREE.Vector3(x+Math.cos(a)*r,y,z+Math.sin(a)*r);
   branch(new THREE.Vector3(x,ground+(2.6+b*.25)*s,z),end,.065,.07);
   const tip=end.clone().add(new THREE.Vector3(Math.cos(a)*.6,.65,Math.sin(a)*.6));branch(end,tip,.028,.035);clusters.push(tip);
  }
  for(let i=0;i<2800;i++){
   const center=clusters[i%clusters.length],a=rng()*6.28,v=rng()*2-1,r=Math.cbrt(rng());
   dummy.position.set(center.x+Math.cos(a)*Math.sqrt(1-v*v)*r*1.55*s,center.y+v*r*1.45*s,center.z+Math.sin(a)*Math.sqrt(1-v*v)*r*1.5*s);
   dummy.rotation.set((rng()-.5)*1.6,rng()*6.28,(rng()-.5)*1.3);dummy.scale.setScalar(.9+rng()*.65);dummy.updateMatrix();foliage.setMatrixAt(leafIndex,dummy.matrix);
   col.set([0xbda05b,0xc99d48,0xd6b867,0x8e994c,0xe0c880,0xa9a163][Math.floor(rng()*6)]);foliage.setColorAt(leafIndex++,col);
  }
 }
 branches.castShadow=true;foliage.castShadow=true;foliage.receiveShadow=true;scene.add(branches,foliage);
 return foliage;
}

export function buildFoothills(scene){
 // Layers hide the hard edge between the traversable ground and distant panorama.
 for(let layer=0;layer<3;layer++){
  const geo=new THREE.PlaneGeometry(510,150,120,24);geo.rotateX(-Math.PI/2);const p=geo.attributes.position;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),z=p.getZ(i)-122-layer*30;
   const swell=Math.pow(Math.max(0,Math.sin((x+layer*24)*.019)),2)*(4+layer*3);
   p.setXYZ(i,x,-2+swell*Math.sin((p.getZ(i)+75)/150*Math.PI)+Math.sin(x*.043+layer)*2,z);
  }
  geo.computeVertexNormals();const hills=new THREE.Mesh(geo,surface([0x899976,0x9ead91,0xb2bfa8][layer]));scene.add(hills);
 }
}
