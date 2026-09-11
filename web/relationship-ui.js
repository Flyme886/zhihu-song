import {demoTurn,participantsValid} from './agent-turns.js';
import {snapshotDiscussion,snapshotNode} from './session.js';
import {DiscussionSummary} from './discussion-summary.js';
import {companionForDiscussion,material,RELATION_LABELS} from './thought-client.js';
import {relationFor, nearestEncounter, followPair, separate} from './relations.js';
import {RelationshipEffects} from './relationship-effects.js';

const $ = selector => document.querySelector(selector);
const label = {similar: '观点相近', different: '存在分歧', unrelated: '暂不相关', unknown: '关系待确认'};

export class Relationships {
  constructor(api) {
    this.api = api;
    this.overrides = new Map();
    this.suggestions = new Map();
    this.summaryView = new DiscussionSummary({discussion:()=>this.discussion,topic:api.topic,changed:()=>api.changed?.()});
    this.demo = false;
    this.partner = null;
    this.candidate = null;
    this.dismissed = null;
    this.velocity = {x: 0, y: 0};
    this.offset = {x: 200, y: 0};
    this.time = 0;
    this.effects = new RelationshipEffects((kind, detail) => api.feedback?.(kind, detail), () => api.motion?.() !== false);
    this.discussion = null;
    this.record = null;
    this.canvas = $('#connections');
    this.ctx = this.canvas.getContext('2d');
    this.agentTimer = null;
    this.agentRequest = null;
    this.preferredMode = 'auto';
    $('#agent-mode').addEventListener('change',()=>{this.preferredMode=$('#agent-mode').value;});
    $('#discussion-mode').addEventListener('change',()=>{
      if(!this.discussion)return;
      this.stopAgent();this.discussion.mode=$('#discussion-mode').value;
      this.preferredMode=this.discussion.mode;this.describeMode();
      $('#agent-status').textContent='对谈方式已切换，点击下一位发言继续。';this.api.changed?.();
    });
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
    for(const button of document.querySelectorAll('[data-confirm-relation]')) button.addEventListener('click',()=>{
      const node=this.candidate;if(!node||!api.me.body)return;
      const kind=button.dataset.confirmRelation;
      this.overrides.set(node.id,kind);this.cardKey='';
      this.announce(`已将与「${node.title}」的关系确认为${label[kind]}`);
      if(kind==='similar')this.act();
      else if(kind==='unrelated'){this.candidate=null;this.refreshCard();}
      else {this.effects.contact(api.me,node,api.me);this.refreshCard();}
      api.changed?.();
    });
    $('#dismiss-relation').addEventListener('click', () => {this.dismissed = this.candidate; this.refreshCard();});
    $('#unlink').addEventListener('click', () => this.unlink());
    $('#relation-edit').addEventListener('click', () => {if (this.candidate) api.detail(this.candidate);});
    $('#close-discussion').addEventListener('click', () => this.closeDiscussion());
    $('#next-turn').addEventListener('click', () => this.nextTurn());
    $('#interrupt-form').addEventListener('submit', e => {
      e.preventDefault();
      const value = $('#interrupt-text').value.trim();
      if (!value || !this.discussion) return;
      if(this.discussion.additions.length>=20){this.announce('本次讨论最多加入 20 条补充，请先保存记录。');return;}
      this.stopAgent();
      this.discussion.additions.push(value);
      this.addMessage('主持人 · 补充条件', value, 'note');
      $('#interrupt-text').value = '';
      $('#agent-status').textContent='已纳入新条件，点击下一位发言获取回应。';
      this.announce('补充已纳入本次讨论条件。');this.api.changed?.();
    });
    $('#finish-discussion').addEventListener('click', () => this.finishDiscussion());
    $('#save-record').addEventListener('click', () => {
      if(!this.discussion)return;
      if(this.discussion.summary)this.discussion.summary.reviewedAt=new Date().toISOString();
      this.record = {...this.snapshot(),topicId:this.api.topic().id,topicTitle:this.api.topic().title,savedAt:new Date().toISOString()};
      const persisted=this.api.saveRecord?.(this.record)!==false;this.discussion.saved=persisted;
      $('#saved-record').hidden = false;
      this.closeDiscussion();
      this.api.afterSave?.(this.record);
      this.announce(persisted?'讨论记录已保存，可在左侧我的讨论中回看。':'本机保存不可用，记录暂留在本页，请导出备份。');
    });
    $('#saved-record').addEventListener('click', () => this.openRecord());
    $('#discussion').addEventListener('keydown', e => {
      if (e.key === 'Escape') {e.preventDefault(); this.closeDiscussion();}
      if (e.key === 'Tab') {
        const focusable = [...$('#discussion').querySelectorAll('button,textarea,input,select,summary,a[href]')].filter(el => !el.disabled && el.getClientRects().length);
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
      if(this.kind(node)==='different')this.effects.contact(api.me,node,api.me);
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
    this.suggestions.clear();
    this.unlink(false);
    this.effects.clear();
    this.candidate = null;
    this.cardKey = '';
    $('#world-mode').textContent = this.demo && this.api.nodes.some(n=>n.sourceKind==='editorial') ? '演练关系 · 可自行纠正' : '关系由你确认';
  }
  configureDetail(node) {
    this.detailNode = node;
    $('#relation-settings').hidden = node === this.api.me || !this.api.me.body;
    $('#relation-origin').textContent = this.demo && !this.overrides.has(node.id) ? '示例关系，你可以纠正' : '你认为你们的观点如何？';
    for (const button of document.querySelectorAll('[data-relation]')) button.setAttribute('aria-pressed', String(this.kind(node) === button.dataset.relation));
    $('#approach').hidden = node === this.api.me || node === this.partner;
  }
  unlink(notify = true) {
    if (this.partner && notify) this.effects.emit('unpair', this.api.me, this.partner);
    if (this.partner) this.dismissed = this.partner;
    this.partner = null;
    this.velocity = {x: 0, y: 0};
    $('#pair-status').hidden = true;
    this.api.app.dataset.paired = 'false';
    if (notify) {this.announce('已解除连接，你们仍各自保留原来的观点。');this.api.changed?.();}
  }
  tick(dt, paused, dragged) {
    if (!paused) this.time += dt;
    this.effects.advance(dt);
    const {me, nodes} = this.api;
    if (this.partner && !this.discussion) {
      const reverse = dragged === this.partner;
      followPair(reverse ? this.partner : me, reverse ? me : this.partner,
        reverse ? {x: -this.offset.x, y: -this.offset.y} : this.offset, dt, this.velocity);
    }
    if (this.discussion || !me.body) return;
    for (const n of nodes) if (n !== me && this.kind(n) === 'different') {
      this.effects.contact(me, n, dragged);
      separate(me, n, dt, dragged);
    }
    const next = nearestEncounter(me, nodes, this.partner, n => this.kind(n));
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
    $('#relation-title').textContent = kind === 'unknown' ? '你们的想法，会怎样相遇？' : kind === 'similar' ? '有些想法，彼此呼应。' : '在分歧之间，多停留一下。';
    const suggestion=this.suggestions.get(n.id);
    $('#relation-reason').textContent = kind==='unknown' && suggestion ? `AI 建议：${RELATION_LABELS[suggestion.relation]}。${suggestion.reason} 请核对后确认。` : kind==='unknown' ? `已靠近「${n.title}」。读过观点后，选择相近或有分歧，让星球回应你的判断。` : this.overrides.has(n.id)
      ? `你将与「${n.title}」的关系确认为${label[kind]}。`
      : n.reason;
    const action = $('#relation-action');
    action.hidden=kind==='unknown';
    $('#relation-choices').hidden=kind!=='unknown';
    for(const button of document.querySelectorAll('[data-confirm-relation]')){button.disabled=dragging||(button.dataset.confirmRelation==='similar'&&!!this.partner);if(button.dataset.confirmRelation==='similar')button.textContent=this.partner?'先解除已有连接':'相近，连接星球 ↗';}
    $('#relation-edit').textContent=kind==='unknown'?'先读这个观点 ↗':'查看观点与关系';
    action.disabled = dragging || (kind === 'similar' && !!this.partner);
    action.textContent = dragging ? '松手后，选择下一步' : kind === 'similar' ? (this.partner ? '先解除已有连接' : '连接这颗星球 ↗') : '聊聊这个分歧 ↗';
  }
  act({feedback = true} = {}) {
    const n = this.candidate;
    if (!n || !this.api.me.body) return;
    if (this.kind(n) === 'different') {this.openDiscussion(n); return;}
    if (this.partner || this.kind(n) !== 'similar') return;
    this.api.hideHover();
    this.partner = n;
    const {me} = this.api;
    const d = Math.hypot(n.x - me.x, n.y - me.y) || 1;
    const distance = n.r + me.r + 64;
    this.offset = {x: (n.x - me.x || 1) / d * distance, y: (n.y - me.y) / d * distance};
    this.velocity = {x: 0, y: 0};
    if (feedback) this.effects.emit('pair', me, n);
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
      else if(this.kind(this.candidate)==='different') this.tension(me, this.candidate);
    }
    if (this.discussion) {
      const n = this.discussion.target;
      if (me === this.api.me && this.kind(n) === 'different') this.tension(me, n);
      // A dialogue alone never establishes agreement.

      if (!this.discussion.finished && this.discussion.speaker) this.wave(this.speaking(me) ? me : n, this.speaking(me) ? n : me);
    }
    if (!this.discussion) this.effects.draw(ctx, (a,b) => this.ends(a,b), scale);
  }
  ends(a, b) {
    const dx = b.sx - a.sx, dy = b.sy - a.sy, d = Math.hypot(dx, dy) || 1;
    return {x1: a.sx + dx / d * a.sr * .9, y1: a.sy + dy / d * a.sr * .9,
      x2: b.sx - dx / d * b.sr * .9, y2: b.sy - dy / d * b.sr * .9, dx: dx / d, dy: dy / d};
  }
  bridge(a, b, paired, scale) {
    const ctx = this.ctx, e = this.ends(a, b), bend = Math.sin(this.time * .65) * 7 * scale;
    const cx = (e.x1 + e.x2) / 2 - e.dy * bend, cy = (e.y1 + e.y2) / 2 + e.dx * bend;
    ctx.save(); ctx.globalAlpha *= paired ? (this.effects.bridgeVisibility?.(a,b) ?? 1) : 1; ctx.shadowColor = '#afdfe4'; ctx.shadowBlur = paired ? 9 : 4;
    ctx.strokeStyle = paired ? '#bee8ea70' : '#bee8ea28'; ctx.lineWidth = paired ? 1 : .7;
    ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.quadraticCurveTo(cx, cy, e.x2, e.y2); ctx.stroke();
    const count = paired ? 12 : 7, unit = Math.max(.7, Math.min(scale,1.2));
    for (const direction of paired ? [1,-1] : [1]) {
      for (let i = 0; i < count; i++) {
        const phase = (i / count + this.time * (paired ? .22 : .05)) % 1;
        const t = direction === 1 ? phase : 1-phase;
        const ribbon = paired ? Math.sin(t*Math.PI) * 4 * unit * direction : 0;
        const x = (1-t)**2 * e.x1 + 2*(1-t)*t*cx + t*t*e.x2 - e.dy*ribbon;
        const y = (1-t)**2 * e.y1 + 2*(1-t)*t*cy + t*t*e.y2 + e.dx*ribbon;
        const pulse = paired ? .4 + .6 * Math.max(0,Math.cos(phase*Math.PI*2))**8 : .3;
        ctx.fillStyle = `rgba(205,242,249,${pulse * Math.sin(t * Math.PI) * .65})`;
        ctx.beginPath(); ctx.arc(x,y,(i%7 ? .75 : 1.4)*unit,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();
  }
  tension(a, b) {
    const ctx = this.ctx, angle = Math.atan2(b.sy - a.sy, b.sx - a.sx);
    ctx.save(); ctx.shadowColor = '#d4cef1'; ctx.shadowBlur = 12; ctx.lineWidth = 1;
    for (const [n, theta] of [[a, angle], [b, angle + Math.PI]]) {
      for (let i = 0; i < 3; i++) {
        const phase=(this.time*.65+i/3)%1;
        ctx.strokeStyle = `rgba(215,213,239,${(1-phase)*.3})`;
        ctx.beginPath(); ctx.arc(n.sx, n.sy, n.sr + 4 + phase*14, theta - .43, theta + .43); ctx.stroke();
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
    const eligible=this.api.nodes.filter(n=>n.body);
    if(eligible.length<2){this.announce('还需要两个有内容的观点才能开始对谈。');return;}
    $('#agent-a').value=source?.body?source.id:eligible.find(n=>n!==this.api.me)?.id||eligible[0].id;
    $('#agent-b').value=eligible.find(n=>n.id!==$('#agent-a').value).id;
    $('#picker-status').textContent='Agent 发言不代表原答主本人，不强行为一致观点制造分歧。';
    $('#agent-mode').value=this.preferredMode;
    if(this.api.openPicker)this.api.openPicker();else $('#agent-picker').showModal();
    const pickerToken=this.pickerToken=(this.pickerToken||0)+1;
    try {
      const response=await fetch('/api/agent/status',{signal:AbortSignal.timeout(5000)});
      const status=response.ok?await response.json():{configured:false};
      if(pickerToken!==this.pickerToken||!$('#agent-picker').open)return;
      const option=$('#agent-mode option[value="live"]');option.disabled=!status.configured;
      option.textContent=status.configured?'实时 Agent · 模型已配置':'实时 Agent · 尚未配置模型';
      const zhihu=$('#agent-mode option[value="zhihu"]');zhihu.disabled=!status.zhihuConfigured;
      zhihu.textContent=status.zhihuConfigured?'知乎直答 · 凭证已配置':'知乎直答 · 尚未配置凭证';
      $('#picker-status').textContent=status.zhihuConfigured?'实时对谈将调用知乎直答；发言基于材料生成，不代表原答主。':status.configured?'实时对谈将调用已配置模型。':'实时对谈尚未配置；预设案例可阅读，离线演示需自行选择。';
    } catch {if(pickerToken===this.pickerToken&&$('#agent-picker').open)$('#picker-status').textContent='无法读取服务状态；实时请求失败时会提示，不会切换为预设发言。';}
  }
  describeMode(){
    const mode=this.discussion.mode;
    $('#discussion-mode').value=mode;
    $('#discussion-source').textContent=mode==='demo'?'离线演示 · 预设发言，未调用模型':mode==='zhihu'?'知乎直答 · 实时生成，非原答主发言':mode==='live'?'实时 Agent · 基于材料生成，非原答主发言':'实时对谈 · 优先使用知乎直答，发言不代表原答主';
  }
  openDiscussion(target, source=this.api.me, mode=this.preferredMode) {
    this.effects.clear();
    this.summaryView.cancel();
    this.stopAgent();this.api.stopMovement();this.returnFocus=document.activeElement;
    const partner=companionForDiscussion(this.api.me,source,target,this.partner);
    this.discussion={id:crypto.randomUUID(),source,target,companion:partner?snapshotNode(partner):null,mode,turn:0,additions:[],messages:[],finished:false,auto:false,speaker:null,summary:null};
    this.api.hideHover();$('#detail').close();$('#relation-card').hidden=true;$('#discussion').hidden=false;
    this.api.app.inert=true;this.api.app.dataset.discussing='true';this.api.frameDiscussion(target,source);
    $('#discussion-speaker').textContent=`A · ${source.author}`;$('#discussion-target').textContent=`B · ${target.author}`;
    this.describeMode();$('#discussion-mode').disabled=false;
    $('#discussion-log').replaceChildren();$('#discussion-live').hidden=false;$('#discussion-summary').hidden=true;
    $('#record-note').value='';$('#record-common').value='';$('#record-change').value='keep';$('#interrupt-text').value=this.api.takePending?.()||'';$('#scenario-details').open=false;$('#next-turn').hidden=false;$('#next-turn').disabled=false;
    $('#auto-turn').textContent='自动对谈';$('#agent-status').textContent='已就绪 · 最多 6 次发言';
    this.addMessage('材料 A · '+source.author,source.claim||source.body,'note');
    this.addSourceLink(source);
    this.addMessage('材料 B · '+target.author,target.claim||target.body,'note');
    this.addSourceLink(target);
    if(this.discussion.companion){this.addMessage('同伴材料 · '+partner.author,partner.body,'note');this.addSourceLink(partner);}
    this.renderCompanion();
    this.updateSteps();$('#close-discussion').focus();this.api.changed?.();
  }
  renderCompanion(){const n=this.discussion?.companion;$('#discussion-companion').hidden=!n;$('#discussion-companion').textContent=n?`携伴讨论 · ${n.title||n.author}：${n.analysis?.claim||n.claim||n.body.slice(0,90)}。同伴补充会进入双方回应。`:'';}
  addSourceLink(node){if(!node.url)return;const a=document.createElement('a');a.className='message-source';a.href=node.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='阅读知乎原回答 ↗';$('#discussion-log').lastElementChild.append(a);}
  updateSteps() {
    const step=this.discussion.finished?2:this.discussion.turn<2?0:1;
    for(const [i,el] of [...document.querySelectorAll('.discussion-step')].entries()) {el.classList.toggle('active',i===step);el.classList.toggle('done',i<step);}
    $('#next-turn').textContent=this.discussion.turn>=6?'整理记录 ↗':`下一位发言 →`;
  }
  addMessage(who,text,kind,remember=true,metadata={}) {
    const id=metadata.id||crypto.randomUUID();
    const article=document.createElement('article');article.className=`message ${kind}`;article.dataset.messageId=id;
    const heading=document.createElement('div');heading.className='message-author';heading.textContent=who;
    const p=document.createElement('p');p.textContent=text;article.append(heading,p);$('#discussion-log').append(article);
    if(metadata.companionContribution){const c=document.createElement('aside');c.className='companion-contribution';c.textContent='同伴带来的补充：'+metadata.companionContribution.text+'\n依据：“'+metadata.companionContribution.quote+'”';article.append(c);}
    article.scrollIntoView({behavior:'instant',block:'nearest'});
    if(remember)this.discussion.messages.push({id,who,text,kind,...metadata});
  }
  async nextTurn() {
    const d=this.discussion;if(!d||d.finished||d.busy)return;
    if(d.turn>=6){this.finishDiscussion();return;}
    d.busy=true;$('#next-turn').disabled=true;
    const speaker=d.turn%2===0?d.source:d.target,opponent=speaker===d.source?d.target:d.source;
    d.speaker=speaker;$('#agent-status').textContent=`${speaker.author} 的 Agent 正在组织回应…`;
    const request=new AbortController();this.agentRequest=request;d.request=request;
    let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;request.abort();},65000);
    try {
      let text,metadata={provider:'demo'};
      if(d.mode!=='demo'){
        const response=await fetch('/api/agent/turn',{method:'POST',headers:{'Content-Type':'application/json'},signal:request.signal,
          body:JSON.stringify({provider:d.mode==='zhihu'?'zhihu':d.mode==='live'?'compatible':'auto',topicId:this.api.topic().id,topic:this.api.topic().title,rules:this.api.topic().rules,period:this.api.topic().period,speaker:{...material(speaker),sourceKind:speaker.sourceKind,url:speaker.url},opponent:{...material(opponent),sourceKind:opponent.sourceKind,url:opponent.url},companion:d.companion?material(d.companion):null,companionFor:d.companion?d.source.id:null,turn:d.turn,messages:d.messages.slice(-30),additions:d.additions.slice(-20)})});
        const result=await response.json();if(!response.ok)throw Error(result.error||'模型请求失败');
        if(typeof result.text!=='string'||!result.text.trim()||!['zhihu','compatible'].includes(result.provider))throw Error('实时服务未返回有效发言，请检查后端版本。');
        text=result.text;metadata={provider:result.provider,model:result.model,requestId:result.requestId,generatedAt:result.generatedAt,companionContribution:result.companionContribution||null};
      }else text=demoTurn(speaker,opponent,d.turn,[...d.additions],this.api.topic());
      if(d.mode==='demo'&&d.companion&&speaker===d.source)text+='\n\n离线材料提示 · 同伴关注：'+(d.companion.analysis?.claim||d.companion.claim||d.companion.body.slice(0,160));
      if(this.discussion!==d||d.finished||request.signal.aborted||d.request!==request)return;
      this.addMessage(`${d.turn%2===0?'A':'B'} · ${speaker.author} 的 Agent`,text,d.turn%2===0?'mine':'other',true,metadata);
      d.turn++;this.updateSteps();if(d.turn===2)this.api.event?.('two-turns');this.api.changed?.();$('#agent-status').textContent=`${d.turn} / 6 次发言 · ${metadata.provider==='demo'?'离线预设发言':metadata.provider==='zhihu'?'知乎直答已返回':'实时模型已返回'}`;
      if(d.auto)this.agentTimer=setTimeout(()=>this.nextTurn(),d.turn>=6?2500:4500);
    }catch(error){
      if(this.discussion===d&&d.request===request&&!d.finished&&(!request.signal.aborted||timedOut)){d.auto=false;$('#auto-turn').textContent='自动对谈';$('#agent-status').textContent=timedOut?'请求已超时，未新增发言。可手动重试。':error.message;}
    }finally{clearTimeout(timeout);if(d.request===request){d.busy=false;d.request=null;d.speaker=null;if(this.discussion===d)$('#next-turn').disabled=false;}}
  }
  stopAgent(){clearTimeout(this.agentTimer);this.agentRequest?.abort();if(this.discussion){this.discussion.auto=false;this.discussion.busy=false;this.discussion.request=null;this.discussion.speaker=null;$('#next-turn').disabled=false;$('#auto-turn').textContent='自动对谈';}}
  finishDiscussion({generate=true}={}){
    if(!this.discussion)return;this.stopAgent();const d=this.discussion;d.finished=true;d.speaker=null;this.updateSteps();
    $('#discussion-mode').disabled=true;
    $('#discussion-live').hidden=true;$('#discussion-summary').hidden=false;
    this.summaryView.render();$('#transcript').open=false;$('#discussion-summary').scrollTop=0;
    $('#discussion-summary .summary-intro').focus({preventScroll:true});this.api.changed?.();
    if(generate&&!d.summary)this.summaryView.generate();
  }

  closeDiscussion(){
    this.summaryView.cancel();
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
    this.effects.clear();
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
    this.discussion={...record,source,target,additions:[...record.additions],messages:record.messages.map(m=>({...m,id:m.id||crypto.randomUUID()})),summary:record.summary?structuredClone(record.summary):null,companion:record.companion?structuredClone(record.companion):null,auto:false,busy:false,saved:asRecord};
    if(!asRecord)this.discussion.finished=false;
    $('#discussion-log').replaceChildren();
    this.renderCompanion();
    for(const m of this.discussion.messages)this.addMessage(m.who,m.text,m.kind,false,m);
    if(asRecord||record.finished)this.finishDiscussion({generate:false});else this.updateSteps();
    $('#record-note').value=record.note||'';$('#record-common').value=record.common||'';$('#record-change').value=record.change||'keep';this.api.changed?.();
  }
  openRecord(){if(this.record)this.restore(this.record,true);}
}
