// Geometry is independent of viewpoint meaning; distance never decides agreement.
export function gap(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
}

export function relationFor(node, demo, overrides, suggestions = new Map()) {
  if (overrides.has(node.id)) return overrides.get(node.id);
  const suggestion = suggestions.get(node.id)?.relation;
  if (['similar', 'different', 'unrelated', 'unknown'].includes(suggestion)) return suggestion;
  return demo ? (node.exampleRelation || 'unknown') : 'unknown';
}

export function nearestRelated(me, nodes, partner, classify, limit = 100) {
  return nodes.filter(n => n !== me && n !== partner && ['similar', 'different'].includes(classify(n)))
    .map(n => ({node: n, gap: gap(me, n)}))
    .filter(item => item.gap < limit)
    .sort((a, b) => a.gap - b.gap)[0]?.node || null;
}

// Unclassified neighbors stay neutral while their content is being compared.
export function nearestUnconfirmed(me, nodes, classify, limit = 100) {
  return nodes.filter(n => n !== me && classify(n) === 'unknown')
    .map(node => ({node, gap: gap(me, node)}))
    .filter(item => item.gap < limit)
    .sort((a, b) => a.gap - b.gap)[0]?.node || null;
}

export function nearestEncounter(me, nodes, partner, classify, limit = 100) {
  const related = nearestRelated(me, nodes, partner, classify, limit);
  const unknown = nearestUnconfirmed(me, nodes, classify, limit);
  if (!related) return unknown;
  if (!unknown) return related;
  return gap(me, unknown) < gap(me, related) ? unknown : related;
}

export function followPair(leader, follower, offset, dt, velocity) {
  // A critically damped spring; clamp dt after tab suspension.
  const h = Math.min(dt, .04), omega = 9;
  for (const axis of ['x', 'y']) {
    const delta = follower[axis] - (leader[axis] + offset[axis]);
    const k = velocity[axis] + omega * delta;
    const decay = Math.exp(-omega * h);
    follower[axis] = leader[axis] + offset[axis] + (delta + k * h) * decay;
    velocity[axis] = (velocity[axis] - omega * k * h) * decay;
  }
}

export function separate(a, b, dt, dragged) {
  const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
  const minimum = a.r + b.r + 36;
  if (d >= minimum) return;
  const push = Math.min(18, (minimum - d) * (1 - Math.exp(-Math.min(dt, .04) * 12)));
  const ux = d > .01 ? dx / d : 1, uy = d > .01 ? dy / d : 0;
  // Preserve pointer ownership: the other sphere yields while dragging.
  const target = dragged === a ? b : a, direction = target === a ? 1 : -1;
  target.x += ux * push * direction;
  target.y += uy * push * direction;
}
