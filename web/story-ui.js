import {STORY_TITLE, OLD_JUDGMENT, STORY_MEMORIES, STORY_OPINIONS, ENDING_LABELS, CONDITIONS, dialogueRounds} from './story.js';

const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const add=(parent,...children)=>{parent.append(...children.filter(Boolean));return parent;};

/** Self-contained modal, with no routing or session-store dependencies. */
export function createStoryUI({store,onClose=()=>{},onSave=()=>{},onExplore}={}) {
  if(!store)throw Error('createStoryUI needs a story store');
  const dialog=el('dialog',undefined,'story-overlay');dialog.setAttribute('aria-label',STORY_TITLE);dialog.dataset.story='demo';
  document.body.append(dialog);
  let open=false,disposed=false,returnFocus=null,feedback='';
  const action=(label,fn,className='story-button',name)=>{
    const button=el('button',label,className);button.type='button';if(name)button.dataset.storyAction=name;
    button.addEventListener('click',()=>{feedback='';const result=fn();if(result?.ok===false){feedback=result.error;updateStatus();}});return button;
  };
  const kicker=text=>el('p',text,'story-kicker');
  function updateStatus(){
    const state=store.getState(),status=dialog.querySelector('.story-status');
    if(!status)return;status.textContent=feedback||state.persistence.message;
    status.dataset.error=String(Boolean(feedback)||!state.persistence.ok);
    status.setAttribute('role',!state.persistence.ok||feedback?'alert':'status');
  }
  function openDialog(){
    if(disposed)return;
    if(!open){returnFocus=document.activeElement;open=true;dialog.showModal();document.body.classList.add('story-is-open');}
    render();
  }
  function close({silent=false}={}){
    if(!open)return;open=false;dialog.close();document.body.classList.remove('story-is-open');if(!silent)onClose();
    if(!silent&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  }
  function start(){const result=store.start();openDialog();return result;}
  function openMemory(id){
    if(id==='living-room'||!id){const result=store.start();openDialog();return result;}
    const result=store.openMemory(id);if(result.ok||store.getState().activeMemoryId===id)openDialog();return result;
  }
  function header(){
    const header=el('header',undefined,'story-header');
    const identity=add(el('div',undefined,'story-identity'),el('span','✳','story-mark'),add(el('div'),el('strong','故事演示'),el('small','一段关于「留下」的旅程')));
    const closeButton=action('回到花田 ↗',close,'story-text-button','close');closeButton.setAttribute('aria-label','关闭故事，回到花田');
    return add(header,identity,closeButton);
  }
  function footer(){
    const footer=el('footer',undefined,'story-footer');
    const left=add(el('div',undefined,'story-footer-copy'),el('span','✦','story-tiny-flower'),el('p',undefined,'story-status'));
    const history=el('details',undefined,'story-history-menu');
    history.append(el('summary','沿途的六段往事 ↗'));
    const list=el('nav',undefined,'story-history-links');list.setAttribute('aria-label','随时回看预置往事');
    for(const item of STORY_MEMORIES)list.append(action(item.title,()=>store.openMemory(item.id),'story-history-link',item.id));
    history.append(list);return add(footer,left,history);
  }
  function progress(stage){
    const names=[['intro','一张旧便签'],['viewpoints','遇见两种生活'],['dialogue','换一个前提'],['reflection','留下此刻']];
    const nav=el('div',undefined,'story-progress');nav.setAttribute('aria-label','故事进度');
    for(const [index,[id,label]] of names.entries()){
      const item=el('span',`${String(index+1).padStart(2,'0')}  ${label}`);item.dataset.active=String(id===stage||(stage==='saved'&&id==='reflection'));nav.append(item);
    }
    return nav;
  }
  function intro(){
    const wrap=el('section',undefined,'story-intro story-page');
    const copy=el('div',undefined,'story-intro-copy');
    add(copy,kicker('一张从前留下的便签'),el('h1','我想留下的，\n其实是什么？'));
    const note=add(el('blockquote',undefined,'story-old-note'),el('span','从前，我这样想'),el('p',OLD_JUDGMENT));
    add(copy,note,el('p','那时，你想把客厅腾空。\n今天重新走到这里，那个判断还适合你吗？','story-lead'),action('带着这个想法，往前走 ↗',()=>store.showViewpoints(),'story-button story-primary','begin'));
    const art=el('div',undefined,'story-room-art');art.setAttribute('aria-hidden','true');
    art.innerHTML='<div class="story-room-sun"></div><div class="story-room-window"><i></i><i></i></div><div class="story-room-hill"></div><div class="story-room-floor"></div><div class="story-room-rug"></div><div class="story-room-chair"><i></i></div><div class="story-room-table"></div><div class="story-room-vase"><i></i><b>✳</b></div><span class="story-room-word">ROOM FOR<br>WHAT MATTERS.</span><div class="story-room-caption">不急着搬走什么，<br>先看看自己想留下什么。</div>';
    add(wrap,copy,art);return wrap;
  }
  function viewpoints(state){
    const main=state.main,wrap=el('section',undefined,'story-page story-viewpoints');
    const top=add(el('div',undefined,'story-page-heading'),kicker('不是选正确答案，是邀请两种生活'),el('h1','如果客厅没有电视，\n它还可以留下什么？'),el('p','点开观点球，读读他们的生活。邀请任意两位，陪你把问题往下想。','story-lead'));
    const split=el('div',undefined,'story-viewpoint-layout');
    const canvas=el('div',undefined,'story-opinion-canvas');canvas.setAttribute('aria-label','四颗脚本角色观点球');
    canvas.append(el('span','THOUGHTS IN BLOOM','story-canvas-label'),el('i',undefined,'story-orbit story-orbit-one'),el('i',undefined,'story-orbit story-orbit-two'));
    for(const [index,role] of STORY_OPINIONS.entries()){
      const selected=main.selectedOpinionIds.includes(role.id),read=main.readOpinionIds.includes(role.id);
      const ball=action('',()=>store.readOpinion(role.id),'story-opinion-ball story-ball-'+role.color,'read-'+role.id);
      ball.dataset.index=String(index);ball.dataset.selected=String(selected);ball.dataset.read=String(read);ball.dataset.focused=String(main.activeOpinionId===role.id);
      ball.setAttribute('aria-label',`${role.name}：${role.claim}${selected?'，已邀请':read?'，已读':''}`);ball.setAttribute('aria-pressed',String(main.activeOpinionId===role.id));
      add(ball,el('span',role.symbol,'story-ball-symbol'),el('strong',role.name),el('small',selected?'已邀请 ✓':read?'读过了':'点开读读'));
      canvas.append(ball);
    }
    const detail=el('article',undefined,'story-opinion-detail');
    const role=STORY_OPINIONS.find(role=>role.id===main.activeOpinionId);
    if(role){
      add(detail,kicker(`${role.name} · 脚本角色`),el('h2',role.claim),el('p',role.body,'story-body'),el('p',role.boundary,'story-boundary'));
      const selected=main.selectedOpinionIds.includes(role.id);
      const select=action(selected?'已邀请 · 点击取消':'邀请这颗观点球 ＋',()=>store.setSelected(selected?main.selectedOpinionIds.filter(id=>id!==role.id):[...main.selectedOpinionIds,role.id]),'story-button'+(selected?' story-selected':' story-secondary'),'select-'+role.id);
      select.disabled=!selected&&main.selectedOpinionIds.length===2;detail.append(select);
      if(!selected&&main.selectedOpinionIds.length===2)detail.append(el('small','已经邀请了两位。可以先取消其中一位，再换一颗。','story-hint'));
    }else{
      add(detail,el('span','↖','story-detail-arrow'),el('h2','先走近一颗观点球'),el('p','四位角色来自这段故事的脚本。每一种看法，都有自己的生活前提。','story-body'),el('small','演示发言，不代表真实答主或社区用户。','story-hint'));
    }
    add(split,canvas,detail);
    const bottom=el('div',undefined,'story-selection-bar');
    const selectedNames=main.selectedOpinionIds.map(id=>STORY_OPINIONS.find(role=>role.id===id).name);
    add(bottom,add(el('div'),el('strong',selectedNames.length?selectedNames.join('  ×  '):'留两个位置，给不同的看法'),el('small',`已邀请 ${selectedNames.length} / 2 位 · 选择会改变对谈内容`)));
    const begin=action('让他们坐下来聊聊 ↗',()=>store.beginDialogue(),'story-button story-primary','begin-dialogue');begin.disabled=selectedNames.length!==2;bottom.append(begin);
    return add(wrap,top,split,bottom);
  }
  function conditionPicker(state){
    const wrap=el('fieldset',undefined,'story-condition');wrap.append(el('legend','把生活前提换一下'));
    const buttons=el('div',undefined,'story-condition-options');
    for(const [id,label] of Object.entries(CONDITIONS)){
      const button=action(label,()=>store.setCondition(id),'story-condition-button','condition-'+id);button.setAttribute('aria-pressed',String(state.main.condition===id));buttons.append(button);
    }
    add(wrap,buttons,el('small','前提一换，他们的回应和追问也会跟着变。'));return wrap;
  }
  function messagesBlock(messages){
    const list=el('div',undefined,'story-messages');
    for(const message of messages){
      const role=STORY_OPINIONS.find(item=>item.id===message.opinionId);
      const row=el('article',undefined,'story-message');if(role)row.dataset.color=role.color;
      const symbol=el('span',role?.symbol||'◌','story-speaker-symbol');symbol.setAttribute('aria-hidden','true');
      const copy=add(el('div'),el('p',message.who,'story-speaker'),el('p',message.text,'story-body'));
      add(row,symbol,copy);list.append(row);
    }
    return list;
  }
  function dialogue(state){
    const main=state.main,rounds=dialogueRounds(main),current=rounds[main.round],wrap=el('section',undefined,'story-page story-dialogue-page');
    const aside=el('aside',undefined,'story-dialogue-aside');
    add(aside,kicker('一次小小的对谈'),el('h1','先换一个前提，\n再看看答案。'),add(el('blockquote',undefined,'story-mini-note'),el('small','带来的旧判断'),el('p',OLD_JUDGMENT)),conditionPicker(state),action('重新邀请观点球',()=>store.showViewpoints(),'story-text-button','reselect'));
    const conversation=el('div',undefined,'story-conversation');
    add(conversation,kicker(`第 ${main.round+1} / ${rounds.length} 轮`),el('h2',current.title),el('p',current.prompt,'story-round-prompt'),messagesBlock(current.messages));
    if(main.round>0){
      const previous=el('details',undefined,'story-previous-turns');previous.append(el('summary','回看前面的对谈'));
      for(const round of rounds.slice(0,main.round))add(previous,el('h3',round.title),messagesBlock(round.messages));conversation.append(previous);
    }
    const next=action(main.round===3?'写下我此刻的想法 ↗':'继续听下一轮 →',()=>store.advanceDialogue(),'story-button story-primary','next-round');conversation.append(next);
    return add(wrap,aside,conversation);
  }
  function reflection(state){
    const main=state.main,wrap=el('section',undefined,'story-page story-reflection');
    const copy=add(el('div',undefined,'story-reflection-copy'),kicker('走到这里，不必成为另一个人'),el('h1','此刻，\n你想留下什么？'),el('p','你可以保留原来的判断，也可以为它加上前提。\n这张便签，由你来写。','story-lead'),add(el('blockquote',undefined,'story-mini-note'),el('small','来时的想法'),el('p',OLD_JUDGMENT)),el('p',`这次讨论的前提：${CONDITIONS[main.condition]}`,'story-condition-caption'));
    const editor=el('div',undefined,'story-note-editor');
    const choices=el('div',undefined,'story-ending-options');choices.setAttribute('role','group');choices.setAttribute('aria-label','如何看待原来的判断');
    for(const [id,label] of Object.entries(ENDING_LABELS)){
      const button=action(label,()=>store.chooseEnding(id),'story-ending-button','ending-'+id);button.setAttribute('aria-pressed',String(main.ending===id));choices.append(button);
    }
    add(editor,choices);
    const label=el('label','我现在的想法','story-note-label');label.htmlFor='story-note';editor.append(label);
    const input=el('textarea',undefined,'story-note-input');input.id='story-note';input.value=main.note;input.maxLength=2000;input.rows=8;input.placeholder='先选一种收获，再把便签改成自己的话。';input.setAttribute('aria-describedby','story-note-hint');
    input.addEventListener('input',()=>{feedback='';store.setNote(input.value);const count=dialog.querySelector('.story-note-count');if(count)count.textContent=`${input.value.length} / 2000`;const save=dialog.querySelector('[data-story-action="save"]');if(save)save.disabled=!store.getState().main.ending||!input.value.trim();});
    const hint=el('small','这段话可以自由修改，保存后会成为花田里的一段新记忆。','story-hint');hint.id='story-note-hint';
    add(editor,input,add(el('div',undefined,'story-note-meta'),hint,el('span',`${main.note.length} / 2000`,'story-note-count')));
    const save=action('把这张便签留在星球上 ✳',()=>{const result=store.saveMemory();if(result.ok)onSave(result.record);return result;},'story-button story-primary','save');save.disabled=!main.ending||!main.note.trim();editor.append(save);
    if(!state.persistence.ok)editor.append(action('复制便签',async()=>{try{await navigator.clipboard.writeText(input.value);feedback='便签已复制。故事存档仍未保存。';}catch{input.focus();input.select();feedback='已选中便签文字，可以手动复制。';}updateStatus();},'story-text-button','copy-note'));
    return add(wrap,copy,editor);
  }
  function memory(state){
    const item=store.memoryItems().find(record=>record.id===state.activeMemoryId);
    if(!item)return intro();
    const own=item.id==='living-room-record',wrap=el('section',undefined,'story-page story-memory-page');
    const title=add(el('div',undefined,'story-memory-heading'),kicker(own?'一段新记忆，已经在这里':item.origin),el('p',item.topicTitle,'story-memory-topic'),el('h1',item.title),el('p',item.chapter,'story-memory-chapter'));
    const article=el('article',undefined,'story-memory-paper');
    if(own){
      add(article,el('span','✳','story-saved-flower'),el('p',ENDING_LABELS[item.ending],'story-memory-tag'),el('p',item.note,'story-memory-note'),el('p',`生活前提：${CONDITIONS[item.condition]}`,'story-condition-caption'));
      const previous=add(el('details',undefined,'story-previous-turns'),el('summary','回看旧判断与完整对谈'),el('blockquote',item.previous,'story-mini-note'),messagesBlock(item.messages));article.append(previous);
    }else{
      if(item.judgment)article.append(el('blockquote',item.judgment,'story-seed-judgment'));
      article.append(el('p',item.body,'story-body story-memory-body'));
      if(item.messages)article.append(messagesBlock(item.messages));
      if(item.note)article.append(el('blockquote',item.note,'story-seed-note'));
    }
    const actions=el('div',undefined,'story-memory-actions');
    if(own){
      add(actions,action('回花田看看这段新记忆 ↗',close,'story-button story-primary','return-memory'),action('再走一遍，换个前提',()=>store.restart(),'story-text-button','restart'));
      if(onExplore)actions.append(action('带着这个想法继续探索',()=>{close();onExplore('living-room');},'story-text-button','explore'));
    }else add(actions,action('继续客厅的故事 ↗',()=>store.start(),'story-button story-primary','resume'),action('回到花田',close,'story-text-button','return-field'));
    add(article,actions);return add(wrap,title,article);
  }
  function render(){
    if(!open||disposed)return;
    const focusAction=dialog.contains(document.activeElement)?document.activeElement.dataset.storyAction:null;
    const state=store.getState();dialog.replaceChildren(header());
    if(!state.activeMemoryId)dialog.append(progress(state.main.stage));
    const content=state.activeMemoryId?memory(state):({intro,viewpoints,dialogue,reflection,saved:()=>memory({...state,activeMemoryId:'living-room-record'})}[state.main.stage])(state);
    dialog.append(content,footer());updateStatus();
    if(focusAction)dialog.querySelector(`[data-story-action="${focusAction}"]`)?.focus({preventScroll:true});
    if(!dialog.contains(document.activeElement)||document.activeElement===dialog){const h=dialog.querySelector('h1');h.tabIndex=-1;h.focus({preventScroll:true});}
  }
  const unsubscribe=store.subscribe((_state,event)=>{if(event?.type==='note'||event?.action==='note'){updateStatus();return;}render();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  return{open:openMemory,start,close,isOpen:()=>open,dispose(){if(disposed)return;close({silent:true});disposed=true;unsubscribe();dialog.remove();}};
}
