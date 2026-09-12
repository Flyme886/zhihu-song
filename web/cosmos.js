import * as THREE from './vendor/three/three.module.js';
import {createParticleNode,updateParticleNode} from './world-particles.js';
import {WanderWorld} from './wander-world.js';

const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export function surfaceLandmarkTargets(width,height,widths=[]){
 const mobile=width<=700;
 return [0,1,2].map(i=>{
  const margin=(widths[i]||(mobile?120:190))/2+20;
  const x=clamp(width*[mobile?.19:.24,.5,mobile?.81:.76][i],margin,width-margin);
  // Keep the full label above the history navigation in short viewports.
  const y=Math.min(height*(mobile?(i===1?.525:.555):(i===1?.555:.59)),height-(mobile?360:250));
  return {x,y:Math.max(height*.525,y)};
 });
}

function random(seed=5931){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function makeStars(count,spread,seed){
 const rng=random(seed),positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count);
 for(let i=0;i<count;i++){const z=rng()*2-1,a=rng()*Math.PI*2,r=spread*(.7+rng()*.3);positions.set([Math.sqrt(1-z*z)*Math.cos(a)*r,Math.sqrt(1-z*z)*Math.sin(a)*r,z*r],i*3);const light=.25+rng()*.75;colors.set([light*(.7+rng()*.3),light*.82,light],i*3);sizes[i]=.5+rng()*1.2;}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('size',new THREE.BufferAttribute(sizes,1));
 const material=new THREE.ShaderMaterial({uniforms:{dpr:{value:1},alpha:{value:1}},vertexShader:'attribute vec3 color;attribute float size;varying vec3 c;uniform float dpr;void main(){c=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*dpr;}',fragmentShader:'varying vec3 c;uniform float alpha;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(c,alpha*(1.-smoothstep(.12,.5,d)));}',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});return new THREE.Points(geometry,material);
}

export class CosmosRenderer {
 constructor(canvas){
  this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});this.renderer.setClearColor(0xdde9e5,1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.camera=new THREE.PerspectiveCamera(49,1,.1,800);this.world=new THREE.Scene();this.time=0;this.focus=0;this.targetFocus=0;this.pulse=0;this.quality='high';this.qualityMode='auto';this.frames=[];this.transitions=0;
  this.wander=new WanderWorld(this.renderer,this.camera);this.surface=this.wander.scene;this.buildWorld();this.stats={frames:0,p95:0,quality:this.quality};
 }
 buildWorld(){this.worldNodes=[];this.worldStars=makeStars(2000,110,902);this.world.add(this.worldStars);}
 createWorldNode(){const node=createParticleNode();this.world.add(node);this.worldNodes.push(node);return node;}
 setLandmarkBounds(widths){if(this.wander)return;if(widths.every((width,i)=>width===this.landmarkWidths[i]))return;this.landmarkWidths=[...widths];this.fitLandmarks();}
 fitLandmarks(){
  if(!this.width||!this.beacons?.length)return;
  // Fit the real beacons on the ground plane using the resting camera. The DOM
  // labels receive their projection; neither layer needs an independent clamp.
  const camera=new THREE.PerspectiveCamera(this.mobile?55:48,this.width/this.height,.1,400);
  camera.position.set(0,1,6);camera.lookAt(0,1,-23);camera.updateMatrixWorld();
  const targets=surfaceLandmarkTargets(this.width,this.height,this.landmarkWidths),ray=new THREE.Vector3();
  const positions=this.memories.geometry.attributes.position;
  this.beacons.forEach((beacon,i)=>{
   const old=beacon.position.clone(),target=targets[i];
   ray.set(target.x/this.width*2-1,1-target.y/this.height*2,.5).unproject(camera).sub(camera.position).normalize();
   const distance=(-1-camera.position.y)/ray.y;
   beacon.position.copy(camera.position).addScaledVector(ray,distance);
   for(let j=i*36;j<(i+1)*36;j++){positions.setX(j,positions.getX(j)+beacon.position.x-old.x);positions.setZ(j,positions.getZ(j)+beacon.position.z-old.z);}
  });positions.needsUpdate=true;
 }
 resize(width,height){this.width=width;this.height=height;this.mobile=width<=700;this.dpr=Math.min(devicePixelRatio||1,this.quality==='low'?1:this.mobile?1.25:1.5);this.worldStars.material.uniforms.dpr.value=this.dpr;this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();if(!this.wander)this.fitLandmarks();}
 setCounts(counts){this.counts={...counts};}

 burst(){this.pulse=1;}
 setFocus(section){this.targetFocus={opinions:-1,cases:0,records:1}[section]||0;}
 frame(view,progress,dt,paused=false,reduced=false){
  this.renderer.setClearColor(0xdde9e5,1);this.wander.update(view,progress,dt,paused,reduced);this.pulse=reduced?0:Math.max(0,this.pulse-dt);this.recordFrame(dt);
 }

 render(nodes){
  this.renderer.setClearColor(0x03060b,0);
  // Background uses the camera; opinion particles keep exact screen-space hit targets.
  this.camera.fov=42;this.camera.position.set(0,0,10);this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();
  nodes.forEach((n,i)=>{const mesh=this.worldNodes[i]||this.createWorldNode();mesh.visible=true;updateParticleNode(mesh,n,this.width,this.height,this.dpr);});
  for(let i=nodes.length;i<this.worldNodes.length;i++)this.worldNodes[i].visible=false;
  this.renderer.render(this.world,this.camera);
 }
 projectLandmarks(){if(this.wander)return ['opinions','cases','records'].map(k=>this.wander.project({opinions:{x:0,z:-34},cases:{x:-22,z:-7},records:{x:22,z:-12}}[k]));return this.beacons.map(b=>{const p=b.position.clone().project(this.camera);return{x:(p.x*.5+.5)*this.width,y:(-p.y*.5+.5)*this.height-12.5,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1};});}
 projectPlanet(){if(this.wander)return null;const p=this.planet.position.clone().project(this.camera);const distance=this.camera.position.distanceTo(this.planet.position);return{x:(p.x*.5+.5)*this.width,y:(-p.y*.5+.5)*this.height,r:1.58*this.height/(2*distance*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)))};}
 recordFrame(dt){if(dt<=0||dt>.25)return;this.stats.frames++;this.frames.push(dt*1000);if(this.frames.length>180)this.frames.shift();if(this.stats.frames%180===0){const sorted=[...this.frames].sort((a,b)=>a-b);this.stats.p95=sorted[Math.floor(sorted.length*.95)]||0;this.stats.median=sorted[Math.floor(sorted.length*.5)]||0;this.stats.fps=1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length);if(this.stats.p95>35&&this.quality!=='low'&&this.qualityMode==='auto'){this.quality='low';this.stats.quality='low';this.wander?.setQuality('low');this.resize(this.width,this.height);}}}

 setQuality(value){this.qualityMode=['auto','high','low'].includes(value)?value:'auto';this.quality=value==='low'?'low':'high';this.stats.quality=this.quality;this.wander.setQuality(this.quality);if(this.width&&this.height)this.resize(this.width,this.height);}
 getStats(){return{...this.stats,memory:{...this.renderer.info.memory},drawCalls:this.renderer.info.render.calls,points:this.renderer.info.render.points,texturesReady:this.wander?.assets.landscape==='ready',wander:this.wander?.debug()};}
 dispose(){this.wander?.dispose();this.world.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});this.renderer.dispose();}
}
