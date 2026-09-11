import {demoTurn,participantsValid} from './agent-turns.js';
import {snapshotDiscussion} from './session.js';
import {relationFor, nearestRelated, followPair, separate} from './relations.js';

const $ = selector => document.querySelector(selector);
const label = {similar: '观点相近', different: '存在分歧', unrelated: '暂不相关', unknown: '关系待确认'};

export class Relationships {
  constructor(api) {
    this.api = api;
    this.overrides = new Map();
    this.demo = false;
    this.partner = null;
    this.candidate = null;
    this.dismissed = null;
    this.velocity = {x: 0, y: 0};
    this.offset = {x: 200, y: 0};
    this.time = 0;
    this.discussion = null;
    this.record = null;
    this.canvas = $('#connections');
    this.ctx = this.canvas.getContext('2d');
    this.agentTimer = null;
    this.agentRequest = null;
    this.refreshPicker();
    $('#close-picker').addEventListener('click',()=>$('#agent-picker').close());
    $('#agent-form').addEventListener('submit',e=>{e.preventDefault();
      const a=api.nodes.find(n=>n.id===$('#agent-a').value),b=api.nodes.find(n=>n.id===$('#agent-b').value);
      if(!participantsValid(a,b)){$('#picker-status').textContent='请选择两颗不同的星球。';return;}
      $('#agent-picker').close();this.openDiscussion(b,a,$('#agent-mode').value);
    });
    $('#auto-turn').addEventListener('click',()=>{
      if(!this.discussion)return;this.discussion.auto=!this.discussion.auto;
      $('#auto-turn').textContent=this.discussion.auto?'暂停对谈':'自动对谈';
      clearTimeout(this.agentTimer);if(this.discussion.auto)this.nextTurn();
    });
    $('#relation-action').addEventListener('click', () => this.act());
    $('#dismiss-relation').addEventListener('click', () => {this.dismissed = this.candidate; this.refreshCard();});
    $('#unlink').addEventListener('click', () => this.unlink());
    $('#relation-edit').addEventListener('click', () => {if (this.candidate) api.detail(this.candidate);});
    $('#close-discussion').addEventListener('click', () => this.closeDiscussion());
    $('#next-turn').addEventListener('click', () => this.nextTurn());
    $('#interrupt-form').addEventListener('submit', e => {
      e.preventDefault();
      const value = $('#interrupt-text').value.trim();
      if (!value || !this.discussion) return;
      this.discussion.additions.push(value);
      this.addMessage('主持人 · 补充条件', value, 'note');
      $('#interrupt-text').value = '';
      this.announce('补充已纳入本次讨论条件。');this.api.changed?.();
    });
    $('#finish-discussion').addEventListener('click', () => this.finishDiscussion());
    $('#save-record').addEventListener('click', () => {
      if(!this.discussion)return;
      this.record = {...this.snapshot(),topicId:this.api.topic().id,topicTitle:this.api.topic().title,savedAt:new Date().toISOString()};
      this.api.saveRecord?.(this.record);this.discussion.saved=true;
      $('#saved-record').hidden = false;
      this.closeDiscussion();
      this.announce('讨论记录已保存，可在左侧我的讨论中回看。');
    });
    $('#saved-record').addEventListener('click', () => this.openRecord());
    document.addEventListener('keydown', e => {
      if(!this.discussion||document.querySelector('dialog[open]')||!($('#discussion').contains(e.target)||e.target===$('#egg-trigger')))return;
      if (e.key === 'Escape') {e.preventDefault(); this.closeDiscussion();}
      if (e.key === 'Tab') {
        const focusable = [...$('#discussion').querySelectorAll('button,textarea,input,select,summary,a[href]'),$('#egg-trigger')].filter(el => !el.disabled && el.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {e.preventDefault(); last.focus();}
        else if (!e.shiftKey && document.activeElement === last) {e.preventDefault(); first.focus();}
      }
    });
    for (const button of document.querySelectorAll('[data-relation]')) button.addEventListener('click', () => {
      if (!this.detailNode) return;
      const node = this.detailNode;
      this.overrides.set(node.id, button.dataset.relation);
      if (this.partner === node && this.kind(node) !== 'similar') this.unlink();
      this.configureDetail(node);
      this.cardKey = '';
      this.announce(`已将关系改为${label[this.kind(node)]}`);this.api.changed?.();
    });
  }
  announce(text) {$('#announcer').textContent = text;}
  kind(node) {return relationFor(node, this.demo, this.overrides);}
  setInput(text, example) {
    this.demo = false;
    this.overrides.clear();
    this.unlink(false);
    this.candidate = null;
    this.cardKey = '';
    $('#world-mode').textContent = this.demo && this.api.nodes.some(n=>n.sourceKind==='editorial') ? '演练关系 · 可自行纠正' : '关系由你确认';
  }
  configureDetail(node) {
    this.detailNode = node;
    $('#relation-settings').hidden = node === this.api.me;
    $('#relation-origin').textContent = this.demo && !this.overrides.has(node.id) ? '示例关系，你可以纠正' : '你认为你们的观点如何？';
    for (const button of document.querySelectorAll('[data-relation]')) button.setAttribute('aria-pressed', String(this.kind(node) === button.dataset.relation));
    $('#approach').hidden = node === this.api.me || node === this.partner;
  }
  unlink(notify = true) {
    if (this.partner) this.dismissed = this.partner;
    this.partner = null;
    this.velocity = {x: 0, y: 0};
    $('#pair-status').hidden = true;
    this.api.app.dataset.paired = 'false';
    if (notify) {this.announce('已解除连接，你们仍各自保留原来的观点。');this.api.changed?.();}
  }
  tick(dt, paused, dragged) {
    if (!paused) this.time += dt;
    const {me, nodes} = this.api;
    if (this.partner && !this.discussion) {
      const reverse = dragged === this.partner;
      followPair(reverse ? this.partner : me, reverse ? me : this.partner,
        reverse ? {x: -this.offset.x, y: -this.offset.y} : this.offset, dt, this.velocity);
    }
    if (this.discussion || !me.body) return;
    for (const n of nodes) if (n !== me && this.kind(n) === 'different') separate(me, n, dt, dragged);
    const next = nearestRelated(me, nodes, this.partner, n => this.kind(n));
    if (next !== this.candidate) {if (this.dismissed !== next) this.dismissed = null; this.candidate = next;}
    this.refreshCard(Boolean(dragged));
  }
  refreshCard(dragging = false) {
    const n = this.candidate;
    const hidden = !n || this.dismissed === n || !!this.discussion;
    $('#relation-card').hidden = hidden;
    if (hidden) return;
    const kind = this.kind(n), key = `${n.id}:${kind}:${dragging}:${!!this.partner}`;
    if (this.cardKey === key) return;
    this.cardKey = key;
    $('#relation-card').dataset.kind = kind;
    $('#relation-label').textContent = label[kind];
    $('#relation-title').textContent = kind === 'similar' ? '有些想法，彼此呼应。' : '在分歧之间，多停留一下。';
    $('#relation-reason').textContent = this.overrides.has(n.id)
      ? `你将与「${n.title}」的关系确认为${label[kind]}。`
      : n.reason;
    const action = $('#relation-action');
    action.disabled = dragging || (kind === 'similar' && !!this.partner);
    action.textContent = dragging ? '松手后，选择下一步' : kind === 'similar' ? (this.partner ? '先解除已有连接' : '连接这颗星球 ↗') : '聊聊这个分歧 ↗';
  }
  act() {
    const n = this.candidate;
    if (!n || !this.api.me.body) return;
    if (this.kind(n) === 'different') {this.openDiscussion(n); return;}
    if (this.partner || this.kind(n) !== 'similar') return;
    this.partner = n;
    const {me} = this.api;
    const d = Math.hypot(n.x - me.x, n.y - me.y) || 1;
    const distance = n.r + me.r + 64;
    this.offset = {x: (n.x - me.x || 1) / d * distance, y: (n.y - me.y) / d * distance};
    this.velocity = {x: 0, y: 0};
    $('#pair-name').textContent = n.title;
    $('#pair-status').hidden = false;
    this.api.app.dataset.paired = 'true';
    $('#relation-card').hidden = true;
    this.announce(`已与「${n.title}」连接，拖动任意一颗球，同伴都会跟随。`);this.api.event?.('paired');this.api.changed?.();
  }
  released() {this.cardKey = ''; this.refreshCard(false);}
  speaking(node) {
    if (!this.discussion || this.discussion.finished) return false;
    return node.id === this.discussion.speaker?.id;
  }
  draw(width, height, scale) {
    const dpr = Math.min(devicePixelRatio || 1, 1.75), canvas = this.canvas, ctx = this.ctx;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const me = this.discussion?.source || this.api.me;
    if (this.partner && !this.discussion) this.bridge(me, this.partner, true, scale);
    if (this.candidate && this.candidate !== this.partner && !this.discussion) {
      if (this.kind(this.candidate) === 'similar') this.bridge(me, this.candidate, false, scale);
      else this.tension(me, this.candidate);
    }
    if (this.discussion) {
      const n = this.discussion.target;
      if (me === this.api.me && this.kind(n) === 'different') this.tension(me, n);
      // A dialogue alone never establishes agreement.

      if (!this.discussion.finished && this.discussion.speaker) this.wave(this.speaking(me) ? me : n, this.speaking(me) ? n : me);
    }
  }
  ends(a, b) {
    const dx = b.sx - a.sx, dy = b.sy - a.sy, d = Math.hypot(dx, dy) || 1;
    return {x1: a.sx + dx / d * a.sr * .9, y1: a.sy + dy / d * a.sr * .9,
      x2: b.sx - dx / d * b.sr * .9, y2: b.sy - dy / d * b.sr * .9, dx: dx / d, dy: dy / d};
  }
  bridge(a, b, paired, scale) {
    const ctx = this.ctx, e = this.ends(a, b), bend = Math.sin(this.time * .65) * 7 * scale;
    const cx = (e.x1 + e.x2) / 2 - e.dy * bend, cy = (e.y1 + e.y2) / 2 + e.dx * bend;
    ctx.save(); ctx.shadowColor = '#afdfe4'; ctx.shadowBlur = paired ? 9 : 4;
    ctx.strokeStyle = paired ? '#bee8ea70' : '#bee8ea28'; ctx.lineWidth = paired ? 1 : .7;
    ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.quadraticCurveTo(cx, cy, e.x2, e.y2); ctx.stroke();
    const count = paired ? 24 : 9;
    for (let i = 0; i < count; i++) {
      const t = (i / count + this.time * .035) % 1;
      const x = (1-t)**2 * e.x1 + 2*(1-t)*t*cx + t*t*e.x2;
      const y = (1-t)**2 * e.y1 + 2*(1-t)*t*cy + t*t*e.y2;
      ctx.fillStyle = `rgba(205,237,239,${(paired ? .55 : .22) * Math.sin(t * Math.PI)})`;
      ctx.beginPath(); ctx.arc(x, y + Math.sin(i * 2.3 + this.time) * 2, i % 4 ? .7 : 1.2, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  tension(a, b) {
    const ctx = this.ctx, angle = Math.atan2(b.sy - a.sy, b.sx - a.sx);
    ctx.save(); ctx.shadowColor = '#d4cef1'; ctx.shadowBlur = 12; ctx.lineWidth = 1;
    for (const [n, theta] of [[a, angle], [b, angle + Math.PI]]) {
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(215,213,239,${.25 - i*.07})`;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr + 4 + i*4, theta - .43, theta + .43); ctx.stroke();
      }
    }
    ctx.restore();
  }
  wave(a, b) {
    const ctx = this.ctx, e = this.ends(a, b), t = (this.time * .28) % 1;
    const x = e.x1 + (e.x2-e.x1)*t, y = e.y1+(e.y2-e.y1)*t;
    ctx.save(); ctx.strokeStyle = `rgba(219,231,248,${Math.sin(t*Math.PI)*.7})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x-e.dy*8, y+e.dx*8); ctx.quadraticCurveTo(x+e.dx*5,y+e.dy*5,x+e.dy*8,y-e.dx*8); ctx.stroke(); ctx.restore();
  }
  async chooseAgents(source) {
    this.api.hideHover();
    $('#agent-a').value=source?.id || this.api.nodes[1].id;
    $('#agent-b').value=this.api.nodes.find(n=>n.id!==$('#agent-a').value && n!==this.api.me).id;
    $('#picker-status').textContent='Agent 发言不代表原答主本人，不强行为一致观点制造分歧。';
    $('#agent-picker').showModal();
    try {
      const response=await fetch('/api/agent/status');
      const status=response.ok?await response.json():{configured:false};
      const option=$('#agent-mode option[value="live"]');option.disabled=!status.configured;
      option.textContent=status.configured?'实时 Agent · 模型已配置':'实时 Agent · 尚未配置模型';
      const zhihu=$('#agent-mode option[value="zhihu"]');zhihu.disabled=!status.zhihuConfigured;
      zhihu.textContent=status.zhihuConfigured?'知乎直答 · 凭证已配置':'知乎直答 · 尚未配置凭证';
      if($('#agent-mode').selectedOptions[0].disabled)$('#agent-mode').value='demo';
    } catch {for(const mode of ['live','zhihu'])$(`#agent-mode option[value="${mode}"]`).disabled=true;$('#agent-mode').value='demo';}
  }
  openDiscussion(target, source=this.api.me, mode='demo') {
    this.stopAgent();this.api.stopMovement();this.returnFocus=document.activeElement;
    this.discussion={id:crypto.randomUUID(),source,target,mode,turn:0,additions:[],messages:[],finished:false,auto:false,speaker:null};
    this.api.hideHover();$('#detail').close();$('#relation-card').hidden=true;$('#discussion').hidden=false;
    this.api.app.inert=true;this.api.app.dataset.discussing='true';this.api.frameDiscussion(target,source);
    $('#discussion-speaker').textContent=`A · ${source.author}`;$('#discussion-target').textContent=`B · ${target.author}`;
    $('#discussion-source').textContent=mode==='zhihu'?'知乎直答 · 基于材料推演，非原答主发言':mode==='live'?'实时 Agent · 基于材料推演，非原答主发言':'演示 Agent · 本地预设逻辑，非原答主发言';
    $('#discussion-log').replaceChildren();$('#discussion-live').hidden=false;$('#discussion-summary').hidden=true;
    $('#record-note').value='';$('#record-common').value='';$('#record-change').value='keep';$('#interrupt-text').value=this.api.takePending?.()||'';$('#scenario-details').open=false;$('#next-turn').hidden=false;$('#next-turn').disabled=false;
    $('#auto-turn').textContent='自动对谈';$('#agent-status').textContent='已就绪 · 最多 6 次发言';
    this.addMessage('材料 A · '+source.author,source.claim||source.body,'note');
    this.addSourceLink(source);
    this.addMessage('材料 B · '+target.author,target.claim||target.body,'note');
    this.addSourceLink(target);
    this.updateSteps();$('#close-discussion').focus();this.api.changed?.();
  }
  addSourceLink(node){if(!node.url)return;const a=document.createElement('a');a.className='message-source';a.href=node.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='阅读知乎原回答 ↗';$('#discussion-log').lastElementChild.append(a);}
  updateSteps() {
    const step=this.discussion.finished?2:this.discussion.turn<2?0:1;
    for(const [i,el] of [...document.querySelectorAll('.discussion-step')].entries()) {el.classList.toggle('active',i===step);el.classList.toggle('done',i<step);}
    $('#next-turn').textContent=this.discussion.turn>=6?'整理记录 ↗':`下一位发言 →`;
  }
  addMessage(who,text,kind,remember=true) {
    const article=document.createElement('article');article.className=`message ${kind}`;
    const heading=document.createElement('div');heading.className='message-author';heading.textContent=who;
    const p=document.createElement('p');p.textContent=text;article.append(heading,p);$('#discussion-log').append(article);
    article.scrollIntoView({behavior:'instant',block:'nearest'});
    if(remember)this.discussion.messages.push({who,text,kind});
  }
  async nextTurn() {
    const d=this.discussion;if(!d||d.finished||d.busy)return;
    if(d.turn>=6){this.finishDiscussion();return;}
    d.busy=true;$('#next-turn').disabled=true;
    const speaker=d.turn%2===0?d.source:d.target,opponent=speaker===d.source?d.target:d.source;
    d.speaker=speaker;$('#agent-status').textContent=`${speaker.author} 的 Agent 正在组织回应…`;
    const request=new AbortController();this.agentRequest=request;
    let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;request.abort();},65000);
    try {
      let text;
      if(d.mode==='live'||d.mode==='zhihu'){
        const response=await fetch('/api/agent/turn',{method:'POST',headers:{'Content-Type':'application/json'},signal:request.signal,
          body:JSON.stringify({provider:d.mode==='zhihu'?'zhihu':'compatible',topicId:this.api.topic().id,topic:this.api.topic().title,rules:this.api.topic().rules,period:this.api.topic().period,speaker:{author:speaker.author,body:speaker.body,sourceKind:speaker.sourceKind,url:speaker.url},opponent:{author:opponent.author,body:opponent.body,sourceKind:opponent.sourceKind,url:opponent.url},turn:d.turn,messages:d.messages.slice(-30),additions:d.additions.slice(-20)})});
        const result=await response.json();if(!response.ok)throw Error(result.error||'模型请求失败');text=result.text;
      }else text=demoTurn(speaker,opponent,d.turn,[...d.additions],this.api.topic());
      if(this.discussion!==d||d.finished||request.signal.aborted)return;
      this.addMessage(`${d.turn%2===0?'A':'B'} · ${speaker.author} 的 Agent`,text,d.turn%2===0?'mine':'other');
      d.turn++;this.updateSteps();if(d.turn===2)this.api.event?.('two-turns');this.api.changed?.();$('#agent-status').textContent=`${d.turn} / 6 次发言 · ${d.mode==='demo'?'演示对谈':'实时对谈'}`;
      if(d.auto)this.agentTimer=setTimeout(()=>this.nextTurn(),d.turn>=6?2500:4500);
    }catch(error){
      if(this.discussion===d&&!d.finished&&(!request.signal.aborted||timedOut)){d.auto=false;$('#auto-turn').textContent='自动对谈';$('#agent-status').textContent=timedOut?'请求已超时，请重试。':error.message;}
    }finally{clearTimeout(timeout);d.busy=false;if(this.discussion===d)$('#next-turn').disabled=false;}
  }
  stopAgent(){clearTimeout(this.agentTimer);this.agentRequest?.abort();if(this.discussion)this.discussion.auto=false;}
  finishDiscussion(){
    if(!this.discussion)return;this.stopAgent();const d=this.discussion;d.finished=true;d.speaker=null;this.updateSteps();
    $('#discussion-live').hidden=true;$('#discussion-summary').hidden=false;
    $('#summary-common').textContent='尚未由主持人确认。Agent 的回应不会自动改变原观点关系。';
    $('#summary-difference').textContent=`${d.source.author}：${d.source.claim||d.source.body}\n\n${d.target.author}：${d.target.claim||d.target.body}`;
    $('#summary-open').textContent=d.additions.length?d.additions.join('；'):'需要进一步核实双方引用的经历、时间地点和适用条件。';
    $('#transcript-body').replaceChildren();$('#transcript').open=false;
    for(const message of d.messages){const p=document.createElement('p');p.textContent=message.who+'：'+message.text;$('#transcript-body').append(p);}
    $('#record-note').focus();this.api.changed?.();
  }
  closeDiscussion(){
    if(this.discussion&&!this.discussion.saved)this.api.changed?.();
    this.stopAgent();$('#discussion').hidden=true;this.api.app.inert=false;this.api.app.dataset.discussing='false';this.discussion=null;
    this.api.restoreCamera();this.dismissed=this.candidate;this.refreshCard();
    if(this.returnFocus?.getClientRects().length)this.returnFocus.focus();else $('#profile').focus();this.api.changed?.();
  }
  refreshPicker(){
    for(const id of ['#agent-a','#agent-b']){
      $(id).replaceChildren();
      for(const n of this.api.nodes.filter(n=>n.body)){const option=document.createElement('option');option.value=n.id;option.textContent=`${n.author} · ${n.title}`;$(id).append(option);}
    }
  }
  reset(){
    this.closeDiscussion();this.unlink(false);this.overrides.clear();this.candidate=null;this.dismissed=null;this.detailNode=null;this.cardKey='';this.record=null;
    $('#relation-card').hidden=true;$('#saved-record').hidden=true;this.refreshPicker();
  }
  snapshot(){return snapshotDiscussion(this.discussion,$('#record-note').value,$('#record-change').value,$('#record-common').value);}
  restore(record,asRecord=false){
    if(!record)return;
    const resolve=n=>this.api.nodes.find(v=>v.id===n.id)||{...n,x:0,y:0,r:70,sx:0,sy:0,sr:0};
    // Source texts remain those captured when the discussion began, even after synchronization.
    const source={...resolve(record.source),...record.source},target={...resolve(record.target),...record.target};
    this.openDiscussion(target,source,record.mode);
    this.discussion={...record,source,target,additions:[...record.additions],messages:[...record.messages],auto:false,busy:false,saved:false};
    if(!asRecord)this.discussion.finished=false;
    $('#discussion-log').replaceChildren();
    for(const m of record.messages)this.addMessage(m.who,m.text,m.kind,false);
    if(asRecord||record.finished)this.finishDiscussion();else {this.updateSteps();$('#agent-status').textContent=`已恢复 ${record.turn} / 6 次发言 · 已暂停，点击后继续`;}
    $('#record-note').value=record.note||'';$('#record-common').value=record.common||'';$('#record-change').value=record.change||'keep';this.api.changed?.();
  }
  openRecord(){if(this.record)this.restore(this.record,true);}
}
