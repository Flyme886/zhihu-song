import {ease, fieldPressure, portalLayout} from './orbital-motion.js';

const TAU = Math.PI * 2;
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
const color = (hex, alpha) => {
  const value = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#a6ddf5';
  return `${value}${Math.round(clamp(alpha) * 255).toString(16).padStart(2, '0')}`;
};
function dot(ctx, x, y, r, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, Math.max(.1, r), 0, TAU); ctx.fill();
}
function glow(ctx, x, y, r, tint, opacity) {
  if (r < 1 || opacity <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color(tint, opacity)); g.addColorStop(.3, color(tint, opacity * .35)); g.addColorStop(1, color(tint, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function ellipse(ctx, x, y, rx, ry, rotation, fill, width = 1, start = 0, end = TAU) {
  ctx.strokeStyle = fill; ctx.lineWidth = width; ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), rotation, start, end); ctx.stroke();
}

// One shared clock and two bounded canvases. All effect anchors resolve from
// this frame's projected nodes; no independent hit targets or saved positions.
export class CelestialScene {
  constructor(canvas, enabled = () => true) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.enabled = enabled;
    this.time = 0; this.intro = null; this.portal = null; this.pulses = []; this.flights = []; this.w = 0; this.h = 0;
    this.dust = Array.from({length: 180}, (_, i) => ({x: ((i * .61803398875) % 1), y: ((i * .754877666) % 1), depth: .2 + (i % 7) / 8, phase: i * 2.399}));
  }
  enter() { this.intro = this.enabled() ? 0 : null; this.pulses = []; this.flights = []; }
  interrupt() { this.intro = null; }
  clear() { this.intro = null; this.portal = null; this.pulses = []; this.flights = []; this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  emit(kind, a, b) {
    if (!this.enabled()) return;
    if (kind === 'pair' || kind === 'repel') {
      this.pulses.push({a: a.id, b: b.id, kind, start: this.time});
      if (this.pulses.length > 5) this.pulses.shift();
    }
  }
  open(a, b) {
    this.interrupt(); this.pulses = []; this.flights = [];
    this.portal = {a: a.id, b: b.id, start: this.time, fromA: {x: a.sx, y: a.sy, r: a.sr}, fromB: {x: b.sx, y: b.sy, r: b.sr}};
  }
  close() { this.portal = null; this.flights = []; }
  message(node, host = false) {
    if (!this.portal || !this.enabled()) return;
    this.flights.push({id: node?.id, host, start: this.time});
    if (this.flights.length > 8) this.flights.shift();
  }
  advance(dt) {
    if (!this.enabled()) { this.intro = null; this.pulses = []; this.flights = []; return; }
    this.time += clamp(dt, 0, .1);
    if (this.intro !== null) { this.intro += clamp(dt, 0, .1); if (this.intro >= 2.15) this.intro = null; }
    this.pulses = this.pulses.filter(e => this.time - e.start < 1.8);
    this.flights = this.flights.filter(e => this.time - e.start < 1.45);
  }
  layout(width, height, panel) { this.portalFrame = portalLayout(width, height, panel); return this.portalFrame; }
  project(n, x, y, r) {
    const p = this.portal, f = this.portalFrame;
    if (p && f && (n.id === p.a || n.id === p.b)) {
      const from = n.id === p.a ? p.fromA : p.fromB, to = n.id === p.a ? f.source : f.target;
      const blend = this.enabled() ? ease((this.time - p.start) / 1.15) : 1;
      return {x: mix(from.x || x, to.x, blend), y: mix(from.y || y, to.y, blend), r: mix(from.r || r, f.planetRadius, blend)};
    }
    if (this.intro !== null) {
      const p = ease(this.intro / 2.15), depth = .4 + (n.offset || 0) % .6;
      return {x: x + (x - this.w * .55) * (1 - p) * .7 * depth, y: y + (y - this.h * .55) * (1 - p) * .7, r: r * (1 + (1 - p) * 1.4)};
    }
    return {x, y, r};
  }
  draw(front, nodes, relations, width, height, scale, low = false) {
    this.w = width; this.h = height;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, low ? 1 : 1.5);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    }
    const back = this.ctx; back.setTransform(dpr, 0, 0, dpr, 0, 0); back.clearRect(0, 0, width, height);
    const time = this.time, resolve = id => nodes.find(n => n.id === id), visible = nodes.filter(n => n.sr > 0 && (n.body || n.id !== 'me') && (!this.portal || n.id === this.portal.a || n.id === this.portal.b));
    back.save(); front.save();
    // Nebula light is kept behind the actual particle spheres and all text.
    glow(back, width * .58, height * .48, width * .52, '#596cb9', .10);
    glow(back, width * .23, height * .77, width * .3, '#277f8d', .07);
    const focus = relations.dragged || relations.partner && relations.api.me;
    const count = low ? 72 : this.dust.length;
    for (let i = 0; i < count; i++) {
      const d = this.dust[i];
      let x = (d.x * width + Math.sin(time * .035 + d.phase) * 22 * d.depth + width) % width;
      let y = (d.y * height + Math.cos(time * .025 + d.phase) * 12 * d.depth + height) % height;
      if (focus) { const dx = focus.sx - x, dy = focus.sy - y, dist = Math.hypot(dx, dy); const bend = Math.max(0, 1 - dist / 230) * 22 * d.depth; x += dy / (dist || 1) * bend; y -= dx / (dist || 1) * bend; }
      for (const pulse of this.pulses) {
        const a = resolve(pulse.a), b = resolve(pulse.b); if (!a || !b) continue;
        const age = (time - pulse.start) / 1.8, cx = (a.sx + b.sx) / 2, cy = (a.sy + b.sy) / 2;
        const dx = x - cx, dy = y - cy, dist = Math.hypot(dx, dy), radius = age * Math.max(width, height) * .75;
        const shift = Math.max(0, 1 - Math.abs(dist - radius) / 75) * (1 - age) * 25;
        x += dx / (dist || 1) * shift; y += dy / (dist || 1) * shift;
      }
      dot(back, x, y, .5 + d.depth * .8, color(i % 3 ? '#a6c5ed' : '#e6c5f9', .12 + d.depth * .24));
    }
    for (const n of visible) {
      const active = focus?.id === n.id || relations.partner?.id === n.id || relations.candidate?.id === n.id;
      glow(back, n.sx, n.sy, n.sr * (active ? 3 : 2.1), n.color, active ? .17 : .065);
      ellipse(back, n.sx, n.sy, n.sr * 1.3, n.sr * .40, -.3 + (n.offset || 0) * .2, color(n.color, active ? .24 : .10), .75);
    }
    if (relations.partner && !relations.discussion) this.binary(back, front, relations.api.me, relations.partner, relations.effects, scale);
    const candidate = relations.candidate;
    if (candidate && candidate !== relations.partner && !relations.discussion) {
      if (relations.kind(candidate) === 'different') this.field(back, front, relations.api.me, candidate, scale);
      else this.affinity(back, front, relations.api.me, candidate, relations.kind(candidate) === 'similar', scale);
    }
    for (const pulse of this.pulses) {
      const a = resolve(pulse.a), b = resolve(pulse.b); if (!a || !b) continue;
      const p = (time - pulse.start) / 1.8, x = (a.sx + b.sx) / 2, y = (a.sy + b.sy) / 2;
      const tint = pulse.kind === 'repel' ? '#c6afff' : '#8ee4ea', r = 15 + ease(p) * Math.min(width * .62, 540);
      ellipse(back, x, y, r, r * .58, -.2, color(tint, Math.sin(Math.PI * p) * (1 - p) * .27), 1.5);
      if (!low) ellipse(back, x, y, r * .89, r * .51, -.2, color(tint, (1 - p) * .11), .7);
    }
    if (this.portal) this.gate(back, front, resolve, relations.discussion);
    if (this.intro !== null) this.arrival(back, width, height);
    front.restore(); back.restore();
  }
  binary(back, front, a, b, effects, scale) {
    const dx = b.sx - a.sx, dy = b.sy - a.sy, distance = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
    const x = (a.sx + b.sx) / 2, y = (a.sy + b.sy) / 2;
    const build = effects.bridgeVisibility(a, b), rx = distance / 2 + Math.max(a.sr, b.sr) + 22 * scale;
    const ry = Math.max(a.sr, b.sr) * .9 + 22 * scale, t = this.time;
    glow(back, x, y, rx * 1.45, '#7298e0', .10 * build);
    for (let j = 0; j < 3; j++) {
      const r = rx + j * 5 * scale, h = ry + j * 2 * scale, tilt = angle - .18;
      ellipse(back, x, y, r, h, tilt, color('#a4dbea', (.22 - j * .055) * build), j ? .75 : 1.5, Math.PI, TAU);
      ellipse(front, x, y, r, h, tilt, color(j === 1 ? '#c5b3f5' : '#a4e5f3', (.43 - j * .12) * build), j ? .75 : 1.5, 0, Math.PI);
    }
    for (let i = 0; i < 64; i++) {
      const phase = i / 64 * TAU + t * .27, tilt = angle - .18;
      const u = Math.cos(phase) * rx, v = Math.sin(phase) * ry;
      const ctx = Math.sin(phase) > 0 ? front : back;
      dot(ctx, x + u * Math.cos(tilt) - v * Math.sin(tilt), y + u * Math.sin(tilt) + v * Math.cos(tilt), i % 11 ? .75 : 2.2, color(i % 2 ? a.color : b.color, build * (i % 11 ? .48 : .95)));
    }
    this.ribbon(front, a, b, build, scale);
  }
  ribbon(ctx, a, b, alpha, scale) {
    const dx = b.sx - a.sx, dy = b.sy - a.sy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const from = {x: a.sx + ux * a.sr * .85, y: a.sy + uy * a.sr * .85};
    const to = {x: b.sx - ux * b.sr * .85, y: b.sy - uy * b.sr * .85};
    const point = (t, side) => { const bend = Math.sin(t * Math.PI) * Math.sin(t * TAU - this.time * 1.8) * 13 * scale * side; return {x: mix(from.x, to.x, t) - uy * bend, y: mix(from.y, to.y, t) + ux * bend}; };
    for (const side of [-1, 1]) {
      const tint = side < 0 ? a.color : b.color;
      ctx.beginPath(); for (let i = 0; i <= 64; i++) { const p = point(i / 64, side); if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.strokeStyle = color(tint, .65 * alpha); ctx.lineWidth = 1.6; ctx.stroke();
      for (let i = 0; i < 18; i++) { let t = (i / 18 + this.time * .32) % 1; if (side < 0) t = 1 - t; const p = point(t, side); dot(ctx, p.x, p.y, i % 6 ? 1 : 2.8, color('#e2f7ff', Math.sin(t * Math.PI) * alpha * .85)); }
    }
  }
  affinity(back, front, a, b, known, scale) {
    const d = Math.hypot(b.sx - a.sx, b.sy - a.sy), p = clamp(1 - (d - a.sr - b.sr) / (140 * scale));
    if (p <= 0) return;
    const x = (a.sx + b.sx) / 2, y = (a.sy + b.sy) / 2;
    glow(back, x, y, Math.max(60, d * .65), known ? '#69dbe1' : '#a7bbe8', p * .12);
    const angle = Math.atan2(b.sy - a.sy, b.sx - a.sx);
    for (const [n, theta] of [[a, angle], [b, angle + Math.PI]]) {
      ellipse(front, n.sx, n.sy, n.sr + 10 * scale, n.sr + 10 * scale, 0, color(known ? '#a4ecf0' : '#a0b5d6', p * .55), 1.5, theta - .65, theta + .65);
    }
    if (known) this.ribbon(front, a, b, p * .55, scale);
  }
  field(back, front, a, b, scale) {
    const pressure = fieldPressure(a, b), angle = Math.atan2(b.sy - a.sy, b.sx - a.sx);
    for (const [n, theta] of [[a, angle], [b, angle + Math.PI]]) {
      glow(back, n.sx + Math.cos(theta) * n.sr * .7, n.sy + Math.sin(theta) * n.sr * .7, n.sr * 1.5, n.color, .20 * pressure);
      for (let i = 0; i < 4; i++) {
        const radius = n.sr + (7 + i * (7 - pressure * 3)) * scale;
        ellipse(front, n.sx, n.sy, radius, radius, 0, color(i % 2 ? '#b7dfff' : '#c8b6fa', pressure * (.6 - i * .11)), i ? 1 : 2.5, theta - .9, theta + .9);
      }
    }
    const x = (a.sx + Math.cos(angle) * a.sr + b.sx - Math.cos(angle) * b.sr) / 2;
    const y = (a.sy + Math.sin(angle) * a.sr + b.sy - Math.sin(angle) * b.sr) / 2;
    glow(back, x, y, 85 * scale, '#baa0f4', pressure * .28);
    front.save(); front.translate(x, y); front.rotate(angle);
    for (let j = 0; j < 3; j++) {
      front.beginPath(); for (let i = 0; i <= 48; i++) {
        const t = i / 48, v = (t - .5) * Math.min(a.sr + b.sr, 130 * scale);
        const u = Math.sin(t * 6 + this.time * 1.8 + j * .9) * Math.sin(t * Math.PI) * (4 + j * 3) * scale;
        if (!i) front.moveTo(u, v); else front.lineTo(u, v);
      }
      front.strokeStyle = color(j === 1 ? '#ecddff' : '#b5ccf6', pressure * (.7 - j * .15)); front.lineWidth = j === 1 ? 2 : 1; front.stroke();
    }
    front.restore();
  }
  gate(back, front, resolve, discussion) {
    const f = this.portalFrame; if (!f) return;
    const p = this.enabled() ? ease((this.time - this.portal.start) / 1.15) : 1, r = f.radius * (.25 + p * .75);
    glow(back, f.x, f.y, r * 2.8, '#8f74d8', .18 * p);
    for (let i = 0; i < 5; i++) ellipse(i > 2 ? front : back, f.x, f.y, r * (1 + i * .06), r * (.72 + i * .045), -.28 + i * .10, color(i % 2 ? '#b5e5ef' : '#bca9f6', p * (.43 - i * .055)), i ? .7 : 2);
    for (let i = 0; i < 90; i++) {
      const a = i / 90 * TAU + this.time * .35, wobble = Math.sin(i * 2.399) * r * .07;
      dot(front, f.x + Math.cos(a) * (r + wobble), f.y + Math.sin(a) * (r * .78 + wobble), i % 13 ? .8 : 2, color(i % 3 ? '#b7c4fb' : '#d4f2f6', p * (i % 13 ? .4 : .9)));
    }
    if (discussion?.busy) {
      const n = resolve(discussion.speaker?.id); if (n) {
        const beat = .55 + Math.sin(this.time * 2) * .2;
        ellipse(front, n.sx, n.sy, n.sr + 9, n.sr + 9, 0, color(n.color, beat), 1.8);
      }
    }
    for (const flight of this.flights) {
      const n = resolve(flight.id), origin = flight.host ? {sx: f.x, sy: f.y + r * 1.7, color: '#edc88e'} : n;
      if (!origin) continue;
      const age = (this.time - flight.start) / 1.45;
      for (let i = 0; i < 28; i++) {
        const t = clamp(age * 1.45 - i * .015), bend = Math.sin(t * Math.PI) * r * .34;
        dot(front, mix(origin.sx, f.x, t), mix(origin.sy, f.y, t) - bend, i ? 1.2 : 3.5, color(origin.color, Math.sin(t * Math.PI) * (1 - i / 32)));
      }
      glow(back, f.x, f.y, r * 1.1, origin.color, Math.sin(Math.PI * age) * .22);
    }
    if (p > .85) {
      front.fillStyle = '#c4c8e4'; front.font = '10px "PingFang SC", sans-serif'; front.textAlign = 'center';
      front.fillText(discussion?.finished ? '这次相遇，留下什么？' : '让不同，在这里相遇', f.x, f.y + r * 1.5);
    }
  }
  arrival(ctx, w, h) {
    const p = ease(this.intro / 2.15), alpha = 1 - ease(this.intro / 1.6);
    if (!alpha) return;
    const radius = Math.max(w, h) * (.65 + p * .35), x = w * (1.2 + p * .55), y = h * (1.12 + p * .65);
    glow(ctx, x, y, radius * 1.1, '#6a81be', alpha * .32);
    for (let i = 0; i < 6; i++) ellipse(ctx, x, y, radius + i * 7, radius * .72 + i * 3, -.25, color(i % 2 ? '#9ccef0' : '#b5a9e9', alpha * (.26 - i * .025)), i ? 1 : 3);
  }
}
