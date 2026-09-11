import {recordMarkdown} from './session.js';
const $=s=>document.querySelector(s);
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function lines(ctx,text,maxWidth){const out=[];for(const paragraph of String(text).split('\n')){let line='';for(const c of paragraph){if(ctx.measureText(line+c).width>maxWidth){out.push(line);line=c;}else line+=c;}out.push(line);}return out;}
export function drawShareCard(canvas,record){
 const ctx=canvas.getContext('2d'),W=900,pad=76;ctx.font='500 34px "PingFang SC", "Microsoft YaHei", sans-serif';
 const body=lines(ctx,record.note||'我还在思考这个问题。',W-pad*2);ctx.font='600 32px "PingFang SC", "Microsoft YaHei", sans-serif';const title=lines(ctx,record.topicTitle,W-pad*2);
 canvas.width=W;canvas.height=Math.max(1120,340+title.length*48+body.length*58+180);
 ctx.fillStyle='#f7f9fc';ctx.fillRect(0,0,W,canvas.height);ctx.fillStyle='#1772f6';ctx.fillRect(pad,85,46,5);
 ctx.font='23px "PingFang SC",sans-serif';ctx.fillText('思想引力场  /  一次观点相遇',pad,145);
 ctx.font='600 32px "PingFang SC",sans-serif';ctx.fillStyle='#263547';let y=235;for(const line of title){ctx.fillText(line,pad,y);y+=48;}
 y+=64;ctx.font='22px "PingFang SC",sans-serif';ctx.fillStyle='#8a96a5';ctx.fillText('我现在的想法',pad,y);y+=66;
 ctx.font='500 34px "PingFang SC",sans-serif';ctx.fillStyle='#263547';for(const line of body){ctx.fillText(line,pad,y);y+=58;}
 ctx.fillStyle='#dce3eb';ctx.fillRect(pad,canvas.height-150,W-pad*2,1);ctx.font='21px "PingFang SC",sans-serif';ctx.fillStyle='#788698';
 ctx.fillText('由用户确认的讨论收获',pad,canvas.height-98);ctx.fillText(record.savedAt.slice(0,10),pad,canvas.height-61);
}
export function setupRecords({store,catalog,selectTopic,relations,renderTopics,closeTopics,openArchive}){
 let exported=null,deleted=null;
 function list(){
  const target=$('#records-list');target.replaceChildren();
  const records=catalog.flatMap(t=>store.get(t.id).records.map(r=>({...r,topicId:t.id}))).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
  if(!records.length){const p=document.createElement('p');p.textContent='还没有保存的讨论。选一个问题，留下你的第一份理解。';target.append(p);}
  for(const record of records){const article=document.createElement('article');article.className='record-item';const h=document.createElement('h2');h.textContent=record.topicTitle;const time=document.createElement('small');time.textContent=new Date(record.savedAt).toLocaleString('zh-CN');const p=document.createElement('p');p.textContent=record.note||'保留了这次对话，还未填写新的想法。';article.append(time,h,p);
   const actions=document.createElement('div');actions.className='record-actions';
   const add=(text,handler)=>{const b=document.createElement('button');b.textContent=text;b.addEventListener('click',handler);actions.append(b);};
   add('回看',async()=>{$('#records-dialog').close();await selectTopic(record.topicId);relations.record=record;relations.restore(record,true);});
   add('继续探索',async()=>{$('#records-dialog').close();await selectTopic(record.topicId);const copy=structuredClone(record);copy.id=crypto.randomUUID();copy.finished=false;copy.turn=0;copy.note='';copy.common='';copy.change='keep';relations.restore(copy);});
   add('导出',()=>{exported=structuredClone(record);$('#export-note').value=record.note||'';$('#export-status').textContent='编辑只影响本次导出；不会改写已保存记录。';drawShareCard($('#share-preview'),exported);$('#export-dialog').showModal();});
   add('删除',()=>{deleted={topicId:record.topicId,record:store.deleteRecord(record.topicId,record.id)};list();renderTopics();$('#delete-status').textContent='记录已移除，可撤销。';$('#undo-delete').hidden=false;});article.append(actions);target.append(article);
  }
 }
 $('#my-records').addEventListener('click',()=>{if(openArchive){openArchive();return;}closeTopics();list();$('#records-dialog').showModal();});
 $('#close-records').addEventListener('click',()=>$('#records-dialog').close());
 $('#undo-delete').addEventListener('click',()=>{if(deleted){store.addRecord(deleted.topicId,deleted.record);deleted=null;list();renderTopics();$('#delete-status').textContent='已恢复记录。';$('#undo-delete').hidden=true;}});
 $('#close-export').addEventListener('click',()=>$('#export-dialog').close());
 $('#export-note').addEventListener('input',()=>{if(exported){exported.note=$('#export-note').value;drawShareCard($('#share-preview'),exported);}});
 $('#export-png').addEventListener('click',async()=>{if(!exported)return;await document.fonts.ready;drawShareCard($('#share-preview'),exported);$('#share-preview').toBlob(blob=>{if(blob){download(blob,`思想引力场-${exported.topicId}.png`);$('#export-status').textContent='图片已生成。';}else $('#export-status').textContent='生成图片失败，可改为导出文字。';},'image/png');});
 $('#export-md').addEventListener('click',()=>{if(exported)download(new Blob([recordMarkdown(exported)],{type:'text/markdown;charset=utf-8'}),`思想引力场-${exported.topicId}.md`);});
}
