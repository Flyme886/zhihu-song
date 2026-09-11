import * as THREE from './vendor/three/three.module.js';

const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const noise=`
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=a*noise(p);p=p*2.03+vec3(5.2,1.3,7.1);a*=.49;}return f;}`;
const sphereVertex=`varying vec3 vNormal,vPos,vWorld;void main(){vNormal=normalize(normalMatrix*normal);vPos=position;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const sphereFragment=`precision highp float;uniform float time;varying vec3 vNormal,vPos,vWorld;${noise}
void main(){vec3 p=normalize(vPos);float n=fbm(p*5.+vec3(time*.013,0.,0.));float clouds=fbm(p*13.+n*3.);float bands=fbm(p*vec3(3.,12.,3.)+n*2.);vec3 cold=vec3(.08,.14,.22);vec3 warm=vec3(.60,.42,.20);vec3 col=mix(cold,warm,smoothstep(.36,.69,n));col=mix(col,vec3(.42,.48,.52),smoothstep(.54,.78,clouds)*.75);col*=.55+bands*.9;float lighting=max(dot(p,normalize(vec3(-.6,.65,.85))),0.);col*=pow(lighting,.6)*1.1+.035;float rim=pow(1.-abs(vNormal.z),4.);col+=vec3(.31,.60,1.)*rim*(.15+lighting)*.6;gl_FragColor=vec4(col,1.);}`;
const ringFragment=`precision highp float;uniform float time,alpha;varying vec2 vUv;${noise}
void main(){float r=vUv.x;float grain=noise(vec3(vUv.x*1500.,vUv.y*1800.,time*.08));float bands=.45+.30*sin(r*620.)+.15*sin(r*1770.);float edges=smoothstep(0.,.07,r)*(1.-smoothstep(.84,1.,r));float core=exp(-pow((r-.22)*24.,2.));float gap=1.-.88*exp(-pow((r-.43)*110.,2.));vec3 col=mix(vec3(.8,.19,.045),vec3(.74,.88,1.),smoothstep(.08,.40,r));col=mix(col,vec3(1.,.88,.7),core*.8);float a=edges*(.15+grain*.6+bands*.3)*gap*alpha;gl_FragColor=vec4(col*(.6+core*1.8),a);}`;
function random(seed=5931){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function makeRing(inner,outer,opacity=1){
 const geo=new THREE.RingGeometry(inner,outer,256,8);const pos=geo.attributes.position,uv=geo.attributes.uv;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);uv.setXY(i,(Math.hypot(x,y)-inner)/(outer-inner),(Math.atan2(y,x)+Math.PI)/(2*Math.PI));}
 const mat=new THREE.ShaderMaterial({uniforms:{time:{value:0},alpha:{value:opacity}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:ringFragment,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
 const ring=new THREE.Mesh(geo,mat);return ring;
}
function makeStars(count,spread,seed){
 const rng=random(seed),positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count);
 for(let i=0;i<count;i++){const z=rng()*2-1,a=rng()*Math.PI*2,r=spread*(.7+rng()*.3);positions.set([Math.sqrt(1-z*z)*Math.cos(a)*r,Math.sqrt(1-z*z)*Math.sin(a)*r,z*r],i*3);const light=.25+rng()*.75;colors.set([light*(.7+rng()*.3),light*.82,light],i*3);sizes[i]=.5+rng()*1.2;}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('size',new THREE.BufferAttribute(sizes,1));
 const material=new THREE.ShaderMaterial({uniforms:{dpr:{value:1},alpha:{value:1}},vertexShader:'attribute vec3 color;attribute float size;varying vec3 c;uniform float dpr;void main(){c=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*dpr;}',fragmentShader:'varying vec3 c;uniform float alpha;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(c,alpha*(1.-smoothstep(.12,.5,d)));}',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});return new THREE.Points(geometry,material);
}

export class CosmosRenderer {
 constructor(canvas){
  this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:true,powerPreference:'high-performance'});this.renderer.setClearColor(0x020408,1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
  this.camera=new THREE.PerspectiveCamera(42,1,.1,400);this.scene=new THREE.Scene();this.surface=new THREE.Scene();this.world=new THREE.Scene();this.time=0;this.focus=0;this.targetFocus=0;this.pulse=0;this.quality='high';this.frames=[];this.transitions=0;
  this.stars=makeStars(6500,120,512);this.scene.add(this.stars);this.surfaceStars=makeStars(3500,110,821);this.surface.add(this.surfaceStars);this.worldStars=makeStars(2000,110,902);this.world.add(this.worldStars);
  this.planet=new THREE.Group();this.scene.add(this.planet);
  this.globe=new THREE.Mesh(new THREE.SphereGeometry(1.55,96,64),new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:sphereVertex,fragmentShader:sphereFragment}));this.planet.add(this.globe);
  this.ring=makeRing(1.9,4.4,.78);this.ring.rotation.set(1.14,.18,-.38);this.planet.add(this.ring);
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.59,64,48),new THREE.ShaderMaterial({vertexShader:sphereVertex,fragmentShader:'varying vec3 vNormal;void main(){float a=pow(1.-abs(vNormal.z),4.5)*.28;gl_FragColor=vec4(.32,.64,1.,a);}',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));this.planet.add(atmosphere);
  const haloGeo=new THREE.PlaneGeometry(10,10);const halo=new THREE.Mesh(haloGeo,new THREE.ShaderMaterial({vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;void main(){float r=length(vUv-.5);float a=exp(-r*r*25.)*.09;gl_FragColor=vec4(.17,.35,.65,a);}',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));halo.position.z=-1.4;this.planet.add(halo);
  this.buildSurface();this.buildWorld();
  this.stats={frames:0,p95:0,quality:this.quality};
 }
 buildSurface(){
  this.surface.fog=new THREE.FogExp2(0x070d18,.016);
  this.fallbackMountains=new THREE.Group();this.fallbackMountains.visible=false;this.surface.add(this.fallbackMountains);
  for(let layer=0;layer<3;layer++){const shape=new THREE.Shape();shape.moveTo(-90,-22);for(let i=0;i<=100;i++){const x=-90+i*1.8,y=3-layer*2+Math.sin(x*.19+layer*8)*2.3+Math.sin(x*.53+layer*4)*.7;shape.lineTo(x,y);}shape.lineTo(90,-22);shape.closePath();const ridge=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:[0x1a2b40,0x101e30,0x0a1524][layer],fog:false}));ridge.position.z=-84+layer*12;this.fallbackMountains.add(ridge);}
  const texture=new THREE.TextureLoader().load('/assets/planet/surface.png',()=>{this.textureLoaded=true;},undefined,()=>{this.textureFailed=true;this.backdrop.visible=false;this.fallbackMountains.visible=true;document.body.dataset.landscape='procedural';});texture.colorSpace=THREE.SRGBColorSpace;
  this.backdrop=new THREE.Mesh(new THREE.PlaneGeometry(180,101),new THREE.MeshBasicMaterial({map:texture,depthWrite:false,fog:false,color:0xb5c9e9}));this.backdrop.position.set(0,22,-85);this.surface.add(this.backdrop);
  this.skyRing=makeRing(34,60,.70);this.skyRing.position.set(14,32,-70);this.skyRing.rotation.set(1.12,-.38,0);this.surface.add(this.skyRing);
  const terrain=new THREE.PlaneGeometry(100,100,90,90);terrain.rotateX(-Math.PI/2);const p=terrain.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,-1.8+Math.sin(x*.19+z*.09)*.35+Math.sin(z*.4+x*.12)*.2+Math.sin(x*.75+z*.51)*.07);}terrain.computeVertexNormals();
  const groundMaterial=new THREE.MeshStandardMaterial({color:0x070c13,roughness:1,metalness:0,transparent:true,depthWrite:false});
  groundMaterial.onBeforeCompile=shader=>{shader.vertexShader='varying vec3 terrainPosition;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n terrainPosition=position;');shader.fragmentShader='varying vec3 terrainPosition;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\n gl_FragColor.a *= smoothstep(-23.,-3.,terrainPosition.z-20.);');};
  this.ground=new THREE.Mesh(terrain,groundMaterial);this.ground.position.z=-20;this.surface.add(this.ground);
  this.surface.add(new THREE.HemisphereLight(0xa2c9ff,0x04040a,.9));const moon=new THREE.DirectionalLight(0xbedcff,1.2);moon.position.set(-20,15,-35);this.surface.add(moon);
  const rng=random(121),positions=new Float32Array(108*3),colors=new Float32Array(108*3);
  for(let i=0;i<108;i++){const section=Math.floor(i/36);positions.set([(section-1)*7+(rng()-.5)*5,-.9+rng()*.9,-12-rng()*8],i*3);colors.set(section===1?[1.,.55,.25]:[.57,.79,1.],i*3);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setIndex(new THREE.BufferAttribute(new Uint16Array(108),1));geo.setDrawRange(0,0);
  this.memories=new THREE.Points(geo,new THREE.PointsMaterial({size:.055,vertexColors:true,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));this.surface.add(this.memories);
  this.beacons=[];
  for(const [i,x] of [-7,0,7].entries()){
   const beacon=new THREE.Group();beacon.position.set(x,-1.0,-14-(i===1?4:0));
   const core=new THREE.Mesh(new THREE.SphereGeometry(.075,12,10),new THREE.MeshBasicMaterial({color:i===1?0xffbc83:0xc3e7ff}));beacon.add(core);
   const column=new THREE.Mesh(new THREE.PlaneGeometry(.9,4),new THREE.ShaderMaterial({vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;void main(){float a=exp(-pow((vUv.x-.5)*18.,2.))*(1.-vUv.y)*.38;gl_FragColor=vec4(.42,.70,1.,a);}',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));column.position.y=2;beacon.add(column);this.surface.add(beacon);this.beacons.push(beacon);
  }
  // A tiny human silhouette gives the immense scene a familiar scale.
  const human=new THREE.Group();const material=new THREE.MeshBasicMaterial({color:0x03060a});const head=new THREE.Mesh(new THREE.SphereGeometry(.055,10,8),material);head.position.y=.4;human.add(head);const body=new THREE.Mesh(new THREE.CapsuleGeometry(.06,.19,4,8),material);body.position.y=.22;human.add(body);for(const x of [-.027,.027]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.017,.014,.20,6),material);leg.position.set(x,.04,0);human.add(leg);}human.position.set(2.8,-1.32,-8);this.surface.add(human);
 }
 buildWorld(){this.worldNodes=[];}
 createWorldNode(){
  const geometry=new THREE.SphereGeometry(1,36,24);
  const material=new THREE.ShaderMaterial({uniforms:{time:{value:0},tint:{value:new THREE.Vector3(1,1,1)},opacity:{value:1}},vertexShader:sphereVertex,fragmentShader:`precision highp float;uniform float time,opacity;uniform vec3 tint;varying vec3 vNormal,vPos,vWorld;${noise}void main(){vec3 p=normalize(vPos);float f=fbm(p*6.+vec3(time*.06));float ridge=pow(.5+.5*sin(p.y*30.+f*16.+time*.1),14.);float edge=pow(1.-abs(vNormal.z),3.);float dots=step(.82,noise(p*230.));vec3 col=tint*(.035+ridge*.35+edge*.5+dots*.10);gl_FragColor=vec4(col,opacity);}`,transparent:true,depthWrite:true});
  const mesh=new THREE.Mesh(geometry,material);this.world.add(mesh);this.worldNodes.push(mesh);return mesh;
 }
 resize(width,height){this.width=width;this.height=height;this.mobile=width<700;this.dpr=Math.min(devicePixelRatio||1,this.quality==='low'?1:this.mobile?1.25:1.5);this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();for(const s of [this.stars,this.surfaceStars,this.worldStars])s.material.uniforms.dpr.value=this.dpr;}
 setCounts(counts){const sections=['opinions','cases','records'];if(this.counts&&sections.every(s=>this.counts[s]===counts[s]))return;const indices=this.memories.geometry.index;let length=0;sections.forEach((section,i)=>{for(let n=0;n<Math.min(36,counts[section]);n++)indices.array[length++]=i*36+n;});indices.needsUpdate=true;this.memories.geometry.setDrawRange(0,length);this.counts={...counts};}
 burst(){this.pulse=1;}
 setFocus(section){this.targetFocus={opinions:-1,cases:0,records:1}[section]||0;}
 frame(view,progress,dt,paused=false,reduced=false){
  if(!paused)this.time+=Math.min(dt,.04);this.focus=reduced?this.targetFocus:THREE.MathUtils.damp(this.focus,this.targetFocus,3,dt);this.pulse=Math.max(0,this.pulse-dt*.4);
  const t=this.time;this.globe.material.uniforms.time.value=t;this.ring.material.uniforms.time.value=t;this.skyRing.material.uniforms.time.value=t;
  this.stars.rotation.y=t*.0015;this.surfaceStars.rotation.y=t*.001;
  const descending=view==='travel';const surface=view==='planet'||descending&&progress>.76;
  if(surface){
   const p=descending?smooth((progress-.76)/.24):1;
   this.camera.fov=this.mobile?55:48;this.camera.position.set(this.focus*2.8,THREE.MathUtils.lerp(4.2,1.0,p),THREE.MathUtils.lerp(17,6,p));this.camera.lookAt(this.focus*4.5,THREE.MathUtils.lerp(2.0,1.0,p),-23);
   this.memories.material.opacity=.55+this.pulse*.45;this.memories.material.size=.045+this.pulse*.06;
   this.camera.updateProjectionMatrix();this.renderer.render(this.surface,this.camera);
  }else{
   const p=descending?progress:0;const pull=Math.sin(clamp(p/.2)*Math.PI)*1.2;const approach=smooth((p-.17)/.59);
   this.camera.fov=this.mobile?48:42;this.planet.position.set(this.mobile?0:1.3,this.mobile?.5:0,0);this.planet.rotation.y=t*.009;
   this.camera.position.set(THREE.MathUtils.lerp(0,1.8,approach),THREE.MathUtils.lerp(1.6,.6,approach),THREE.MathUtils.lerp(this.mobile?12:10,2.4,approach)+pull);this.camera.lookAt(this.mobile?0:.3,0,0);this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);
  }
  this.recordFrame(dt);
 }
 render(nodes){
  // Perspective camera with meshes fitted to the existing screen-space layout.
  this.camera.fov=42;this.camera.position.set(0,0,10);this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();
  const h=2*10*Math.tan(THREE.MathUtils.degToRad(21)),scale=h/this.height;
  nodes.forEach((n,i)=>{const mesh=this.worldNodes[i]||this.createWorldNode();mesh.visible=true;mesh.position.set((n.x-this.width/2)*scale,(this.height/2-n.y)*scale,0);mesh.scale.setScalar(n.r*scale);mesh.material.uniforms.time.value=n.time;mesh.material.uniforms.tint.value.fromArray(n.tint);mesh.material.uniforms.opacity.value=n.opacity;});
  for(let i=nodes.length;i<this.worldNodes.length;i++)this.worldNodes[i].visible=false;
  this.renderer.render(this.world,this.camera);
 }
 projectLandmarks(){return this.beacons.map(b=>{const p=b.position.clone();p.y+=.4;p.project(this.camera);return{x:(p.x*.5+.5)*this.width,y:(-p.y*.5+.5)*this.height,visible:p.z<1};});}
 projectPlanet(){const p=this.planet.position.clone().project(this.camera);const distance=this.camera.position.distanceTo(this.planet.position);return{x:(p.x*.5+.5)*this.width,y:(-p.y*.5+.5)*this.height,r:1.58*this.height/(2*distance*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)))};}
 recordFrame(dt){if(dt<=0||dt>.25)return;this.stats.frames++;this.frames.push(dt*1000);if(this.frames.length>180)this.frames.shift();if(this.stats.frames%180===0){const sorted=[...this.frames].sort((a,b)=>a-b);this.stats.p95=sorted[Math.floor(sorted.length*.95)]||0;this.stats.median=sorted[Math.floor(sorted.length*.5)]||0;this.stats.fps=1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length);if(this.stats.p95>35&&this.quality!=='low'){this.quality='low';this.stats.quality='low';this.stars.geometry.setDrawRange(0,2800);this.surfaceStars.geometry.setDrawRange(0,1600);this.worldStars.geometry.setDrawRange(0,1000);this.resize(this.width,this.height);}}}
 getStats(){return{...this.stats,memory:{...this.renderer.info.memory},drawCalls:this.renderer.info.render.calls,texturesReady:!!this.textureLoaded};}
 dispose(){const seen=new Set();for(const scene of [this.scene,this.surface,this.world])scene.traverse(o=>{if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose();}if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});this.renderer.dispose();}
}
