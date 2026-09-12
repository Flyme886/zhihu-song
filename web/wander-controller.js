// World-space movement is independent of rendering and never touches personal history.
export const WORLD_RADIUS=46;
export const SPAWN={x:0,z:17,yaw:0,pitch:.28};
export const AREAS={cases:{x:-22,z:-7,label:'花田小径'},records:{x:22,z:-12,label:'树下长椅'},opinions:{x:0,z:-34,label:'山脚石廊'}};
export const TREE_POSITIONS=[[26,-18],[16,-19],[-25,-9],[33,-29],[-37,-24],[36,8],[-34,13],[-14,-45],[17,-43],[40,-3],[-43,-5]];
export const OBSTACLES=[{x:21,z:-13,r:1.1},...TREE_POSITIONS.map(([x,z])=>({x,z,r:.55})),...Array.from({length:8},(_,i)=>({x:-8+i*2.3,z:-37,r:.44}))];
export function terrainHeight(x,z){return -.5+Math.sin(x*.052)*.95+Math.cos(z*.054)*.6+Math.sin(x*.13+z*.071)*.18;}
export function pathDistance(x,z){return Math.min(Math.abs(Math.hypot(x,z+8)-29),Math.abs(x-2*Math.sin(z*.08)),Math.abs(z+9+.13*x));}
export function hashString(value){let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
const seedPositions={
 'canteen-case':[-12,6],'canteen-record':[18,-8],'canteen-opinion':[-5,-30],
 'cat-art-case':[-24,-7],'cat-art-record':[26,-9],'cat-art-opinion':[5,-34],
 'living-room':[-1,7],'living-room-record':[1,-26]
};
export function memoryPosition(item){
 if(item.cluster)return {...item.position};
 if(seedPositions[item.id])return{x:seedPositions[item.id][0],z:seedPositions[item.id][1]};
 const area=AREAS[item.kind]||AREAS.cases,h=hashString(item.id),a=(h%6283)/1000,r=4+(Math.floor(h/6283)%850)/100;
 return{x:area.x+Math.cos(a)*r,z:area.z+Math.sin(a)*r};
}
// Dense archives use stable spatial cells. The full records remain in the list.
export function memoryLayout(items){
 if(items.length<=30)return items;
 const cells=new Map();
 for(const item of items){const p=memoryPosition(item),x=Math.floor(p.x/8),z=Math.floor(p.z/8),id=`cluster:${item.kind}:${x}:${z}`;if(!cells.has(id))cells.set(id,{id,kind:item.kind,cluster:true,position:{x:x*8+4,z:z*8+4},members:[]});cells.get(id).members.push(item);}
 return [...cells.values()].map(cell=>cell.members.length===1?cell.members[0]:{...cell,title:`${AREAS[cell.kind].label} · ${cell.members.length} 段往事`,summary:'展开这里的记忆'});
}
export function walkable(x,z,obstacles=OBSTACLES,padding=.38){return Number.isFinite(x)&&Number.isFinite(z)&&Math.hypot(x,z+8)<WORLD_RADIUS-padding&&!obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+padding);}
export function safePosition(position,obstacles=OBSTACLES){
 if(walkable(position?.x,position?.z,obstacles))return{x:position.x,z:position.z};
 if(Number.isFinite(position?.x)&&Number.isFinite(position?.z))for(let r=1;r<8;r++)for(let i=0;i<16;i++){const x=position.x+Math.cos(i*Math.PI/8)*r,z=position.z+Math.sin(i*Math.PI/8)*r;if(walkable(x,z,obstacles))return{x,z};}
 return{x:SPAWN.x,z:SPAWN.z};
}
// Small bounded A* grid keeps click-to-walk useful around benches and tree trunks.
export function findPath(from,to,obstacles=OBSTACLES){
 const target=safePosition(to,obstacles),cell=1.4,key=(x,z)=>x+','+z,start={x:Math.round(from.x/cell),z:Math.round(from.z/cell),g:0,parent:null};
 const goal={x:Math.round(target.x/cell),z:Math.round(target.z/cell)},open=[start],best=new Map([[key(start.x,start.z),0]]);let found=null,iterations=0;
 if(!walkable(goal.x*cell,goal.z*cell,obstacles,.62)){
  const candidates=[];for(let x=goal.x-3;x<=goal.x+3;x++)for(let z=goal.z-3;z<=goal.z+3;z++)if(walkable(x*cell,z*cell,obstacles,.62))candidates.push({x,z,d:Math.hypot(x*cell-target.x,z*cell-target.z)});
  candidates.sort((a,b)=>a.d-b.d);if(!candidates.length)return[];goal.x=candidates[0].x;goal.z=candidates[0].z;
 }
 while(open.length&&iterations++<8000){open.sort((a,b)=>(a.g+Math.hypot(a.x-goal.x,a.z-goal.z))-(b.g+Math.hypot(b.x-goal.x,b.z-goal.z)));const current=open.shift();
  if(current.x===goal.x&&current.z===goal.z){found=current;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const x=current.x+dx,z=current.z+dz,g=current.g+Math.hypot(dx,dz),id=key(x,z);
   if(g>=(best.get(id)??Infinity)||!walkable(x*cell,z*cell,obstacles,.62))continue;
   if(dx&&dz&&(!walkable((current.x+dx)*cell,current.z*cell,obstacles,.62)||!walkable(current.x*cell,(current.z+dz)*cell,obstacles,.62)))continue;
   best.set(id,g);open.push({x,z,g,parent:current});
  }
 }
 if(!found)return[];const anchor={x:goal.x*cell,z:goal.z*cell};let direct=true;for(let t=0;t<=1;t+=.1)if(!walkable(anchor.x+(target.x-anchor.x)*t,anchor.z+(target.z-anchor.z)*t,obstacles))direct=false;
 const points=[direct?target:anchor];for(let n=found;n.parent;n=n.parent)points.push({x:n.x*cell,z:n.z*cell});return points.reverse();
}
export class Walker{
 constructor(saved={},obstacles=OBSTACLES){Object.assign(this,safePosition(saved,obstacles));this.yaw=Number.isFinite(saved.yaw)?saved.yaw:SPAWN.yaw;this.pitch=Number.isFinite(saved.pitch)?Math.max(.05,Math.min(.75,saved.pitch)):SPAWN.pitch;this.facing=Math.PI;this.speed=0;this.vx=0;this.vz=0;this.path=[];this.obstacles=obstacles;this.pose='idle';this.distance=0;}
 stop(){this.path=[];this.speed=0;this.vx=0;this.vz=0;}
 goTo(target){this.pose='idle';this.path=findPath(this,target,this.obstacles);return this.path.length>0;}
 teleport(target){Object.assign(this,safePosition(target,this.obstacles));this.stop();this.pose='idle';}
 update(dt,input={},blocked=false,reduced=false){
  dt=Math.max(0,Math.min(dt,.05));if(blocked){this.stop();return 0;}
  let ix=Number(input.x)||0,iz=Number(input.z)||0,dx=0,dz=0;
  if(ix||iz){this.path=[];this.pose='idle';const length=Math.max(1,Math.hypot(ix,iz));ix/=length;iz/=length;dx=ix*Math.cos(this.yaw)+iz*Math.sin(this.yaw);dz=-ix*Math.sin(this.yaw)+iz*Math.cos(this.yaw);}
  else if(this.path.length){const p=this.path[0],d=Math.hypot(p.x-this.x,p.z-this.z);if(d<.3){this.path.shift();return this.update(dt,input,blocked,reduced);}dx=(p.x-this.x)/d;dz=(p.z-this.z)/d;}
  const move=!!(dx||dz),targetSpeed=move?(input.run?3.7:2.1):0,k=reduced?1:1-Math.exp(-dt*(move?9:15));this.vx+=(dx*targetSpeed-this.vx)*k;this.vz+=(dz*targetSpeed-this.vz)*k;
  const before={x:this.x,z:this.z};const nx=this.x+this.vx*dt,nz=this.z+this.vz*dt;
  if(walkable(nx,nz,this.obstacles)){this.x=nx;this.z=nz;}else{if(walkable(nx,this.z,this.obstacles))this.x=nx;if(walkable(this.x,nz,this.obstacles))this.z=nz;}
  const moved=Math.hypot(this.x-before.x,this.z-before.z);this.speed=dt?moved/dt:0;this.distance+=moved;if(move){const to=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(to-this.facing),Math.cos(to-this.facing));this.facing+=delta*(reduced?1:1-Math.exp(-dt*12));}
  return moved;
 }
 snapshot(){return{x:this.x,z:this.z,yaw:this.yaw,pitch:this.pitch};}
}
