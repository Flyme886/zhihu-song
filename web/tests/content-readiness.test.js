import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeAnswers, styleAnswers, loadAnswers} from '../answers.js';
import {renderOriginal, answerDate, normalizeAnswer, answerPresentation} from '../original-answer.js';

const life = {id:'life',title:'先回应眼前的生命',author:'先回应眼前的生命',body:'我倾向保护能感受痛苦的生命，无法仅把生命与作品的市场价格放在一起比较。',sourceKind:'editorial',source:'案例策划 · 非答主原文',captured:'2026-09-11'};
const summary = {id:'art',author:'日寸三吉',body:'讨论画无法自行逃生以及文化传承的意义。',sourceKind:'zhihu',source:'知乎回答 · 策展摘要',url:'https://www.zhihu.com/question/356196758/answer/902817528',captured:'2026-09-11'};

// The reported failure happens before HTML parsing: an existing plain-text
// viewpoint is replaced with the unavailable-original message.
function renderPlain(answer, options) {
  const previous = globalThis.document;
  const element = () => ({children:[],classList:{add(){}},dataset:{},style:{},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(){},textContent:''});
  globalThis.document = {createElement:element};
  try {const target=element();renderOriginal(target,answer,options);return target.children.map(n=>n.textContent).join('\n');}
  finally {globalThis.document=previous;}
}

test('the first click on a legacy editorial planet renders its actual viewpoint',()=>{
  const body=renderPlain(life);
  assert.ok(body.includes(life.body),body);
  assert.doesNotMatch(body,/原回答尚未载入/);
  assert.doesNotMatch(answerDate(life),/原文读取/);
});

test('historical summaries remain readable but never enter the current original-only canvas',async()=>{
  assert.equal(mergeAnswers([life,summary],[]).length,0);
  assert.equal(styleAnswers([life,summary]).length,0);
  assert.ok(renderPlain(summary).includes(summary.body));
  const previous=globalThis.fetch;
  try {
    globalThis.fetch=async()=>{throw Error('offline');};
    const loaded=await loadAnswers({id:'cat-art',answers:[life,summary]});
    assert.equal(loaded.answers.length,0);
    assert.ok(renderPlain(life).includes(life.body));
    assert.doesNotMatch(loaded.error,/已保留原回答/);
  } finally {globalThis.fetch=previous;}
});

test('normalization does not invent a Zhihu author for a curated example',()=>{
  const normalized=normalizeAnswer(life);
  assert.notEqual(normalized.author,life.title);
  assert.equal(normalized.sourceKind,'editorial');
  assert.equal(life.author,life.title,'the original input is left unchanged');
});

test('original, summary, excerpt and example metadata cannot be confused by a capture date',()=>{
  const full={...summary,source:'知乎原回答',contentStatus:'full',contentHtml:'<p>实际原回答正文</p>',publishedText:'发布于 2019-11-20'};
  for(const [answer,kind] of [[full,'original'],[summary,'curated'],[life,'example'],[{...summary,source:'知乎 API · 回答摘要',contentStatus:'excerpt'},'excerpt']]){
    const presentation=answerPresentation(answer);
    assert.equal(presentation.kind,kind);
    assert.equal(presentation.isOriginal,kind==='original');
    assert.deepEqual(normalizeAnswer(normalizeAnswer(answer)),normalizeAnswer(answer),'normalization is stable across loading and rendering');
    if(kind!=='original')assert.doesNotMatch(presentation.date,/原文读取|发布于/);
  }
  assert.equal(answerPresentation(full).date,full.publishedText);
  assert.equal(answerPresentation({...full,url:'https://example.com/answer/2'}).isOriginal,false);
  assert.equal(answerPresentation({...full,url:'javascript:alert(1)'}).url,'');
  assert.equal(answerPresentation({...full,body:'',claim:'',contentHtml:'<script>alert(1)</script>'}).hasContent,false);
});

test('an incoming full original enters the canvas while historical summaries remain excluded',()=>{
  const original={id:'zhihu-902817528',answerId:'902817528',sourceKind:'zhihu',contentStatus:'full',url:summary.url,body:'实际原文',contentHtml:'<p>实际原文</p>'};
  const merged=mergeAnswers([summary,life],[original]);
  assert.equal(merged.length,1);
  assert.equal(merged[0].id,original.id);
  assert.equal(merged[0].contentKind,'original');
  assert.equal(summary.body,'讨论画无法自行逃生以及文化传承的意义。');
});

test('empty material shows an actionable state without claiming a missing original exists',()=>{
  const result=renderPlain({id:'missing',captured:'2026-09-11'}, {onRetry(){}});
  assert.match(result,/没有可读材料/);
  assert.match(result,/重新加载材料/);
  assert.doesNotMatch(result,/原文读取|知乎用户/);
});
