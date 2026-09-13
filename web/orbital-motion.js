const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };

// A small, bounded orbital arc. Dragging and reading own the planets whenever
// they are active; this controller never classifies or creates a relationship.
export class PairOrbit {
  constructor(arrive = true) { this.age = arrive ? 0 : 2.8; }
  angle(age) { return .28 * ease(age / 2.8) + .12 * Math.sin(Math.max(0, age - 2.8) * .22); }
  advance(a, b, dt, active = true) {
    if (!active) return 0;
    const previous = this.angle(this.age);
    this.age += clamp(dt, 0, .05);
    const turn = this.angle(this.age) - previous;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const c = Math.cos(turn), s = Math.sin(turn);
    for (const n of [a, b]) {
      const x = n.x - cx, y = n.y - cy;
      n.x = cx + x * c - y * s; n.y = cy + x * s + y * c;
    }
    return turn;
  }
}

export function portalLayout(width, height, panel) {
  const side = panel && panel.left > width * .25 && panel.height > height * .8;
  const available = side ? panel.left : width;
  const topHeight = side ? height : Math.max(120, panel?.top ?? height * .3);
  const x = available / 2, y = side ? height * .49 : topHeight * .52;
  const radius = side ? Math.min(available * .185, height * .18) : Math.min(width * .17, topHeight * .3);
  const planetRadius = side ? clamp(available * .10, 32, 72) : clamp(width * .075, 22, 34);
  const spread = Math.min(available * .32, radius + planetRadius + 22);
  return {x, y, radius, planetRadius, source: {x: x - spread, y: y - radius * .15},
    target: {x: x + spread, y: y + radius * .15}, side: !!side};
}

// Pressure is solely an appearance value for an already confirmed difference.
export function fieldPressure(a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y) - a.r - b.r;
  return ease((125 - distance) / 100);
}

export function pairOffset(a, b, nodes, viewport) {
  const distance=a.r+b.r+64,scale=a.sr/a.r||1;
  const bearings=[-.12,Math.PI+.12,-.65,Math.PI-.65,.65,Math.PI+.65,Math.PI/2,-Math.PI/2];
  let best=null;
  for(const angle of bearings){
    const offset={x:Math.cos(angle)*distance,y:Math.sin(angle)*distance};
    const x=a.x+offset.x,y=a.y+offset.y;
    let score=0;
    for(const n of nodes)if(n!==a&&n!==b){const overlap=Math.max(0,b.r+n.r+32-Math.hypot(x-n.x,y-n.y));score+=overlap*overlap;}
    if(viewport){const sx=a.sx+offset.x*scale,sy=a.sy+offset.y*scale,r=b.r*scale;
      const overflow=Math.max(0,22+r-sx)+Math.max(0,sx+r-viewport.width+22)+Math.max(0,viewport.top+r-sy)+Math.max(0,sy+r-viewport.bottom);
      score+=overflow*overflow*5;
    }
    score+=Math.hypot(x-b.x,y-b.y)*.015;
    if(!best||score<best.score)best={offset,score};
  }
  return best.offset;
}

export function dragThroughField(node, dx, dy, opponents) {
  let x=dx,y=dy;
  for(const other of opponents){
    const distance=Math.hypot(other.x-node.x,other.y-node.y)||1;
    const ux=(other.x-node.x)/distance,uy=(other.y-node.y)/distance;
    const inward=Math.max(0,x*ux+y*uy),resistance=fieldPressure(node,other)*.38;
    x-=ux*inward*resistance;y-=uy*inward*resistance;
  }
  return {x,y};
}
