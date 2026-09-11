import assert from 'node:assert/strict';

// Runs entirely in a detached DOM; no navigation, storage writes or API calls.
export async function verifyHistoricalContent(page) {
  const result=await page.evaluate(async()=>{
    const {renderOriginal,answerPresentation}=await import('/original-answer.js');
    const fixtures=[
      {id:'life',title:'先回应眼前的生命',author:'先回应眼前的生命',sourceKind:'editorial',source:'案例策划 · 非答主原文',body:'我倾向保护能感受痛苦的生命。',captured:'2026-09-11'},
      {id:'art',sourceKind:'zhihu',source:'知乎回答 · 策展摘要',author:'日寸三吉',body:'讨论画无法自行逃生以及文化传承的意义。',url:'https://www.zhihu.com/question/356196758/answer/902817528',captured:'2026-09-11'},
      {id:'excerpt',sourceKind:'zhihu',contentStatus:'excerpt',body:'缓存中的回答摘要。',url:'https://www.zhihu.com/question/1/answer/2',captured:'2026-09-11'},
      {id:'empty',url:'javascript:alert(1)',captured:'2026-09-11'}
    ];
    let retries=0;
    const rows=fixtures.map(answer=>{
      const target=document.createElement('div');
      renderOriginal(target,answer,{onRetry(){retries++;}});
      target.querySelector('button')?.click();
      return {id:answer.id,text:target.textContent,kind:target.dataset.contentKind,...answerPresentation(answer)};
    });
    const target=document.createElement('div');
    renderOriginal(target,{sourceKind:'zhihu',contentStatus:'full',url:'https://www.zhihu.com/question/1/answer/2',contentHtml:'<p onclick="alert(1)">原始<strong>段落</strong></p><script>alert(1)</script><a href="javascript:alert(1)">危险链接</a><iframe src="https://example.com"></iframe><img src="https://evil.example/track"><noscript><p>不能出现</p></noscript><blockquote>引用</blockquote><a href="/question/1/answer/2">来源</a>'});
    return {rows,retries,original:{kind:target.dataset.contentKind,text:target.textContent,unsafe:target.querySelectorAll('script,iframe,img,[onclick],[onerror]').length,links:[...target.querySelectorAll('a')].map(a=>a.getAttribute('href'))}};
  });
  assert.deepEqual(result.rows.map(n=>n.kind),['example','curated','excerpt','unavailable']);
  assert.ok(result.rows[0].text.includes('我倾向保护能感受痛苦的生命。'));
  assert.equal(result.rows[0].author,'案例策划');
  assert.ok(result.rows[1].text.includes('讨论画无法自行逃生以及文化传承的意义。'));
  assert.ok(result.rows[2].text.includes('缓存中的回答摘要。'));
  for(const row of result.rows)assert.doesNotMatch(row.date,/原文读取/);
  assert.equal(result.rows[3].url,'');
  assert.equal(result.retries,1);
  assert.equal(result.original.kind,'original');
  assert.equal(result.original.unsafe,0);
  assert.ok(result.original.text.includes('原始段落'));
  assert.ok(!result.original.text.includes('不能出现'));
  assert.deepEqual(result.original.links,[null,'https://www.zhihu.com/question/1/answer/2']);
  return {historicalKinds:result.rows.map(n=>n.kind),historicalBodiesReadable:true,emptyRetry:true,inertOriginalMarkup:true};
}
