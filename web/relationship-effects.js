import {gap} from './relations.js';

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const duration = {pair: 1.65, unpair: .9, repel: 1.25};
const smooth = v => {v=clamp(v);return v*v*(3-2*v);};

// Transient feedback owns no relationship or physics state. Node references keep
// the effects attached while either sphere moves, pans, or changes scale.
export class RelationshipEffects {
  constructor(feedback = () => {}, motion = () => true) {
    this.feedback = feedback;
    this.motion = motion;
    this.time = 0;
    this.bursts = [];
    this.contacts = new Set();
  }
  emit(kind, a, b, strength = 1) {
    if (kind === 'pair' || kind === 'unpair') this.bursts = this.bursts.filter(e =>
      !(['pair','unpair'].includes(e.kind) && ((e.a === a && e.b === b) || (e.a === b && e.b === a))));
    this.feedback(kind, {a, b, strength});
    if (!this.motion()) return;
    this.bursts.push({kind, a, b, strength, start: this.time, duration: duration[kind]});
    if (this.bursts.length > 12) this.bursts.shift();
  }
  contact(a, b, dragged) {
    const distance = gap(a, b);
    // A contact remains latched through the spring's settling/jitter. Pull away
    // before another hit can sound; loading a saved layout is silent.
    if (distance > 70) this.contacts.delete(b.id);
    if (distance >= 36 || this.contacts.has(b.id)) return false;
    this.contacts.add(b.id);
    if (dragged !== a && dragged !== b) return false;
    this.emit('repel', a, b, clamp(.45 + (36 - distance) / 90, .45, 1));
    return true;
  }
  advance(dt) {
    this.time += Math.min(Math.max(dt, 0), .1);
    this.bursts = this.motion()
      ? this.bursts.filter(e => this.time - e.start < e.duration) : [];
  }
  clear() { this.bursts = []; this.contacts.clear(); }
  bridgeVisibility(a,b) {
    const effect=this.bursts.find(e=>e.kind==='pair'&&((e.a===a&&e.b===b)||(e.a===b&&e.b===a)));
    if(!effect||!this.motion())return 1;
    return smooth(((this.time-effect.start)/effect.duration-.30)/.42);
  }
  appearance(node) {
    let pulse = 0;
    for (const e of this.bursts) if (e.a === node || e.b === node) {
      const p = clamp((this.time - e.start) / e.duration);
      // Compression and one small rebound live entirely in appearance; the
      // relationship spring remains the sole owner of physical movement.
      pulse += (e.kind==='repel'
        ? -Math.sin(Math.PI*clamp(p/.26))*.52+Math.sin(Math.PI*clamp((p-.26)/.74))*(1-p)*.9
        : Math.sin(Math.PI*p)*(1-p)) * e.strength;
    }
    return {scale: 1 + clamp(pulse,-.7,1) * .12, glow: 1 + Math.max(0,Math.min(pulse,1)) * 2.6};
  }
  draw(ctx, ends, scale) {
    for (const e of this.bursts) {
      const p = clamp((this.time - e.start) / e.duration);
      const edge = ends(e.a, e.b), x = (edge.x1 + edge.x2) / 2, y = (edge.y1 + edge.y2) / 2;
      const unit = clamp(scale, .65, 1.3);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 12 * unit; ctx.lineWidth = 1.2 * unit;
      ctx.shadowColor = e.kind === 'repel' ? '#cfbcf4' : '#a9e6f0';
      if (e.kind === 'pair') {
        const gather=smooth(p/.38),settle=1-smooth((p-.42)/.58);
        // Paired streams narrow into the closest contact before the bridge is
        // revealed; a single restrained pulse marks the moment they meet.
        for (const sign of [1,-1]) {
          const sx=sign===1?edge.x1:edge.x2,sy=sign===1?edge.y1:edge.y2;
          for(let i=0;i<9;i++){
            const t=clamp(gather-i*.045),spread=Math.sin(t*Math.PI)*(1-gather)*9*unit;
            const bend=Math.sin(i*2.399)*spread;
            this.dot(ctx,sx+(x-sx)*t-edge.dy*bend,sy+(y-sy)*t+edge.dx*bend,
              (1.9-i*.13)*unit,`rgba(201,235,249,${(1-i/10)*settle*.72})`);
          }
        }
        if(p>.30){
          const build=smooth((p-.30)/.40),shine=Math.sin(Math.PI*clamp((p-.30)/.70));
          const span=Math.hypot(edge.x2-edge.x1,edge.y2-edge.y1)*.5*build;
          ctx.strokeStyle=`rgba(210,243,252,${shine*.48})`;ctx.lineWidth=1.1*unit;
          ctx.beginPath();ctx.moveTo(x-edge.dx*span,y-edge.dy*span);ctx.lineTo(x+edge.dx*span,y+edge.dy*span);ctx.stroke();
          this.ring(ctx,x,y,3+(p-.30)*74*unit,`rgba(230,221,194,${shine*.55})`);
        }
      } else if (e.kind === 'unpair') {
        // The bridge breaks into two short trails that return to their planets.
        for (let i = 0; i < 32; i++) {
          const t = i / 31, side = t < .5 ? 0 : 1;
          const retreat = t + (side - t) * (1 - (1 - p) ** 2);
          const spread = Math.sin(i * 2.399) * Math.sin(p * Math.PI) * 18 * unit;
          this.dot(ctx, edge.x1 + (edge.x2 - edge.x1) * retreat - edge.dy * spread,
            edge.y1 + (edge.y2 - edge.y1) * retreat + edge.dx * spread,
            (i % 4 ? 1.1 : 2) * unit, `rgba(181,224,244,${(1-p) * .8})`);
        }
      } else {
        const angle=Math.atan2(edge.dy,edge.dx),release=smooth((p-.12)/.58),fade=(1-smooth((p-.18)/.82))*e.strength;
        // Two facing pressure fronts compress at contact, then open back along
        // the collision axis. No full-screen rings or displacement of hit areas.
        for(const [node,theta] of [[e.a,angle],[e.b,angle+Math.PI]]){
          for(let i=0;i<2;i++){
            const travel=release*(42+i*18)*unit,compression=Math.sin(Math.PI*clamp(p/.24))*8*unit;
            ctx.strokeStyle=`rgba(198,201,236,${fade*(.52-i*.17)})`;
            ctx.beginPath();ctx.arc(node.sx,node.sy,Math.max(1,node.sr+3+travel-compression),theta-.44+release*.10,theta+.44-release*.10);ctx.stroke();
          }
        }
        for(let i=0;i<10;i++){
          const side=i%2?1:-1,spread=(i/10-.5)*23*unit;
          const recoil=side*release*23*unit;
          this.dot(ctx,x+edge.dx*recoil-edge.dy*spread,y+edge.dy*recoil+edge.dx*spread,
            (.7+(i%3)*.25)*unit*(1-p),`rgba(211,207,236,${fade*.56})`);
        }
      }
      ctx.restore();
    }
  }
  dot(ctx, x, y, radius, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(.1, radius), 0, TAU); ctx.fill();
  }
  ring(ctx, x, y, radius, color) {
    ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(.1, radius), 0, TAU); ctx.stroke();
  }
  debug() { return {active: this.bursts.map(e => e.kind), contacts: this.contacts.size}; }
}
