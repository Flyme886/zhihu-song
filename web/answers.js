// Public, curated case data. Source snapshots are never attributed to an Agent.
export const palette=['#a69aff','#66d5ee','#e5b974','#75ddba','#f195af','#8aafff'];
const tints=[[.76,.55,1.35],[.32,1.02,1.3],[1.4,.85,.38],[.38,1.2,.77],[1.35,.51,.76],[.52,.75,1.4]];
const positions=[[-260,-70,72],[250,-70,70],[-350,160,66],[330,170,68],[-155,260,61],[140,265,62]];
export function styleAnswers(answers){return answers.map((n,i)=>{const [x,y,r]=positions[i%positions.length];return {...n,color:palette[i%6],tint:tints[i%6],x,y,r,offset:i*1.7+1};});}
export const personalTopic={id:'personal',title:'此刻，你在想什么？',shortTitle:'写下此刻的想法',description:'话题目录暂时无法读取。你仍然可以回看本机记忆，或留下自己的想法。',group:'classic',category:'个人想法',example:'',answers:[],background:[],scenarios:[],rules:'个人输入，保存在本机。'};
export async function loadCatalog(){try{const r=await fetch('/cases/catalog.json',{signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data)||!data.length)throw Error();return data;}catch{return [{...personalTopic}];}}
export async function loadAnswers(topic,signal){
  try{
    const r=await fetch(`/api/case?topicId=${encodeURIComponent(topic.id)}`,{signal});
    if(!r.ok)throw Error('未连接案例服务');
    const data=await r.json();
    const answers=Array.isArray(data.answers)&&data.answers.length>=2?data.answers:topic.answers;
    return {answers:styleAnswers(answers),syncedAt:data.syncedAt||null};
  }catch(error){if(signal?.aborted)throw error;return {answers:styleAnswers(topic.answers),error:'已使用策展材料，在线缓存暂不可用'};}
}
