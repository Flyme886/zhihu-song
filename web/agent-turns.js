// Offline rehearsal is deliberately explicit and never impersonates a source author.
export function demoTurn(speaker, opponent, turn, additions=[], topic=null) {
  if(topic&&topic.id!=='robotaxi')return topicTurn(speaker,opponent,turn,additions,topic);
  const stance=speaker.claim || speaker.body;
  if(speaker.sourceKind==='editorial')return caseTurn(speaker,opponent,turn,additions);
  if(turn<2)return `我从这颗星球的材料出发，关注的是：${stance}\n\n${speaker.question || '这一判断适用于哪些条件？'}`;
  const condition=additions.length?`你补充的「${additions.at(-1)}」也需要纳入条件。` : '';
  if(turn<4)return `回应另一颗星球提出的「${opponent.question || '这一判断适用于哪些条件？'}」：仅凭目前摘录，还不能给出确定答案。${condition}\n\n从我的关注点出发，${speaker.question || '有哪些材料能检验这个判断？'}`;
  return `保留我的关注点：${stance}\n\n我们可以把「${opponent.question || '判断适用的条件'}」列为下一步要核实的问题。${condition}这些材料不要求我们持相反立场；目前也不宜替原答主作出新的事实结论。`;
}
export function participantsValid(a,b){return Boolean(a && b && a.id!==b.id);}

function caseTurn(speaker,opponent,turn,additions){
 const condition=additions.at(-1)||'';
 if(turn<2)return `从${speaker.author}的角度看，${speaker.body}\n\n我想请另一方回应：${speaker.question}`;
 const response={
 progress:'我接受分阶段评估。关键是给出可检验的门槛和复查时间，让试点产生的信息能够决定下一步。',
 work:'我不把所有岗位变化都归因于无人车。但如果推进者主张社会会受益，也应说明受影响者怎样获得实际支持，不能仅用未来会出现新岗位来作保证。',
 cost:'我会把判断拆开：价格、服务和可靠性分别比较。体验价不能直接推导出长期优势。',
 safety:'我希望先约定比较条件。只有道路、时段、里程等口径可比，数据才能帮助讨论；遇到异常时的处置能力也应纳入。',
 pace:'我可以讨论扩大试点，但应先约定暂停与恢复的条件。不同区域的道路条件不同，不能用一个区域的结果替代所有区域的验证。',
 voice:'我更关心这些条件由谁决定。提供反馈入口之后，还需要说明哪些反馈被采用、哪些未被采用，以及理由。'};
 let change='';
 if(condition.includes('转岗'))change=speaker.id==='work'?'如果支持有资金保障，我会减少对过渡期的担忧，但仍需看覆盖范围和未转岗成功者的安排。':'转岗支持能改善一个条件，但不能替代安全或成本的验证。';
 else if(condition.includes('补贴')||condition.includes('优惠'))change='价格相近时，应重新比较等待时间、服务范围和可靠性，不能继续把价格优势作为既定前提。';
 else if(condition.includes('区域'))change='限定区域和时段使验证边界更具体，但扩区门槛仍需要公开并接受复查。';
 else if(condition)change='这项补充应当作为新的待检验条件，现有材料不能保证它已经实现。';
 return `回应「${opponent.question}」：${response[speaker.id]}\n\n${condition?`针对主持人的假设「${condition}」：${change}`:'需要补充相同口径的数据与受影响者的反馈，才能继续判断。'}${turn>=4?'\n\n这是演练中保留的判断，不代表真实答主改变立场。':''}`;
}

function topicTurn(speaker,opponent,turn,additions,topic){
 const stance=speaker.claim||speaker.body,condition=additions.at(-1);
 const frame=speaker.sourceKind==='zhihu'?'基于这份摘要，我先保留材料的关切，不代表原答主本人。':'这是一次明确标注的本地演练。';
 if(turn<2)return `${frame}\n\n${stance}\n\n我想追问：${speaker.question||topic.scenarios[0].text}`;
 const response=speaker.response||`目前材料不能替我确定答案。我仍关注：${speaker.question||topic.description}`;
 return `回应「${opponent.question||'这个判断适用于什么条件？'}」：${response}\n\n${condition?`针对主持人的「${condition}」，需要重新检查这个条件怎样影响${speaker.title}。${topic.scenarios.find(s=>s.text===condition)?.response||'保留原题规则，分别比较条件改变前后的选择，不把新增假设当成事实。'}`:'还可以比较：'+topic.scenarios[(turn-2)%3].text}${turn>=4?'\n\n是否调整判断，留给你确认；我们没有要求双方必须同意。':''}`;
}
