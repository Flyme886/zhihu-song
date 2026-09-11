// Public, curated case data. Source snapshots are never attributed to an Agent.
import {normalizeAnswer,answerPresentation} from './original-answer.js';
export const palette=['#a69aff','#66d5ee','#e5b974','#75ddba','#f195af','#8aafff'];
const tints=[[.76,.55,1.35],[.32,1.02,1.3],[1.4,.85,.38],[.38,1.2,.77],[1.35,.51,.76],[.52,.75,1.4]];
const positions=[[-260,-70,72],[250,-70,70],[-350,160,66],[330,170,68],[-155,260,61],[140,265,62]];
export function styleAnswers(answers){return answers.map(normalizeAnswer).filter(n=>answerPresentation(n).isOriginal).map((n,i)=>{const angle=(i-6)*Math.PI/3-Math.PI/2;const [x,y,r]=i<6?positions[i]:[Math.cos(angle)*540,Math.sin(angle)*410,62];return {...n,color:palette[i%6],tint:tints[i%6],x,y,r,offset:i*1.7+1};});}
const answerKey=n=>String(n.answerId||n.url?.match(/\/answer\/(\d+)/)?.[1]||n.id||'');
export function mergeAnswers(preset,online=[]){
  const result=[],indices=new Map();
  for(const input of preset){
    const node=normalizeAnswer(input),key=answerKey(node);
    if(!key||!answerPresentation(node).isOriginal)continue;
    if(indices.has(key))continue;
    indices.set(key,result.length);result.push(node);
  }
  for(const input of online){
    const node=normalizeAnswer(input);
    if(!answerPresentation(node).isOriginal)continue;
    const key=answerKey(node);if(!key)continue;
    if(indices.has(key)){const i=indices.get(key);result[i]={...node,id:result[i].id};}
    else{indices.set(key,result.length);result.push({...node});}
  }
  return result;
}
export const personalTopic={id:'personal',title:'此刻，你在想什么？',shortTitle:'写下此刻的想法',description:'话题目录暂时无法读取。你仍然可以回看本机记忆，或留下自己的想法。',group:'classic',category:'个人想法',example:'',answers:[],background:[],scenarios:[],rules:'个人输入，保存在本机。'};
export async function loadCatalog(){try{const r=await fetch('/cases/catalog.json',{signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data)||!data.length)throw Error();return data;}catch{return [{...personalTopic}];}}
export async function loadAnswers(topic,signal){
  try{
    const r=await fetch(`/api/case?topicId=${encodeURIComponent(topic.id)}`,{signal});
    if(!r.ok)throw Error('未连接案例服务');
    const data=await r.json();
    if(!Array.isArray(data.answers)||data.topicId!==topic.id)throw Error('材料响应格式无效');
    const answers=mergeAnswers(topic.answers,data.answers),presetCount=mergeAnswers(topic.answers).length;
    return {answers:styleAnswers(answers),syncedAt:data.syncedAt||null,onlineCount:data.answers.length,addedCount:Math.max(0,answers.length-presetCount),pendingOriginals:data.answers.map(normalizeAnswer).filter(n=>!answerPresentation(n).isOriginal&&!answers.some(a=>answerKey(a)===answerKey(n))),source:data.source};
  }catch(error){if(signal?.aborted)throw error;return {answers:styleAnswers(mergeAnswers(topic.answers)),error:'在线更新暂不可用，已保留现有材料'};}
}
