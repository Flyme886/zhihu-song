const allowed = new Set('p br strong b em i u s del blockquote pre code ul ol li h1 h2 h3 h4 h5 h6 div span figure figcaption img a table thead tbody tr th td hr sup sub'.split(' '));
const discard = new Set('script style iframe object embed form input button textarea select svg math noscript'.split(' '));
function safeURL(value, base, image = false) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, base);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return '';
    if (image && !(url.hostname === 'zhimg.com' || url.hostname.endsWith('.zhimg.com'))) return '';
    return url.href;
  } catch { return ''; }
}

const text = value => typeof value === 'string' ? value.trim() : '';
const withoutUnsafeMarkup = html => html.replace(/<(script|style|iframe|object|embed|form|svg|math|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
function hasOriginalContent(answer) {
  const html=withoutUnsafeMarkup(text(answer.contentHtml));
  if(html.replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160|#xA0);/gi,' ').trim())return true;
  // Image-only answers are valid too, provided the image can actually be kept.
  return [...html.matchAll(/<img\b[^>]*>/gi)].some(([tag])=>
    [...tag.matchAll(/\b(?:data-original|data-actualsrc|data-src|src)\s*=\s*["']([^"']+)["']/gi)].some(([,src])=>safeURL(src,answer.url,true)));
}
function zhihuAnswerURL(value) {
  const url=safeURL(value);if(!url)return '';
  const parsed=new URL(url);
  return (parsed.hostname==='zhihu.com'||parsed.hostname.endsWith('.zhihu.com'))&&/^\/question\/\d+\/answer\/\d+\/?$/.test(parsed.pathname)?url:'';
}

// A legacy body may be a curator's summary or a prepared discussion viewpoint.
// Neither a capture date nor a Zhihu link turns that body into original prose.
export function normalizeAnswer(input={}) {
  const answer=input&&typeof input==='object'?input:{};
  const body=text(answer.body)||text(answer.summary)||text(answer.excerpt)||text(answer.claim);
  const url=safeURL(answer.url),originalURL=zhihuAnswerURL(url);
  let kind='unverified';
  if(answer.sourceKind==='personal')kind='personal';
  else if(['editorial','example','demo'].includes(answer.sourceKind)||/非答主原文|示例观点/.test(text(answer.source)))kind='example';
  else if(answer.sourceKind==='curated'||/策展摘要|策展概括/.test(text(answer.source)))kind='curated';
  else if(answer.contentStatus==='full'&&originalURL&&hasOriginalContent(answer))kind='original';
  else if(answer.contentStatus==='excerpt'&&originalURL)kind='excerpt';
  else if(originalURL&&body)kind='curated';
  if(!body&&kind!=='original')kind='unavailable';
  const sourceKind=kind==='original'||kind==='excerpt'?'zhihu':kind==='example'?'editorial':kind==='personal'?'personal':kind==='curated'?'curated':'unknown';
  const labels={original:'知乎原回答',curated:'策展摘要',example:'示例观点',excerpt:'知乎回答摘要',personal:'我的输入',unverified:'来源待核实',unavailable:'材料暂缺'};
  const author=kind==='example'?'案例策划':kind==='personal'?(text(answer.author)||'我'):text(answer.author)||'作者信息未提供';
  return {...answer,body,url,author,sourceKind,source:labels[kind],contentKind:kind,
    contentStatus:kind==='original'?'full':kind==='excerpt'?'excerpt':kind==='unavailable'?'unavailable':kind==='personal'?'personal':kind==='example'?'example':'summary',
    avatar:kind==='example'||kind==='unavailable'?'':safeURL(answer.avatar,undefined,true),
    bio:kind==='example'?'案例策划 · 讨论视角':text(answer.bio)};
}

export function answerPresentation(input) {
  const answer=normalizeAnswer(input),kind=answer.contentKind;
  const context={original:'保留原作者表达。',curated:'根据来源整理的策展摘要，不是原文引用。',example:'为探索问题编写的示例观点，不代表真实答主。',excerpt:'当前仅提供回答摘要，完整表达请查看知乎原回答。',personal:'本机保存的个人输入。',unverified:'来源尚未核实，请勿作为原文引用。',unavailable:'这条观点暂时没有可读材料。可重新加载材料，或查看已提供的来源。'}[kind];
  const captured=text(answer.captured);
  const date=kind==='original'?(text(answer.editedText)||text(answer.publishedText)||(captured?`原文读取于 ${captured}`:'知乎原回答')):
    kind==='personal'?'本机保存的个人输入':kind==='unavailable'?'完整材料尚未载入':
    captured?`${kind==='example'?'示例整理于':kind==='curated'?'摘要整理于':kind==='excerpt'?'摘要读取于':'材料记录于'} ${captured}`:context;
  return {kind,label:answer.source,author:answer.author,bio:answer.bio,avatar:answer.avatar,url:answer.url,
    linkLabel:zhihuAnswerURL(answer.url)?'查看知乎原回答 ↗':'查看来源 ↗',context,date,isOriginal:kind==='original',hasContent:kind!=='unavailable'};
}

function appendPlain(target,value) {
  for(const paragraph of value.split(/\n\s*\n/)){
    const p=document.createElement('p');p.textContent=paragraph;p.style.whiteSpace='pre-wrap';target.append(p);
  }
}

// Preserve the answer's text and semantic markup. Copy only inert, supported
// elements; remote event handlers, styles and embeds never enter the app DOM.
export function renderOriginal(target, input, {onRetry}={}) {
  const answer=normalizeAnswer(input),presentation=answerPresentation(answer);
  target.replaceChildren();
  target.classList.add('original-content');
  target.dataset.contentKind=presentation.kind;
  if (!presentation.isOriginal) {
    if(presentation.kind!=='personal'){
      const note=document.createElement('p');note.classList.add('content-provenance');note.textContent=presentation.context;target.append(note);
    }
    if(answer.body)appendPlain(target,answer.body);
    if(!presentation.hasContent&&typeof onRetry==='function'){
      const retry=document.createElement('button');retry.type='button';retry.classList.add('content-retry');retry.textContent='重新加载材料';retry.addEventListener('click',onRetry);target.append(retry);
    }
    return presentation;
  }
  const parsed = document.createElement('template');parsed.innerHTML=answer.contentHtml;
  function copy(source, parent) {
    if (source.nodeType === Node.TEXT_NODE) {parent.append(document.createTextNode(source.textContent));return;}
    if (source.nodeType !== Node.ELEMENT_NODE) return;
    const tag=source.localName;
    if (discard.has(tag)) return;
    if (!allowed.has(tag)) {for(const child of source.childNodes)copy(child,parent);return;}
    const node=document.createElement(tag);
    if(tag==='img'){
      const raw=source.getAttribute('data-original')||source.getAttribute('data-actualsrc')||source.getAttribute('data-src')||source.getAttribute('src');
      const src=raw&&safeURL(raw,answer.url,true);if(!src)return;
      node.src=src;node.alt=source.getAttribute('alt')||'知乎原回答配图';node.loading='lazy';node.decoding='async';node.referrerPolicy='no-referrer';
      node.addEventListener('error',()=>{const link=document.createElement('a');link.href=answer.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='这张图片暂未加载，前往原回答查看 ↗';node.replaceWith(link);},{once:true});
    }
    if(tag==='a'){
      const href=safeURL(source.getAttribute('href'),answer.url);
      if(href){node.href=href;node.target='_blank';node.rel='noopener noreferrer';}
    }
    if(['td','th'].includes(tag))for(const attr of ['colspan','rowspan']){const value=Number(source.getAttribute(attr));if(value>0&&value<=20)node.setAttribute(attr,String(value));}
    for(const child of source.childNodes)copy(child,node);
    parent.append(node);
  }
  for(const child of parsed.content.childNodes)copy(child,target);
  return presentation;
}

export function answerDate(answer) {
  return answerPresentation(answer).date;
}
