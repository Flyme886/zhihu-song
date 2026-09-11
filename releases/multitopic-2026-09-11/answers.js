// Public, curated case data. Source snapshots are never attributed to an Agent.
export const palette=['#a69aff','#66d5ee','#e5b974','#75ddba','#f195af','#8aafff'];
const tints=[[.76,.55,1.35],[.32,1.02,1.3],[1.4,.85,.38],[.38,1.2,.77],[1.35,.51,.76],[.52,.75,1.4]];
const positions=[[-260,-70,72],[250,-70,70],[-350,160,66],[330,170,68],[-155,260,61],[140,265,62]];
export function styleAnswers(answers){return answers.map((n,i)=>{const [x,y,r]=positions[i%positions.length];return {...n,color:palette[i%6],tint:tints[i%6],x,y,r,offset:i*1.7+1};});}
export async function loadCatalog(){const r=await fetch('/cases/catalog.json');if(!r.ok)throw Error('话题目录暂时无法读取，请刷新重试。');return r.json();}
export async function loadAnswers(topic,signal){
  try{
    const r=await fetch(`/api/case?topicId=${encodeURIComponent(topic.id)}`,{signal});
    if(!r.ok)throw Error('未连接案例服务');
    const data=await r.json();
    if(data.topicId&&data.topicId!==topic.id)throw Error('案例响应与当前题目不匹配');
    const answers=Array.isArray(data.answers)&&data.answers.length>=2?data.answers:topic.answers;
    return {answers:styleAnswers(answers),syncedAt:data.syncedAt||null};
  }catch(error){if(signal?.aborted)throw error;return {answers:styleAnswers(topic.answers),error:'已使用策展材料，在线缓存暂不可用'};}
}
