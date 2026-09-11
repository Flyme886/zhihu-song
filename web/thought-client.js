export const SUMMARY_GROUPS={insights:'新的理解',common:'共同点',differences:'仍有分歧',questions:'待核实的问题'};
export const RELATION_LABELS={similar:'观点相近',different:'值得聊聊的分歧',unrelated:'暂不相关',unknown:'信息不足'};
export const BASIS_LABELS={same_conclusion:'结论接近，比较理由',shared_concern:'共同关切，比较方案与条件',conflict:'主张存在冲突',unrelated:'讨论对象不同',insufficient:'需要更多信息'};
export const material=n=>({id:n.id,author:n.author,body:n.body});
export const providerFor=mode=>mode==='zhihu'?'zhihu':mode==='live'?'compatible':'auto';
export async function taskRequest(path,data,signal){
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'服务未返回结果');
 if(!['zhihu','compatible'].includes(result.provider))throw Error('实时服务未返回可核对的结果');
 return result;
}
export async function analysisKey(topic,me,candidates){
 const bytes=new TextEncoder().encode(JSON.stringify({version:1,topic:topic.id,rules:topic.rules,me:material(me),candidates:candidates.map(material)}));
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function companionForDiscussion(me,source,target,partner){
 return source.id===me.id&&partner&&![source.id,target.id].includes(partner.id)?partner:null;
}
export function summaryMarkdown(summary){
 if(!summary)return '';
 return '\n\n## 已确认的讨论整理\n\n'+Object.entries(SUMMARY_GROUPS).map(([key,title])=>`### ${title}\n\n`+(summary[key]||[]).map(item=>`${item.text}${item.originalText&&item.text!==item.originalText?'（用户编辑）':''}\n`+item.citations.map(c=>`\n依据 ${c.messageId}：“${c.quote}”`).join('')).join('\n\n')).join('\n\n');
}
