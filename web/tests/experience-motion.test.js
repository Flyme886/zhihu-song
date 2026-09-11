import test from 'node:test';
import assert from 'node:assert/strict';
import {createDetailTransition} from '../experience-motion.js';

function fixture(){
  const handlers=new Map(),pending=[];let focused=0;
  globalThis.innerWidth=1440;globalThis.innerHeight=900;
  globalThis.window={addEventListener(){}};
  globalThis.document={body:{dataset:{}},querySelector(){return{getBoundingClientRect:()=>({left:300,top:0,width:1140,height:900})};}};
  const dialog={open:false,dataset:{},style:{setProperty(){}},showModal(){this.open=true;},close(){this.open=false;},getBoundingClientRect:()=>({x:700,y:100,width:500,height:760}),querySelector:()=>null,getAnimations:()=>[],addEventListener(type,handler){handlers.set(type,handler);}};
  const motion={run(){let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b;});const a={finished,resolve,reject};pending.push(a);return a;}};
  const transition=createDetailTransition(dialog,motion),node={sx:400,sy:380,sr:40,el:{focus(){focused++;}}};
  return {dialog,handlers,pending,transition,node,focused:()=>focused};
}
test('native close invalidates an unfinished return animation without stealing focus',async()=>{
  const f=fixture();f.transition.open(f.node);f.transition.close();const closing=f.pending.at(-1);
  f.dialog.close();f.handlers.get('close')();closing.resolve();await closing.finished;await Promise.resolve();
  assert.equal(f.focused(),0);assert.equal(document.body.dataset.detailReading,'false');
});
test('a queued old close event does not unfreeze a newly reopened reading card',()=>{
  const f=fixture();f.transition.open(f.node);f.dialog.close();f.transition.open(f.node);f.handlers.get('close')();
  assert.equal(f.dialog.open,true);assert.equal(document.body.dataset.detailReading,'true');
});
test('cancelling close motion completes dismissal and restores source focus once',async()=>{
  const f=fixture();f.transition.open(f.node);f.transition.close();const closing=f.pending.at(-1);
  closing.reject(new Error('motion disabled'));await closing.finished.catch(()=>{});await Promise.resolve();
  assert.equal(f.dialog.open,false);assert.equal(f.focused(),1);
});
