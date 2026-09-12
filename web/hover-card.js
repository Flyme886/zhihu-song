// All coordinates are local to the world canvas, which excludes the sidebar.
export function placeHoverCard(node, card, viewport) {
  const margin = 16, gap = 12;
  const safeTop = viewport.top ?? margin, safeBottom = viewport.bottom ?? margin;
  const width = Math.min(card.width, viewport.width - margin * 2);
  const height = Math.min(card.height, viewport.height - safeTop - safeBottom);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const right = node.x + node.radius + gap;
  const left = node.x - node.radius - gap - width;
  let x, y, side;
  if (right + width <= viewport.width - margin || left >= margin) {
    side = right + width <= viewport.width - margin ? 'right' : 'left';
    x = side === 'right' ? right : left;
    y = node.y - Math.min(140, height * .32);
  } else {
    const below = viewport.height - safeBottom - node.y - node.radius - gap;
    const above = node.y - node.radius - gap - safeTop;
    side = below >= height || below >= above ? 'bottom' : 'top';
    x = node.x - width / 2;
    y = side === 'bottom' ? node.y + node.radius + gap : node.y - node.radius - gap - height;
  }
  return {left: clamp(x, margin, viewport.width - width - margin),
    top: clamp(y, safeTop, viewport.height - height - safeBottom), side};
}
