import * as THREE from './vendor/three/three.module.js';
import {meadowMaterial,wildflowerGeometry,buildUnderstory,buildGrove,buildFoothills} from './wander-scenery.js';
import {Walker,terrainHeight,pathDistance,memoryPosition,OBSTACLES,hashString} from './wander-controller.js';
const rand=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.86,...options});
const mesh=(geo,mat,parent,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m;};
export class WanderWorld{
 constructor(renderer,camera){
  this.renderer=renderer;this.camera=camera;this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog(0xdce4d3,48,225);this.walker=new Walker();this.width=1280;this.height=800;this.time=0;this.keys={};this.blocked=false;this.view='home';this.nearest=null;this.markers=[];this.assets={traveler:'loading',environment:'loading',landscape:'loading'};this.target=new THREE.Vector3();this.look=new THREE.Vector3();this.lastView=null;this.reduced=false;this.quality='high';this.listeners={};
  this.buildSky();this.buildTerrain();this.buildFlowers();this.buildTrees();buildFoothills(this.scene);this.buildProps();this.buildAvatar();this.loadAssets();
 }
 buildSky(){
  const sky=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;void main(){float h=normalize(p).y;vec3 c=mix(vec3(.94,.88,.72),vec3(.42,.68,.85),smoothstep(-.04,.62,h));gl_FragColor=vec4(c,1.);}'});
  mesh(new THREE.SphereGeometry(370,36,24),sky,this.scene);
  this.scene.add(new THREE.HemisphereLight(0xe3f0ff,0x756545,1.65));const sun=new THREE.DirectionalLight(0xffedcf,2.5);sun.position.set(-35,65,30);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-48;sun.shadow.camera.right=48;sun.shadow.camera.top=38;sun.shadow.camera.bottom=-42;sun.shadow.camera.far=170;sun.shadow.bias=-.0005;sun.shadow.normalBias=.04;sun.target.position.set(0,0,-10);this.scene.add(sun,sun.target);this.sun=sun;
  const landscape=new THREE.TextureLoader().load('/assets/planet/daylight/alpine-dream.png',()=>{this.assets.landscape='ready';this.backdrop.visible=true;},undefined,()=>{this.assets.landscape='fallback';this.backdrop.visible=false;});landscape.colorSpace=THREE.SRGBColorSpace;
  this.backdrop=mesh(new THREE.PlaneGeometry(720,405),new THREE.MeshBasicMaterial({map:landscape,fog:false}),this.scene,0,20,-280);this.backdrop.visible=false;
  // The planet and its rings have real depth and move with the camera.
  const planetMat=new THREE.ShaderMaterial({vertexShader:'varying vec3 n,p;void main(){n=normalize(normalMatrix*normal);p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 n,p;void main(){float b=.5+.5*sin(p.y*.8+sin(p.y*1.7+p.x*.12)*.35);vec3 c=mix(vec3(.70,.64,.51),vec3(.85,.80,.68),b);float l=.73+.27*max(0.,dot(normalize(n),normalize(vec3(-.6,.65,1.))));float rim=pow(1.-max(0.,n.z),3.);gl_FragColor=vec4(mix(c*l,vec3(.80,.86,.85),.24+rim*.32),1.);}'});
  this.planet=mesh(new THREE.SphereGeometry(19,64,48),planetMat,this.scene,66,48,-225);
  const ring=new THREE.RingGeometry(24,40,180,1),pos=ring.attributes.position,uv=ring.attributes.uv;for(let i=0;i<pos.count;i++)uv.setXY(i,(Math.hypot(pos.getX(i),pos.getY(i))-24)/16,0);
  const ringMat=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 v;void main(){float r=v.x,b=.5+.5*sin(r*230.);vec3 c=mix(vec3(.44,.54,.65),vec3(.85,.70,.53),smoothstep(.1,.8,r));float a=(.52+b*.3)*smoothstep(0.,.025,r)*(1.-smoothstep(.96,1.,r));a*=1.-.85*exp(-pow((r-.52)*65.,2.));gl_FragColor=vec4(c,a);}'});
  this.ring=mesh(ring,ringMat,this.scene,66,48,-225);this.ring.rotation.set(1.06,.16,-.47);
  const rng=rand(482);for(let i=0;i<22;i++){const angle=i/22*Math.PI*2,x=Math.sin(angle)*165,z=Math.cos(angle)*165;if(z<-90)continue;const ridge=mesh(new THREE.ConeGeometry(20+rng()*22,22+rng()*38,7),material(0xa5b9bc),this.scene,x,8,z);ridge.rotation.y=rng()*3;}
 }
 buildTerrain(){
  const geo=new THREE.PlaneGeometry(230,230,160,160);geo.rotateX(-Math.PI/2);const p=geo.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,terrainHeight(p.getX(i),p.getZ(i)));geo.computeVertexNormals();this.ground=mesh(geo,meadowMaterial(),this.scene);this.ground.receiveShadow=true;
  this.cursor=mesh(new THREE.RingGeometry(.24,.30,32),new THREE.MeshBasicMaterial({color:0xfffaf0,transparent:true,opacity:.85,depthWrite:false}),this.scene);this.cursor.rotation.x=-Math.PI/2;this.cursor.visible=false;
 }
 buildFlowers(){
  const flowerGeo=wildflowerGeometry();
  this.wind={time:{value:0},person:{value:new THREE.Vector3()},amount:{value:1},bloom:{value:new THREE.Vector3()},growth:{value:1}};
  const sway=mat=>{mat.onBeforeCompile=s=>{Object.assign(s.uniforms,{windTime:this.wind.time,person:this.wind.person,windAmount:this.wind.amount,bloomCenter:this.wind.bloom,bloomGrowth:this.wind.growth});s.vertexShader='uniform float windTime,windAmount,bloomGrowth;uniform vec3 person,bloomCenter;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
  vec3 origin=instanceMatrix[3].xyz;float phase=origin.x*.34+origin.z*.29;float h=max(0.,position.y);vec2 diff=origin.xz-person.xz;float dist=length(diff);vec2 push=diff/max(.05,dist)*max(0.,1.-dist/1.8)*.35;
  transformed.xz+=(vec2(sin(windTime*1.25+phase)*.12,cos(windTime*.85+phase)*.04)*windAmount+push)*h*h;
  transformed*=1.-.3*(1.-bloomGrowth)*(1.-smoothstep(0.,4.,length(origin.xz-bloomCenter.xz)));`);};return mat;};
  const count=11000,petals=new THREE.InstancedMesh(flowerGeo,sway(material(0xffffff,{side:THREE.DoubleSide})),count),centers=new THREE.InstancedMesh(new THREE.SphereGeometry(.035,8,5).scale(1,.55,1).translate(0,.505,0),sway(material(0x99783c)),count),stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.006,.009,.49,3).translate(0,.245,0),sway(material(0x657441)),count);
  const matrix=new THREE.Matrix4(),dummy=new THREE.Object3D(),rng=rand(843),color=new THREE.Color();let j=0;
  while(j<count){const x=(rng()-.5)*112,z=(rng()-.5)*112-12;if(pathDistance(x,z)<1.8||OBSTACLES.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+1))continue;if(rng()>(.52+.48*Math.sin(x*.19)*Math.cos(z*.22)))continue;const scale=.48+rng()*.88;dummy.position.set(x,terrainHeight(x,z),z);dummy.rotation.set((rng()-.5)*.2,rng()*6.28,(rng()-.5)*.2);dummy.scale.setScalar(scale);dummy.updateMatrix();matrix.copy(dummy.matrix);petals.setMatrixAt(j,matrix);centers.setMatrixAt(j,matrix);stems.setMatrixAt(j,matrix);color.set([0xf3dca0,0xe8bc57,0xf5ebcf,0xdab369,0xf2dfad][Math.floor(rng()*5)]);petals.setColorAt(j,color);j++;}
  for(const m of [petals,centers,stems]){m.frustumCulled=false;m.receiveShadow=true;this.scene.add(m);}this.flowers=[petals,centers,stems];this.grass=buildUnderstory(this.scene,this.wind);
 }
 buildTrees(){
  this.leaves=buildGrove(this.scene);
 }
 buildProps(){
  this.props=new THREE.Group();this.scene.add(this.props);const wood=material(0xb5915b),stone=material(0xd8d2bb);this.bench=new THREE.Group();this.bench.position.set(21,terrainHeight(21,-13),-13);this.bench.rotation.y=-.4;this.props.add(this.bench);
  mesh(new THREE.BoxGeometry(3.1,.15,.85),wood,this.bench,0,.65,0);mesh(new THREE.BoxGeometry(3.1,.55,.13),wood,this.bench,0,1.12,-.4);for(const x of [-1.1,1.1])mesh(new THREE.BoxGeometry(.17,.65,.65),material(0x575e50),this.bench,x,.32,0);
  const flutes=new THREE.InstancedMesh(new THREE.CylinderGeometry(.018,.024,2.25,5),material(0xc1bca8),96),flutePose=new THREE.Object3D();this.props.add(flutes);
  for(let i=0;i<8;i++){
   const x=-8+i*2.3,z=-37,y=terrainHeight(x,z);
   const shaft=mesh(new THREE.CylinderGeometry(.27,.33,2.55,24),stone,this.props,x,y+1.45,z);shaft.castShadow=true;shaft.receiveShadow=true;
   for(const [height,radius,thickness] of [[.12,.45,.24],[.30,.38,.12],[2.65,.35,.12],[2.8,.43,.18]]){
    const band=mesh(new THREE.CylinderGeometry(radius,radius,thickness,24),stone,this.props,x,y+height,z);band.castShadow=true;
   }
   // Fine fluting gives each existing column a readable stone profile.
   for(let j=0;j<12;j++){const a=j/12*Math.PI*2;flutePose.position.set(x+Math.sin(a)*.302,y+1.43,z+Math.cos(a)*.302);flutePose.updateMatrix();flutes.setMatrixAt(i*12+j,flutePose.matrix);}
   if(i%2===0){const beam=mesh(new THREE.BoxGeometry(2.95,.24,.72),stone,this.props,x+1.15,y+2.99,z);beam.castShadow=true;}
  }
  this.monument=new THREE.Group();this.monument.position.set(-26,terrainHeight(-26,-63),-63);this.monument.rotation.y=.36;this.scene.add(this.monument);mesh(new THREE.CylinderGeometry(3,3.5,3,24),stone,this.monument,0,1.5,0);
  this.memoryGroup=new THREE.Group();this.scene.add(this.memoryGroup);
  this.book=mesh(new THREE.BoxGeometry(.30,.025,.23),material(0x416282),this.scene);this.book.visible=false;
 }
 buildAvatar(){
  this.avatar=new THREE.Group();this.scene.add(this.avatar);this.figure=new THREE.Group();this.avatar.add(this.figure);const coat=material(0xf1e8d0),pants=material(0x354f63),skin=material(0xc79770),hair=material(0x443930);mesh(new THREE.CapsuleGeometry(.22,.38,5,10),coat,this.figure,0,1.12,0);mesh(new THREE.SphereGeometry(.18,12,10),skin,this.figure,0,1.63,0);mesh(new THREE.SphereGeometry(.185,12,8,0,6.28,0,1.7),hair,this.figure,0,1.67,0);this.limbs={};
  for(const [side,sgn] of [['L',-1],['R',1]]){const arm=new THREE.Group();arm.position.set(sgn*.29,1.32,0);this.figure.add(arm);mesh(new THREE.CapsuleGeometry(.075,.36,4,8),coat,arm,0,-.2,0);mesh(new THREE.SphereGeometry(.06,8,6),skin,arm,0,-.47,0);const leg=new THREE.Group();leg.position.set(sgn*.12,.83,0);this.figure.add(leg);mesh(new THREE.CapsuleGeometry(.08,.54,4,8),pants,leg,0,-.31,0);mesh(new THREE.BoxGeometry(.17,.13,.30),material(0x454337),leg,0,-.74,.065);this.limbs['arm'+side]=arm;this.limbs['leg'+side]=leg;}
  mesh(new THREE.BoxGeometry(.35,.40,.17),material(0xae633f),this.figure,0,1.18,-.23);
  this.shadow=mesh(new THREE.CircleGeometry(.46,24),new THREE.MeshBasicMaterial({color:0x414634,transparent:true,opacity:.16,depthWrite:false}),this.scene);this.shadow.rotation.x=-Math.PI/2;
 }
 async loadAssets(){
  try{const {GLTFLoader}=await import('./vendor/three/addons/loaders/GLTFLoader.js');const loader=new GLTFLoader();
   loader.load('/assets/planet/daylight/traveler.glb',g=>{this.avatar.remove(this.figure);this.figure=g.scene;this.avatar.add(this.figure);this.figure.traverse(o=>{if(o.isMesh)o.castShadow=true;});this.mixer=new THREE.AnimationMixer(this.figure);this.actions=Object.fromEntries(g.animations.map(c=>[c.name.toLowerCase(),this.mixer.clipAction(c)]));this.assets.traveler='ready';this.action=null;this.setAction('idle');},undefined,()=>{this.assets.traveler='fallback';});
   loader.load('/assets/planet/daylight/environment.glb',g=>{const bench=g.scene.getObjectByName('bench'),bust=g.scene.getObjectByName('bust');if(bench){this.bench.clear();this.bench.add(bench.clone(true));}if(bust){const b=bust.clone(true);b.position.set(0,3,0);b.scale.setScalar(11);this.monument.add(b);}this.assets.environment='ready';},undefined,()=>{this.assets.environment='fallback';});
  }catch{this.assets.traveler=this.assets.environment='fallback';}
 }
 setAction(name){if(this.action===name)return;const old=this.actions?.[this.action],next=this.actions?.[name]||this.actions?.idle;if(next){next.reset().play();if(old)next.crossFadeFrom(old,.22,true);}this.action=name;}
 setMemories(items){
  const ids=new Set(items.map(i=>i.id));for(const m of [...this.markers])if(!ids.has(m.item.id)){this.memoryGroup.remove(m.group);this.markers.splice(this.markers.indexOf(m),1);m.group.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
  for(const item of items){let marker=this.markers.find(m=>m.item.id===item.id);if(marker){marker.item=item;continue;}const p=memoryPosition(item),group=new THREE.Group();group.position.set(p.x,terrainHeight(p.x,p.z),p.z);const blue=item.id==='living-room'?0x345a8b:item.demo?0xb96b3c:0x49685b,mat=material(blue),paper=material(0xffefd0);let shape;
   if(item.kind==='cases'){mesh(new THREE.CylinderGeometry(.065,.085,1.3,8),material(0x927859),group,0,.65,0);shape=mesh(new THREE.BoxGeometry(.95,.56,.1),paper,group,0,1.25,0);mesh(new THREE.BoxGeometry(.58,.035,.115),mat,group,0,1.32,.006);mesh(new THREE.BoxGeometry(.35,.025,.115),mat,group,-.11,1.18,.006);}
   else{mesh(new THREE.CylinderGeometry(.58,.7,.36,12),material(0xd5ccb1),group,0,.18,0);const letter=item.kind==='records';shape=mesh(new THREE.BoxGeometry(letter?.70:.52,.055,letter?.43:.68),paper,group,0,.42,0);shape.rotation.x=-.24;const pebble=mesh(new THREE.IcosahedronGeometry(letter?.075:.14,1),mat,group,letter?0:.20,.49,letter?0:-.15);pebble.scale.y=.45;}
   const halo=mesh(new THREE.TorusGeometry(.44,.015,6,36),new THREE.MeshBasicMaterial({color:blue,transparent:true,opacity:.72}),group,0,1.97,0);const dot=mesh(new THREE.SphereGeometry(.075,10,8),new THREE.MeshBasicMaterial({color:blue}),group,0,1.97,0);this.memoryGroup.add(group);marker={item,group,shape,halo,dot,p,age:0};this.markers.push(marker);if(item.id==='living-room-record'&&!this.reduced){this.wind.bloom.value.set(p.x,0,p.z);this.wind.growth.value=0;}
  }
 }
 locate(id,item){const p=this.markers.find(m=>m.item.id===id)?.p||(item?memoryPosition(item):null);if(!p)return;this.walker.teleport({x:p.x,z:p.z+2.8});this.walker.yaw=0;this.walker.facing=Math.PI;this.lastView=null;}
 sit(){this.walker.stop();if(this.walker.pose==='sit'){this.walker.pose='idle';return;}this.walker.teleport({x:20,z:-10.2});this.walker.facing=-.4;this.walker.pose='sit';}
 pick(clientX,clientY){const rect=this.renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1),this.camera);
  const hits=ray.intersectObjects(this.memoryGroup.children,true);if(hits.length){const m=this.markers.find(m=>{let o=hits[0].object;while(o){if(o===m.group)return true;o=o.parent;}return false;});if(m)return{memory:m.item.id,position:m.p};}
  const g=ray.intersectObject(this.ground)[0];return g?{position:{x:g.point.x,z:g.point.z}}:null;
 }
 goTo(position){if(this.walker.goTo(position)){this.cursor.position.set(position.x,terrainHeight(position.x,position.z)+.04,position.z);this.cursor.visible=true;}}
 project(point){const p=new THREE.Vector3(point.x,terrainHeight(point.x,point.z)+2.0,point.z).project(this.camera);return{x:(p.x*.5+.5)*this.width,y:(-.5*p.y+.5)*this.height,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<.95&&Math.abs(p.y)<.85};}
 update(view,progress,dt,paused,reduced){
  dt=Math.min(Math.max(dt,0),.05);this.view=view;this.reduced=reduced;this.width=this.renderer.domElement.clientWidth;this.height=this.renderer.domElement.clientHeight;const w=this.walker,home=view==='home',travel=view==='travel';
  if(!paused&&!reduced)this.time+=dt;const moved=w.update(dt,view==='planet'?this.keys:{},view!=='planet'||this.blocked,reduced);this.wind.time.value=this.time;this.wind.person.value.set(w.x,0,w.z);this.wind.amount.value=paused||reduced?0:1;
  this.wind.growth.value=reduced?1:Math.min(1,this.wind.growth.value+dt*.8);for(const m of this.markers){m.age=Math.min(1,m.age+dt*1.5);m.group.scale.setScalar(reduced?1:.75+.25*THREE.MathUtils.smoothstep(m.age,0,1));}
  const reading=this.blocked&&view==='planet',pose=reading?'read':w.pose==='sit'?'sit':w.speed>2.6?'run':w.speed>.08?'walk':'idle';this.setAction(pose);if(this.mixer)this.mixer.update(dt*(paused&&pose==='idle'?0:1));else{const a=w.distance*4.8;for(const side of ['L','R']){const f=side==='L'?1:-1;this.limbs['leg'+side].rotation.x=pose==='sit'?-1.35:Math.sin(a)*.5*f*Math.min(1,w.speed);this.limbs['arm'+side].rotation.x=reading?-.85:-Math.sin(a)*.4*f*Math.min(1,w.speed);}}
  const avatarX=home?(this.width<=700?-6:-3):w.x,avatarZ=home?10:w.z;
  this.avatar.position.set(avatarX,terrainHeight(avatarX,avatarZ)+(w.pose==='sit'?.12:0),avatarZ);this.avatar.rotation.y=w.facing;this.shadow.position.set(avatarX,terrainHeight(avatarX,avatarZ)+.03,avatarZ);this.book.visible=reading&&!this.mixer;if(reading){this.book.position.set(w.x+Math.sin(w.facing)*.29,terrainHeight(w.x,w.z)+1.33,w.z+Math.cos(w.facing)*.29);this.book.rotation.set(.25,w.facing,0);}
  if(pose==='sit'){this.avatar.position.copy(this.bench.position);this.avatar.position.y+=.05;this.shadow.position.set(this.avatar.position.x,this.avatar.position.y+.01,this.avatar.position.z);}
  if(!w.path.length)this.cursor.visible=false;this.nearest=null;let distance=3.4;
  for(const m of this.markers){const d=Math.hypot(w.x-m.p.x,w.z-m.p.z);if(d<distance){this.nearest=m;distance=d;}m.halo.lookAt(this.camera.position);m.halo.rotation.z=this.time*.07;m.halo.material.opacity=d<4?.85:.36;m.halo.scale.setScalar(d<4?1.12:1);m.dot.position.y=1.97+(reduced?0:Math.sin(this.time*1.5+hashString(m.item.id)%10)*.08);}
  this.nearestDistance=distance;
  const mobile=this.width<=700,dist=(mobile?7.4:7.6)+(pose==='run'&&!reduced?.65:0),lift=2.0+w.pitch;
  this.planet.position.x=this.ring.position.x=mobile?18:66;this.planet.scale.setScalar(mobile?.64:.82);this.ring.scale.setScalar(mobile?.64:.82);this.monument.position.x=mobile?-10:-26;
  const desired=new THREE.Vector3(w.x+Math.sin(w.yaw)*dist,terrainHeight(w.x,w.z)+lift,w.z+Math.cos(w.yaw)*dist),look=new THREE.Vector3(w.x,terrainHeight(w.x,w.z)+1.3,w.z);
  if(home){desired.set(-8,4.3,27);look.set(-6,mobile?-3:1.6,-9);}
  if(travel){const p=progress*progress*(3-2*progress);desired.lerpVectors(new THREE.Vector3(-8,4.3,27),desired,p);look.lerpVectors(new THREE.Vector3(-6,mobile?-3:1.6,-9),look,p);}
  // Keep the orbit camera outside solid tree/bench cores and above the terrain.
  if(!home){const origin=new THREE.Vector3(w.x,terrainHeight(w.x,w.z)+1.5,w.z);for(let t=.1;t<=1;t+=.05){const sample=origin.clone().lerp(desired,t);if(OBSTACLES.some(o=>Math.hypot(sample.x-o.x,sample.z-o.z)<o.r&&sample.y<terrainHeight(o.x,o.z)+4)){desired.copy(origin).lerp(desired,Math.max(.12,t-.08));break;}}desired.y=Math.max(desired.y,terrainHeight(desired.x,desired.z)+.8);}
  if(this.lastView===null||reduced||reading){if(!reading||this.lastView!==view){this.camera.position.copy(desired);this.look.copy(look);}}
  else{this.camera.position.lerp(desired,1-Math.exp(-dt*5));this.look.lerp(look,1-Math.exp(-dt*7));}
  this.camera.fov=mobile?58:49;this.camera.aspect=this.width/Math.max(1,this.height);this.camera.near=.1;this.camera.far=800;this.camera.lookAt(this.look);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.renderer.render(this.scene,this.camera);this.lastView=view;return moved;
 }
 setQuality(value){this.quality=value;for(const f of this.flowers)f.count=value==='low'?6500:11000;this.grass.count=value==='low'?18000:32000;this.sun.castShadow=value!=='low';}
 dispose(){const seen=new Set();this.scene.traverse(o=>{if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose();}for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){if(seen.has(m))continue;seen.add(m);m.map?.dispose();m.dispose();}});}
 debug(){return{position:this.walker.snapshot(),pose:this.action,speed:this.walker.speed,pathLength:this.walker.path.length,nearest:this.nearest?.item.id||null,blocked:this.blocked,memories:this.markers.length,assets:{...this.assets},quality:this.quality};}
}
