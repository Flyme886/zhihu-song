// Run in ego-browser only after opening the requested public Zhihu question or
// answer. Expand through the normal UI; never treat a login preview as full text.
import fs from 'node:fs/promises';

export async function captureOriginals(page,topicId,path='/tmp/zhihu-original-import.json'){
  const ids=await page.evaluate(()=>[...document.querySelectorAll('.AnswerItem[name]')].map(n=>n.getAttribute('name')).filter(id=>/^\d+$/.test(id)));
  const captured=[];
  for(const id of ids.slice(0,6)){
    const selector=`.AnswerItem[name="${id}"]`;
    if(await page.evaluate(s=>[...document.querySelector(s).querySelectorAll('button')].some(b=>b.innerText.includes('阅读全文')),selector)){
      try{await page.click(`${selector} button:has-text("阅读全文")`);}
      catch(error){
        const expanded=await page.evaluate(s=>{const n=document.querySelector(s);return !!n&&!n.querySelector('.RichContent.is-collapsed')&&![...n.querySelectorAll('button')].some(b=>b.innerText.includes('阅读全文'));},selector);
        if(!expanded&&!String(error).includes('element is not connected'))throw error;
        // Image layout shifts can detach the element during the browser's
        // scroll-to-click. Re-resolve the same visible read-more control.
        await page.evaluate(s=>{const n=document.querySelector(s);if(n?.querySelector('.RichContent.is-collapsed'))[...n.querySelectorAll('button')].find(b=>b.innerText.includes('阅读全文'))?.click();},selector);
      }
    }
    const answer=await page.evaluate(({selector,topicId})=>{
      const n=document.querySelector(selector),rich=n?.querySelector('.RichContent-inner .RichText');
      if(!rich||document.querySelector('.SignFlow')||n.querySelector('.RichContent.is-collapsed'))return null;
      if([...n.querySelectorAll('button')].some(b=>/阅读全文|购买|付费解锁/.test(b.innerText)))return null;
      const data=JSON.parse(n.dataset.zop||'{}'),extra=JSON.parse(n.getAttribute('data-za-extra-module')||'{}');
      const id=String(data.itemId||''),questionId=String(extra.card?.content?.parent_token||'');
      if(!/^\d+$/.test(id)||!/^\d+$/.test(questionId)||!rich.innerText.trim())return null;
      const author=n.querySelector('.AuthorInfo-name')?.innerText.replace(/\u200b/g,'').trim()||data.authorName;
      const time=n.querySelector('.ContentItem-time a');
      return {id:'zhihu-'+id,answerId:id,topicId,questionId,questionTitle:data.title,author,
        avatar:n.querySelector('.AuthorInfo-avatar')?.currentSrc||n.querySelector('.AuthorInfo-avatar')?.src||'',
        bio:n.querySelector('.AuthorInfo-badge')?.innerText.replace(/\u200b/g,'').trim()||'',
        title:author+'的回答',body:rich.innerText,contentHtml:rich.innerHTML,contentStatus:'full',
        source:'知乎原回答',sourceKind:'zhihu',url:`https://www.zhihu.com/question/${questionId}/answer/${id}`,
        publishedText:time?.getAttribute('data-tooltip')||time?.getAttribute('aria-label')||'',
        editedText:time?.innerText||'',captured:new Date().toISOString().slice(0,10),
        capturedAt:new Date().toISOString(),retrieval:'public-answer-page',
        exampleRelation:'unknown',reason:'阅读原回答后，确认你们的观点关系。'};
    },{selector,topicId});
    if(answer)captured.push(answer);
  }
  let stored=[];try{stored=JSON.parse(await fs.readFile(path,'utf8'));}catch{}
  const map=new Map(stored.map(n=>[n.topicId+':'+n.answerId,n]));
  for(const n of captured)map.set(n.topicId+':'+n.answerId,n);
  await fs.writeFile(path,JSON.stringify([...map.values()],null,2));
  return captured.map(n=>({topic:n.topicId,id:n.answerId,author:n.author,chars:n.body.length,images:(n.contentHtml.match(/<img\b/g)||[]).length,questionId:n.questionId,date:n.publishedText}));
}
