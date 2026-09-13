import * as THREE from './vendor/three/three.module.js';

// Original ribbon and shell particles, shared by the composer and public viewpoints.
const vertexShader=`precision highp float;
    attribute vec4 seed;uniform vec2 resolution,center;uniform float radius,time,chaos,dpr,offset;
    uniform mediump float halo;uniform vec2 fieldAxis;uniform float pressure;varying mediump float light,depth;
    mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
    void main(){float group=floor(seed.w/0.74*3.0);float t=time;float v=seed.y*2.0-1.0;vec3 p;float bright;
    if(seed.w<0.74){float phase=group*2.0944+offset;float dir=group==1.0?-1.0:1.0;
      float u=seed.x*6.2831853+t*dir*(0.66+group*0.12);u+=0.62*sin(u-phase-t*0.23);
      float bend=0.5*sin(u*2.0+phase-t*0.40)+0.22*sin(u*3.0-phase+t*0.31);
      float lat=v*0.46+bend*(0.65+chaos*0.75);
      float lon=u+0.4*sin(v*3.0+phase-t*0.35)+chaos*0.2*sin(u*3.0+v*4.0+t*0.65);
      float fold=0.5+0.5*sin(v*4.4+u*2.0+phase-t*0.6);
      float r=0.83+0.155*fold+0.008*(seed.z-0.5);
      p=vec3(cos(lat)*cos(lon),sin(lat),cos(lat)*sin(lon));
      p.xz=rot(chaos*0.95*sin(p.y*3.1+t*0.32+phase))*p.xz;
      p.yz=rot(phase*0.70+0.45+0.18*sin(t*0.27+phase))*p.yz;p.xy=rot(phase*0.31)*p.xy;p=normalize(p)*r;
      float front=pow(0.5+0.5*cos(u*2.0-phase-t*1.3),6.0);
      bright=(0.37+0.4*pow(abs(v),4.0)+front*0.68)*(0.84+0.16*sin(v*78.0+u*9.0+t*1.1));
    }else{float u=seed.x*6.2831853+t*0.31;float lat=asin(v);p=vec3(cos(lat)*cos(u),sin(lat),cos(lat)*sin(u));
      p.xz=rot(0.7*sin(p.y*2.8-t*0.28))*p.xz;p.yz=rot(0.45*sin(p.x*3.0+t*0.32))*p.yz;
      float r=0.997-0.007*seed.z;if(seed.w>0.97)r*=pow(seed.z,0.33);p=normalize(p)*r;bright=seed.w>0.97?0.09:0.19;}
    p.xz=rot(-0.25+t*0.035+offset)*p.xz;p.yz=rot(0.18)*p.yz;
    vec2 shell=vec2(p.x,-p.y);float facing=dot(shell,fieldAxis);
    shell-=fieldAxis*facing*pressure*.13;
    shell+=(shell-fieldAxis*facing)*pressure*.045;
    vec2 point=center+shell*radius;gl_Position=vec4(point/resolution*2.0-1.0,0.,1.);gl_Position.y=-gl_Position.y;
    float size=max(0.85,(0.63+seed.z*0.37)*dpr);gl_PointSize=size*(halo>0.5?5.5:1.0);
    light=bright*(0.48+0.52*smoothstep(-0.9,0.75,p.z));
    light+=pow(max(0.,facing),4.)*pressure*.38;
    if(seed.w>=0.74&&seed.w<0.97)light*=0.65+2.6*pow(1.0-abs(p.z),5.0);
    depth=p.z*0.5+0.5;}`;
const fragmentShader=`precision mediump float;uniform mediump float halo;uniform float glow,opacity,gain;uniform vec3 tint;varying mediump float light,depth;
    void main(){vec2 p=gl_PointCoord*2.0-1.0;float r=dot(p,p);if(r>1.0)discard;
      float a=light*exp(-r*(halo>0.5?3.8:2.4))*(halo>0.5?0.021*glow:0.53)*opacity*gain;
      vec3 c=mix(vec3(.57,.68,.84),vec3(.91,.97,1.),depth)*tint;gl_FragColor=vec4(c*a,1.);}`;

const MAX_PARTICLES=165000;
const HALO_FRACTION=.18;
export function particleBudget(radius,fill=1){
  const full=Math.min(MAX_PARTICLES,Math.max(9000,Math.round(radius*radius*5)));
  const body=Math.round(full*Math.min(1,Math.max(.08,fill)));
  return {full,body,halo:Math.max(1,Math.round(body*HALO_FRACTION))};
}
let sharedSeeds;
function seeds(){
  if(sharedSeeds)return sharedSeeds;
  let rng=982451653;
  const data=new Float32Array(MAX_PARTICLES*4);
  for(let i=0;i<data.length;i++){rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;data[i]=(rng>>>0)/4294967296;}
  // Position is only used to supply a vertex count; the shader derives geometry from seed.
  sharedSeeds=new THREE.InterleavedBuffer(data,4);
  return sharedSeeds;
}
export function createParticleNode(){
  const data=seeds(),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('seed',new THREE.InterleavedBufferAttribute(data,4,0));
  geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));
  const uniforms={resolution:{value:new THREE.Vector2()},center:{value:new THREE.Vector2()},fieldAxis:{value:new THREE.Vector2(1,0)},pressure:{value:0},radius:{value:1},time:{value:0},chaos:{value:1},dpr:{value:1},offset:{value:0},halo:{value:0},glow:{value:1},opacity:{value:1},gain:{value:1},tint:{value:new THREE.Vector3(1,1,1)}};
  const material=new THREE.RawShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,depthTest:false,depthWrite:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendEquation:THREE.AddEquation});
  const haloMaterial=material.clone();haloMaterial.uniforms.halo.value=1;
  // The broad glow previously repeated the complete vertex shader and all body
  // particles. Its separate draw range shares the seed buffer, while sampling
  // fewer points and preserving the same total light contribution.
  const haloGeometry=new THREE.BufferGeometry();
  haloGeometry.setAttribute('seed',geometry.attributes.seed);haloGeometry.setAttribute('position',geometry.attributes.position);
  const group=new THREE.Group();group.add(new THREE.Points(haloGeometry,haloMaterial),new THREE.Points(geometry,material));
  group.children.forEach(points=>points.frustumCulled=false);
  return group;
}
export function updateParticleNode(group,node,width,height,dpr){
  const budget=particleBudget(node.r,node.fill??1);
  group.children[0].geometry.setDrawRange(0,budget.halo);
  group.children[1].geometry.setDrawRange(0,budget.body);
  for(const points of group.children){
    const u=points.material.uniforms;
    u.resolution.value.set(width*dpr,height*dpr);u.center.value.set(node.x*dpr,node.y*dpr);
    u.radius.value=node.r*dpr;u.time.value=node.time;u.chaos.value=node.chaos??1;
    u.dpr.value=dpr;u.offset.value=node.offset??0;u.glow.value=node.glow??1;
    u.opacity.value=node.opacity;u.tint.value.fromArray(node.tint);
    u.fieldAxis.value.fromArray(node.fieldAxis || [1,0]);u.pressure.value=node.pressure || 0;
    u.gain.value=2.2*Math.min(1.9,Math.max(.5,node.r*node.r*4/budget.full))*(u.halo.value?budget.body/budget.halo:1);
  }
}
