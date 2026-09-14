import * as THREE from './vendor/three/three.module.js';
import {terrainHeight,pathDistance,TREE_POSITIONS,OBSTACLES,WAYMARKERS} from './wander-controller.js';

const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.88,...extra});
const add=(parent,geometry,mat,x=0,y=0,z=0)=>{
 const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
};

// Small botanical details share geometry and materials across the whole meadow.
// Their positions are seeded independently of the user's memories.
function buildFlowerBorders(scene,wind){
 const rng=seeded(30918),pose=new THREE.Object3D(),color=new THREE.Color();
 const vertices=[],colors=[],normals=[];
 const triangle=(a,b,c,color,center)=>{
  vertices.push(...a,...b,...c);const normal=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c),new THREE.Vector3(...a))).normalize();
  for(const p of [a,b,c]){colors.push(...color);const n=center?new THREE.Vector3(p[0]-center[0],(p[1]-center[1])*.45,p[2]-center[2]).normalize():normal;normals.push(n.x,n.y,n.z);}
 };
 for(let stem=0;stem<3;stem++){
  const angle=stem*2.399,h=.40+stem*.08,x=Math.cos(angle)*.10,z=Math.sin(angle)*.10;
  const point=(tier,side)=>{const t=tier/8,a=side/8*Math.PI*2,r=.033*Math.pow(Math.sin(Math.PI*t),.7)*(tier%2?.97:1);return[x+Math.cos(a)*r,h+t*.19,z+Math.sin(a)*r];};
  for(let tier=0;tier<8;tier++)for(let side=0;side<8;side++){
   const a=point(tier,side),b=point(tier,side+1),c=point(tier+1,side+1),d=point(tier+1,side);
   const tint=[.91+tier*.012,.91+tier*.012,.94+tier*.008];triangle(a,d,c,tint,[x,h+.095,z]);triangle(a,c,b,tint,[x,h+.095,z]);
  }
  triangle([x-.006,0,z],[x+.006,0,z],[x+.004,h+.05,z],[.42,.60,.35]);
  triangle([x-.006,0,z],[x+.004,h+.05,z],[x-.004,h+.05,z],[.42,.60,.35]);
  triangle([x,.19,z],[x-.07,.27,z+.018],[x-.13,.31,z],[.46,.62,.39]);
  triangle([x,.28,z],[x+.08,.34,z+.018],[x+.12,.41,z],[.46,.62,.39]);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
 const mat=material(0xffffff,{side:THREE.DoubleSide,vertexColors:true});
 mat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{borderTime:wind.time,borderWind:wind.amount});
  shader.vertexShader='uniform float borderTime,borderWind;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vec3 origin=instanceMatrix[3].xyz;
   transformed.x+=sin(borderTime*1.15+origin.x*.5+origin.z*.4)*position.y*position.y*.14*borderWind;`);
 };
 const flowers=new THREE.InstancedMesh(geo,mat,1000);
 const beds=[[-6,13],[6,7],[-11,0],[14,-5],[-24,-12],[24,-17],[-8,-28],[8,-32],[-22,14],[29,3]];
 let count=0;
 while(count<flowers.instanceMatrix.count){
  const center=beds[count%beds.length],a=rng()*Math.PI*2,r=Math.sqrt(rng())*4.8;
  const x=center[0]+Math.cos(a)*r,z=center[1]+Math.sin(a)*r*.68;
  if(pathDistance(x,z)<1.9||OBSTACLES.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+.7))continue;
  pose.position.set(x,terrainHeight(x,z)-.03,z);pose.rotation.set(0,rng()*6.28,0);pose.scale.setScalar(.62+rng()*.7);pose.updateMatrix();flowers.setMatrixAt(count,pose.matrix);
  color.set([0x9c90b5,0xb5a4c8,0x7f839f,0xc1b5ce,0x8999aa][Math.floor(rng()*5)]);flowers.setColorAt(count++,color);
 }
 flowers.receiveShadow=true;scene.add(flowers);return flowers;
}

function buildGroundDetails(scene){
 const rng=seeded(52783),pose=new THREE.Object3D(),color=new THREE.Color();
 const rockMat=material(0xffffff),rocks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),rockMat,160);
 const leafGeo=new THREE.BufferGeometry();leafGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.06,0,0,0,.012,.15,.06,0,0,.06,0,0,0,.012,-.14,-.06,0,0],3));leafGeo.computeVertexNormals();
 const leaves=new THREE.InstancedMesh(leafGeo,material(0xffffff,{side:THREE.DoubleSide}),520);
 for(let i=0;i<160;i++){
  const [tx,tz]=TREE_POSITIONS[i%TREE_POSITIONS.length],a=rng()*6.28,r=.7+rng()*2.7,x=tx+Math.cos(a)*r,z=tz+Math.sin(a)*r;
  const s=.10+rng()*.23;pose.position.set(x,terrainHeight(x,z)-s*.13,z);pose.rotation.set(rng(),rng()*6.28,rng());pose.scale.set(s*1.35,s*.63,s);pose.updateMatrix();rocks.setMatrixAt(i,pose.matrix);color.set([0x949686,0xb4af98,0x898e78,0xc0b7a0][i%4]);rocks.setColorAt(i,color);
 }
 for(let i=0;i<520;i++){
  const [tx,tz]=TREE_POSITIONS[i%TREE_POSITIONS.length],a=rng()*6.28,r=Math.sqrt(rng())*4.5,x=tx+Math.cos(a)*r,z=tz+Math.sin(a)*r;
  pose.position.set(x,terrainHeight(x,z)+.024,z);pose.rotation.set(0,rng()*6.28,0);pose.scale.setScalar(.45+rng()*.6);pose.updateMatrix();leaves.setMatrixAt(i,pose.matrix);color.set([0xb4a164,0x9a854e,0xc5b075,0x7e8c50][i%4]);leaves.setColorAt(i,color);
 }
 rocks.receiveShadow=true;leaves.receiveShadow=true;scene.add(rocks,leaves);

 // Soft contact shadows keep trunks grounded, including in the lightweight mode.
 const shade=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 v;void main(){float r=length(v-.5)*2.;gl_FragColor=vec4(.16,.22,.10,(1.-smoothstep(.08,1.,r))*.19);}'});
 const circle=new THREE.PlaneGeometry(5,5);
 for(const [x,z] of TREE_POSITIONS){const shadow=new THREE.Mesh(circle,shade);shadow.rotation.x=-Math.PI/2;shadow.position.set(x,terrainHeight(x,z)+.028,z);scene.add(shadow);}
}

function signTexture(title,subtitle){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#526961';ctx.fillRect(0,0,512,256);
 ctx.strokeStyle='#d9d6b8';ctx.lineWidth=2;ctx.strokeRect(16,16,480,224);
 ctx.fillStyle='#f4ecd4';ctx.textAlign='center';ctx.font='38px "Songti SC", serif';ctx.fillText(title,246,105);
 ctx.font='17px system-ui';ctx.fillStyle='#d4d6bd';ctx.fillText(subtitle,246,164);
 ctx.beginPath();ctx.moveTo(427,104);ctx.lineTo(455,104);ctx.lineTo(445,95);ctx.moveTo(455,104);ctx.lineTo(445,113);ctx.stroke();
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

function buildWaymarkers(scene){
 const wood=material(0x8d7556),edge=material(0xb49b73),brass=material(0xb49c65,{metalness:.5,roughness:.44});
 const face=new THREE.PlaneGeometry(1.18,.59),post=new THREE.CylinderGeometry(.045,.065,1.38,8);
 for(const {x,z,title,subtitle,rotation} of WAYMARKERS){
  const group=new THREE.Group();group.position.set(x,terrainHeight(x,z),z);group.rotation.y=rotation;scene.add(group);
  add(group,post,wood,0,.69,0);add(group,new THREE.BoxGeometry(1.3,.70,.095),edge,0,1.17,0);
  add(group,face,material(0xffffff,{map:signTexture(title,subtitle)}),0,1.17,.05);
  for(const x of [-.55,.55])add(group,new THREE.SphereGeometry(.016,6,4),brass,x,1.17,.058);
  add(group,new THREE.CylinderGeometry(.12,.17,.13,10),material(0xaaa58c),0,.05,0);
 }
}

export function dressBench(parent,seatHeight=.47,scale=.66){
 const bench=new THREE.Group();bench.scale.setScalar(scale);bench.position.y=seatHeight-.73*scale;parent.add(bench);
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#819493';ctx.fillRect(0,0,128,128);ctx.fillStyle='#e0d9bd';for(const x of [10,15,111,116])ctx.fillRect(x,0,2,128);
 ctx.fillStyle='#ffffff16';for(let i=0;i<128;i+=3){ctx.fillRect(i,0,1,128);ctx.fillRect(0,i,128,1);}
 const weave=new THREE.CanvasTexture(canvas);weave.colorSpace=THREE.SRGBColorSpace;
 const cloth=material(0xffffff,{map:weave,side:THREE.DoubleSide}),paper=material(0xeee3c6),cover=material(0x765b47),ceramic=material(0xded4b5,{roughness:.42});
 const fabric=new THREE.PlaneGeometry(.72,1.23,8,16),p=fabric.attributes.position;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),t=(p.getY(i)+.615)/1.23;
  p.setXYZ(i,x+.73,t<.68?.737+Math.sin(x*28)*.013:.737-(t-.68)*1.28,-.32+Math.min(t,.68)*1.15);
 }fabric.computeVertexNormals();add(bench,fabric,cloth);
 for(let i=0;i<2;i++){
  const book=new THREE.Group();book.position.set(-.9,.76+i*.065,.05);book.rotation.y=.16-i*.30;bench.add(book);
  add(book,new THREE.BoxGeometry(.35,.022,.25),cover);add(book,new THREE.BoxGeometry(.32,.035,.235),paper,0,.027,0);add(book,new THREE.BoxGeometry(.35,.012,.25),cover,0,.05,0);
 }
 const cup=add(bench,new THREE.CylinderGeometry(.066,.049,.13,18,1,true),ceramic,-.42,.78,.02);
 add(cup,new THREE.CircleGeometry(.059,18),material(0x594331),0,.053,0).rotation.x=-Math.PI/2;
 add(cup,new THREE.TorusGeometry(.041,.010,6,14),ceramic,.071,.006,0);
}

function buildButterflies(scene){
 const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(.07,.11,.21,.18,.24,.06);shape.bezierCurveTo(.27,-.04,.14,-.02,.12,-.05);shape.bezierCurveTo(.22,-.18,.06,-.15,0,0);
 const geo=new THREE.ShapeGeometry(shape,8);geo.rotateX(-Math.PI/2);
 const colors=[0xf0d991,0xddd6bc,0xb4bfd1],mats=colors.map(color=>material(color,{side:THREE.DoubleSide,emissive:color,emissiveIntensity:.13}));
 const butterflies=[];
 for(let i=0;i<8;i++){
  const group=new THREE.Group(),left=new THREE.Mesh(geo,mats[i%3]),right=new THREE.Mesh(geo,mats[i%3]);right.scale.x=-1;group.add(left,right);group.scale.setScalar(.6);scene.add(group);
  butterflies.push({group,left,right,x:[-5,5,-12,14,-22,25,-6,10][i],z:[12,8,-2,-5,-12,-16,-29,-32][i],phase:i*2.399});
 }
 return butterflies;
}

export function buildMeadowDetails(scene,wind){
 const flowers=buildFlowerBorders(scene,wind);buildGroundDetails(scene);buildWaymarkers(scene);const butterflies=buildButterflies(scene);
 const rng=seeded(9861),count=70,positions=new Float32Array(count*3),seeds=new Float32Array(count);
 for(let i=0;i<count;i++){positions.set([(rng()-.5)*66,.7+rng()*3.3,(rng()-.5)*65-8],i*3);seeds[i]=rng()*6.28;}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:wind.time,pixelRatio:{value:1}},vertexShader:`
  attribute float seed;uniform float time,pixelRatio;varying float fade;
  void main(){vec3 p=position;p.x+=sin(time*.13+seed)*1.1;p.y+=sin(time*.4+seed)*.32;p.z+=cos(time*.11+seed)*.8;
   vec4 mv=modelViewMatrix*vec4(p,1.);fade=(1.-smoothstep(10.,35.,-mv.z))*.48;gl_PointSize=clamp(29./max(1.,-mv.z),1.,3.)*pixelRatio;gl_Position=projectionMatrix*mv;}
 `,fragmentShader:'varying float fade;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(1.,.96,.78,(1.-smoothstep(.1,1.,r))*fade);}'});
 const motes=new THREE.Points(geo,mat);scene.add(motes);
 return{
  plantings:[flowers],
  update(time,reduced,pixelRatio){
   mat.uniforms.pixelRatio.value=pixelRatio;
   for(const b of butterflies){const t=time*.45+b.phase;b.group.position.set(b.x+Math.sin(t)*1.3,terrainHeight(b.x,b.z)+.85+Math.sin(t*1.7)*.22,b.z+Math.cos(t*.83)*1.0);b.group.rotation.y=-t;b.left.rotation.z=Math.sin(time*8+b.phase)*.8;b.right.rotation.z=-b.left.rotation.z;b.group.visible=!reduced;}
   motes.visible=!reduced;
  },
  setQuality(quality){flowers.count=quality==='low'?600:1000;geo.setDrawRange(0,quality==='low'?35:count);},
 };
}

// Restore from original transforms before cutting clearings, so deleting or moving
// a memory lets the same plants reappear. Never regenerate seeded scenery here.
export function clearPlantings(meshes,clearings){
 for(const mesh of meshes){
  const matrices=mesh.instanceMatrix.array;
  const base=mesh.userData.plantingTransforms??(mesh.userData.plantingTransforms=matrices.slice());
  matrices.set(base);
  for(let i=0;i<mesh.instanceMatrix.count;i++){
   const offset=i*16,x=base[offset+12],z=base[offset+14];
   if(clearings.some(p=>(x-p.x)**2+(z-p.z)**2<p.radius**2)){
    // Zero every basis component, including rotated/sheared stems.
    for(const k of [0,1,2,4,5,6,8,9,10])matrices[offset+k]=0;
   }
  }
  mesh.instanceMatrix.needsUpdate=true;
 }
}
