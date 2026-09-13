import {demoTurn,participantsValid} from './agent-turns.js';
import {snapshotDiscussion,snapshotNode} from './session.js';
import {DiscussionSummary} from './discussion-summary.js';
import {companionForDiscussion,material} from './thought-client.js';
import {relationFor, nearestEncounter, followPair, separate, gap} from './relations.js';
import {RelationshipEffects} from './relationship-effects.js';
import {PairOrbit,pairOffset} from './orbital-motion.js';
import {EncounterDwell} from './encounter-dwell.js';

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
    this.dwell = new EncounterDwell();
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
    $('#unlink').addEventListener('click', () => this.unlink());
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
      this.api.message?.(this.api.me, true);
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
      this.correctRelation(button.dataset.relation, this.detailNode);
    });
  }
  announce(text) {$('#announcer').textContent = text;}
  kind(node) {return relationFor(node, this.demo, this.overrides, this.suggestions);}
  setInput(text, example) {
    this.demo = false;
    this.overrides.clear();
    this.suggestions.clear();
    this.unlink(false);
    this.effects.clear();
    this.candidate = null;
    this.cancelEncounter();
    $('#world-mode').textContent = this.demo && this.api.nodes.some(n=>n.sourceKind==='editorial') ? '演练关系 · 可自行纠正' : '靠近并停留 1.5 秒 · 相近连接，有分歧就聊聊';
  }
  configureDetail(node) {
    this.detailNode = node;
    $('#relation-settings').hidden = node === this.api.me || !this.api.me.body;
    $('#relation-origin').textContent = this.demo && !this.overrides.has(node.id) ? '示例关系，你可以纠正' : '纠正自动关系判断';
    for (const button of document.querySelectorAll('[data-relation]')) button.setAttribute('aria-pressed', String(this.kind(node) === button.dataset.relation));
    $('#approach').hidden = node === this.api.me || node === this.partner;
  }
  unlink(notify = true) {
    this.cancelEncounter();
    if (this.partner && notify) this.effects.emit('unpair', this.api.me, this.partner);
    if (this.partner) this.dismissed = this.partner;
    this.partner = null;
    this.orbit = null;
    this.quietUntilMove=false;
    this.velocity = {x: 0, y: 0};
    $('#pair-status').hidden = true;
    this.api.app.dataset.paired = 'false';
    if (notify) {this.announce('已解除连接，你们仍各自保留原来的观点。');this.api.changed?.();}
  }
  tick(dt, paused, dragged) {
    this.dragged = dragged;
    if(dragged)this.approachTarget=null;
    if(dragged)this.quietUntilMove=false;
    if (!paused) this.time += dt;
    this.effects.advance(paused ? 0 : dt);
    const {me, nodes} = this.api;
    const settling = this.dwell.armed && this.candidate && !dragged;
    if (this.partner && !this.discussion) {
      const reverse = dragged === this.partner;
      if ((!paused && !this.api.reading?.()) || dragged) {
        followPair(reverse ? this.partner : me, reverse ? me : this.partner,
          reverse ? {x: -this.offset.x, y: -this.offset.y} : this.offset, dt, this.velocity);
        if (!dragged && !settling && !paused && this.api.motion?.() !== false && !this.api.reading?.()) {
          const turn=this.orbit?.advance(me, this.partner, dt)||0,c=Math.cos(turn),s=Math.sin(turn);
          this.offset = {x:this.offset.x*c-this.offset.y*s,y:this.offset.x*s+this.offset.y*c};
        }
      }
    }
    if (this.discussion || !me.body) {this.cancelEncounter(); return;}
    for (const n of nodes) if (n !== me && this.kind(n) === 'different') {
      this.effects.contact(me, n, dragged===this.partner?me:dragged);
      // During the user's dwell, force animation must not move the target away.
      if ((!paused && !settling && !this.api.reading?.()) || dragged) separate(me, n, dt, dragged);
    }
    const next = this.encounterCandidate();
    if (next !== this.candidate) {if (this.dismissed !== next) this.dismissed = null; this.candidate = next;}
    this.updateEncounter(performance.now(), Boolean(dragged));
  }
  cancelEncounter(disarm = true) {
    if(disarm){this.dwell.reset();this.approachTarget=null;}else this.dwell.cancel();
    $('#encounter-progress').hidden = true;
  }
  updateEncounter(now, dragging = false) {
    const node=this.candidate, kind=node?this.kind(node):'unknown';
    const blocked=dragging||this.api.encounterBlocked?.()||!!this.discussion||!this.api.me.body;
    if(this.dwell.armed&&!blocked&&node&&kind==='unknown'&&!this.suggestions.has(node.id))this.api.analyzeEncounter?.(node);
    const ready=this.dwell.update(node,kind,now,blocked||(kind==='similar'&&!!this.partner));
    if(ready){this.act({node:ready});return;}
    const progress=$('#encounter-progress'),waiting=this.dwell.armed&&!blocked&&node&&kind==='unknown';
    progress.hidden=!this.dwell.target&&!waiting;
    if(progress.hidden)return;
    progress.dataset.kind=kind;
    if(waiting){
      progress.setAttribute('role','status');progress.removeAttribute('aria-valuenow');
      progress.setAttribute('aria-label','观点关系');
      $('#encounter-text').textContent=this.api.analysisPending?.()?'正在比较观点…':this.suggestions.has(node.id)?'信息不足，可补充想法':'暂未读懂，可重新分析';
      return;
    }
    progress.setAttribute('role','progressbar');
    progress.setAttribute('aria-valuenow',String(Math.round(this.dwell.progress*100)));
    progress.setAttribute('aria-label',kind==='similar'?'停留后自动连接':'停留后进入辩论');
    progress.style.setProperty('--dwell',this.dwell.progress);
    $('#encounter-text').textContent=(kind==='similar'?'即将连接':'即将辩论')+' · '+Math.max(.1,(1-this.dwell.progress)*1.5).toFixed(1)+'s';
  }
  correctRelation(kind,node) {
    if(!node||!this.api.me.body||!['similar','different','unrelated'].includes(kind))return;
    this.cancelEncounter();
    this.overrides.set(node.id,kind);
    if(this.partner===node&&kind!=='similar')this.unlink(false);
    this.configureDetail(node);
    this.announce(`已将与「${node.title}」的关系改为${label[kind]}，靠近并停留即可相遇。`);
    this.api.changed?.();
  }
  configureHover(node) { this.hoverNode=node; if(node)this.cancelEncounter(false); }
  act({feedback = true, node = this.candidate, restored = false} = {}) {
    const n = node;
    this.cancelEncounter();
    if (!n || !this.api.me.body) return;
    if (!restored && this.kind(n) === 'different') {this.openDiscussion(n); return;}
    if (this.partner || (!restored && this.kind(n) !== 'similar')) return;
    this.api.hideHover();
    this.partner = n;
    this.quietUntilMove=true;
    this.orbit = new PairOrbit(feedback);
    const {me} = this.api;
    const distance = n.r + me.r + 64;
    const bearing=Math.atan2(n.y-me.y,n.x-me.x||1);
    this.offset = feedback?pairOffset(me,n,this.api.nodes,this.api.pairViewport?.()):{x: Math.cos(bearing) * distance, y: Math.sin(bearing) * distance};
    this.velocity = {x: 0, y: 0};
    if (feedback) this.effects.emit('pair', me, n);
    $('#pair-name').textContent = n.title;
    $('#pair-status').hidden = false;
    this.api.app.dataset.paired = 'true';
    this.announce(`已与「${n.title}」连接，拖动任意一颗球，同伴都会跟随。`);this.api.event?.('paired');this.api.changed?.();
  }
  encounterCandidate() {
    const target=this.approachTarget;
    if(target&&this.api.nodes.includes(target)&&target!==this.partner&&this.kind(target)!=='unrelated'&&gap(this.api.me,target)<100)return target;
    // With a companion, only a new disagreement can start another encounter.
    return nearestEncounter(this.api.me,this.api.nodes,this.partner,n=>this.partner&&this.kind(n)==='similar'?'unrelated':this.kind(n));
  }
  released(approached = false, target = null) {
    if(approached)this.approachTarget=target;
    this.candidate = this.encounterCandidate();
    if(approached){
      this.quietUntilMove=false;this.dismissed=null;
      this.api.showEncounter?.(this.candidate);
      this.dwell.arm();
    }
  }
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
    this.api.drawSpace?.(ctx, width, height, scale);
    if (!this.api.drawSpace && this.partner && !this.discussion) this.bridge(me, this.partner, true, scale);
    if (!this.api.drawSpace && this.candidate && this.candidate !== this.partner && !this.discussion) {
      if (this.kind(this.candidate) === 'similar') this.bridge(me, this.candidate, false, scale);
      else if(this.kind(this.candidate)==='different') this.tension(me, this.candidate);
    }
    if (this.discussion && !this.api.drawSpace) {
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
    $('#picker-status').textContent='AI 基于材料生成 · 非原答主发言';
    $('#agent-mode').value=this.preferredMode;
    if(this.api.openPicker)this.api.openPicker();else $('#agent-picker').showModal();
    const pickerToken=this.pickerToken=(this.pickerToken||0)+1;
    try {
      const response=await fetch('/api/agent/status',{signal:AbortSignal.timeout(5000)});
      const status=response.ok?await response.json():{configured:false};
      if(pickerToken!==this.pickerToken||!$('#agent-picker').open)return;
      this.agentStatus=status;
      const option=$('#agent-mode option[value="live"]');option.disabled=!status.configured;
      option.textContent=status.configured?`实时 Agent · ${status.model||'模型已配置'}`:'实时 Agent · 尚未配置模型';
      const defaultName=status.defaultProvider==='compatible'?status.model:status.defaultProvider==='zhihu'?'知乎直答':null;
      $('#agent-mode option[value="auto"]').textContent=defaultName?`实时对谈 · ${defaultName}`:'实时对谈 · 默认模型';
      const zhihu=$('#agent-mode option[value="zhihu"]');zhihu.disabled=!status.zhihuConfigured;
      zhihu.textContent=status.zhihuConfigured?'知乎直答 · 凭证已配置':'知乎直答 · 尚未配置凭证';
      $('#picker-status').textContent=defaultName?`${defaultName} 已配置 · AI 基于材料生成`:'实时对谈未配置，可选择离线演示。';
    } catch {if(pickerToken===this.pickerToken&&$('#agent-picker').open)$('#picker-status').textContent='服务状态读取失败，可重试实时对谈或选择离线演示。';}
  }
  describeMode(){
    const mode=this.discussion.mode;
    $('#discussion-mode').value=mode;
    const model=mode==='live'||mode==='auto'&&this.agentStatus?.defaultProvider==='compatible'?this.agentStatus?.model:null;
    $('#discussion-source').textContent=mode==='demo'?'离线演示 · 预设发言':mode==='zhihu'?'知乎直答生成 · 非原答主发言':`${model||'AI 实时对谈'} · 非原答主发言`;
    if($('#discussion-provider'))$('#discussion-provider').textContent=$('#discussion-source').textContent+' · 设置';
  }
  openDiscussion(target, source=this.api.me, mode=this.preferredMode) {
    this.cancelEncounter();
    this.effects.clear();
    this.summaryView.cancel();
    this.stopAgent();this.api.stopMovement();this.returnFocus=document.activeElement;
    const partner=companionForDiscussion(this.api.me,source,target,this.partner);
    this.discussion={id:crypto.randomUUID(),source,target,companion:partner?snapshotNode(partner):null,mode,turn:0,additions:[],messages:[],finished:false,auto:false,speaker:null,summary:null};
    this.api.hideHover();$('#detail').close();$('#discussion').hidden=false;
    this.api.app.inert=true;this.api.app.dataset.discussing='true';this.api.frameDiscussion(target,source);
    this.api.openPortal?.(source, target);
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
  renderCompanion(){const n=this.discussion?.companion;$('#discussion-companion').hidden=!n;$('#discussion-companion').textContent=n?`携伴讨论 · ${n.title||n.author}。同伴材料会进入双方回应。`:'';}
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
      this.api.message?.(speaker);
      d.turn++;this.updateSteps();if(d.turn===2)this.api.event?.('two-turns');this.api.changed?.();$('#agent-status').textContent=`${d.turn} / 6 次发言 · ${metadata.provider==='demo'?'离线预设发言':metadata.provider==='zhihu'?'知乎直答已返回':`${metadata.model||'实时模型'} 已返回`}`;
      if(metadata.provider!=='demo'){
        $('#discussion-source').textContent=`${metadata.model||'实时模型'} 生成 · 非原答主发言`;
        if($('#discussion-provider'))$('#discussion-provider').textContent=$('#discussion-source').textContent+' · 设置';
      }
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
    this.cancelEncounter();
    this.api.closePortal?.();
    this.summaryView.cancel();
    if(this.discussion&&!this.discussion.saved)this.api.changed?.();
    this.stopAgent();$('#discussion').hidden=true;this.api.app.inert=false;this.api.app.dataset.discussing='false';this.discussion=null;
    this.api.restoreCamera();this.dismissed=this.candidate;
    if(this.returnFocus?.getClientRects().length)this.returnFocus.focus();else $('#profile').focus();this.api.changed?.();
  }
  refreshPicker(){
    for(const id of ['#agent-a','#agent-b']){
      $(id).replaceChildren();
      for(const n of this.api.nodes.filter(n=>n.body)){const option=document.createElement('option');option.value=n.id;option.textContent=`${n.author} · ${n.title}`;$(id).append(option);}
    }
  }
  reset(){
    this.quietUntilMove=false;
    this.effects.clear();
    this.closeDiscussion();this.unlink(false);this.overrides.clear();this.candidate=null;this.dismissed=null;this.detailNode=null;this.record=null;
    $('#saved-record').hidden=true;this.refreshPicker();
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
