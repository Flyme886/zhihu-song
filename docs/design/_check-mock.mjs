// 校验 mock-topic.json 是否满足 model.ts 的契约。
// 用法：node docs/design/_check-mock.mjs
// 结算规则与地图求解在这里重写了一份（JS），刻意与 model.ts 独立 ——
// 若两边算出的结果不一致，说明有一边写错了。

import { readFileSync } from 'node:fs';

const T = JSON.parse(readFileSync(new URL('./mock-topic.json', import.meta.url), 'utf8'));
const errs = [];
const ok = (c, m) => { if (!c) errs.push(m); };

// ── 结算三行规则 ──────────────────────────────────────────────
const resolve = (card, asker) => {
  const { requires, strains } = card.condition;
  if (requires.every((r) => asker.has.includes(r))) return 'effective';
  return strains.some((s) => asker.lacks.includes(s)) ? 'backfire' : 'ineffective';
};

const askers = T.askers;
const byId = Object.fromEntries(askers.map((a) => [a.id, a]));

// has / lacks 不能重叠
for (const a of askers) {
  const both = a.has.filter((c) => a.lacks.includes(c));
  ok(!both.length, `${a.name} 的 has 与 lacks 重叠：${both}`);
  ok(a.is_fictional === true, `${a.name} 缺 is_fictional`);
  ok(Object.keys(a.coords_by_year).length === T.years.length,
    `${a.name} 的 coords_by_year 年份数与 years 不一致`);
}

const CAPS = ['self_control', 'metacognition', 'external_support', 'knowledge_base', 'tool_access'];
const evIds = new Set(T.evidence.map((e) => e.answer_id));

for (const node of T.nodes) {
  ok(node.cards.length === 4, `${node.year} 节点不是 4 张卡`);
  const matrix = [];

  for (const card of node.cards) {
    ok(evIds.has(card.evidence_answer_id), `${card.id} 的 evidence_answer_id 找不到对应 evidence`);
    ok(card.condition.source_tier === 'author_stated',
      `${card.id} 卡面条件不是 author_stated`);
    ok(card.condition.requires.length > 0, `${card.id} requires 为空`);
    for (const c of [...card.condition.requires, ...card.condition.strains]) {
      ok(CAPS.includes(c), `${card.id} 用了未定义的能力项：${c}`);
    }
    const overlap = card.condition.requires.filter((r) => card.condition.strains.includes(r));
    ok(!overlap.length, `${card.id} requires 与 strains 重叠：${overlap}`);

    const row = askers.map((a) => resolve(card, a));
    matrix.push([card.id, row]);

    for (const a of askers) {
      const cell = node.cells.find((c) => c.card_id === card.id && c.asker_id === a.id);
      if (!cell) { errs.push(`缺格：${card.id} × ${a.id}`); continue; }
      const computed = resolve(card, a);
      ok(cell.outcome === computed,
        `签字与规则不一致：${card.id} × ${a.id} 签了 ${cell.outcome}，规则算出 ${computed}`);
      ok(cell.narration.length >= 4, `叙述变体不足 4 条：${card.id} × ${a.id}`);
      ok(!!cell.because && !!cell.verified_by, `缺 because / verified_by：${card.id} × ${a.id}`);
    }
  }

  ok(node.cells.length === 12, `${node.year} 节点不是 12 格（实际 ${node.cells.length}）`);

  // 至少一张卡三个人结果不同 / 至少一格反噬
  const hasThree = matrix.some(([, r]) => new Set(r).size === 3);
  const hasBack = matrix.some(([, r]) => r.includes('backfire'));
  ok(hasThree, `${node.year} 节点没有任何一张卡能演出三种不同结果`);
  ok(hasBack, `${node.year} 节点没有反噬格`);

  console.log(`\n── ${node.year} 结算矩阵（行=卡，列=${askers.map((a) => a.name).join(' / ')}）`);
  for (const [id, r] of matrix) {
    const mark = new Set(r).size === 3 ? '  ★三态' : '';
    console.log(`  ${id.padEnd(14)} ${r.map((o) => o.padEnd(11)).join('')}${mark}`);
  }

  for (const cb of node.callbacks ?? []) {
    const src = T.nodes.flatMap((n) => n.cards).find((c) => c.id === cb.card_id);
    ok(!!src, `回调指向不存在的卡：${cb.card_id}`);
    ok(src && src.dies_after_year !== null,
      `回调的卡 ${cb.card_id} 没有 dies_after_year`);
    ok(T.macro_conditions.some((m) => m.id === cb.macro_condition_id),
      `回调的 macro_condition_id 不存在：${cb.macro_condition_id}`);
    ok((cb.basis_refs ?? []).length > 0, `回调 ${cb.card_id} 没有 basis_refs`);
  }
}

// ── 地图层 ────────────────────────────────────────────────────
const INVERTED = new Set(['c_think_time', 'c_ai_role']);

const interp = (vals, year) => {
  const ys = Object.keys(vals).map(Number).sort((a, b) => a - b);
  if (year <= ys[0]) return vals[ys[0]];
  if (year >= ys[ys.length - 1]) return vals[ys[ys.length - 1]];
  for (let i = 0; i < ys.length - 1; i++) {
    const [a, b] = [ys[i], ys[i + 1]];
    if (year >= a && year <= b) return vals[a] + ((year - a) / (b - a)) * (vals[b] - vals[a]);
  }
  return 0.5;
};

const macroVec = (year) => Object.fromEntries(
  T.macro_conditions.map((m) => [m.id, interp(m.values_by_year, year)]),
);

const effW = (c, macro) => {
  let wa = c.weight_a, wb = c.weight_b;
  for (const s of c.macro_sensitivity ?? []) {
    const d = ((macro[s.macro_id] ?? 0.5) - 0.5) * s.coef;
    if (s.affects === 'a') wa += d; else wb += d;
  }
  return { wa, wb };
};

const slidersFromXY = (x, y) => {
  const s = {};
  for (const id of T.axis_x.conditions) s[id] = INVERTED.has(id) ? 1 - x : x;
  for (const id of T.axis_y.conditions) s[id] = INVERTED.has(id) ? 1 - y : y;
  return s;
};

const computeD = (sliders, year) => {
  const macro = macroVec(year);
  let d = 0;
  for (const c of T.map_conditions) {
    const { wa, wb } = effW(c, macro);
    d += (wa - wb) * (sliders[c.id] ?? 0.5);
  }
  for (const it of T.interactions) {
    d += it.weight * (sliders[it.cond_a] ?? 0.5) * (sliders[it.cond_b] ?? 0.5);
  }
  return d;
};

// wa − wb 的符号不能随年份翻转
for (const c of T.map_conditions) {
  const signs = new Set(T.years.map((y) => {
    const { wa, wb } = effW(c, macroVec(y));
    return Math.sign(wa - wb);
  }));
  ok(signs.size === 1 && !signs.has(0),
    `${c.id} 的 wa−wb 符号随年份翻转（${[...signs]}）—— 地图的解释会自相矛盾`);
}

// 分水岭扫过了谁
console.log('\n── 提问者逐年 D（>0 偏 A 侧，<0 偏 B 侧）');
const swept = {};
for (const a of askers) {
  const row = T.years.map((y) => {
    const c = a.coords_by_year[y];
    return computeD(slidersFromXY(c.x, c.y), y);
  });
  const sides = row.map((d) => (d > 0 ? 'a' : 'b'));
  const flip = sides.findIndex((s, i) => i > 0 && s !== sides[i - 1]);
  swept[a.id] = flip > 0 ? T.years[flip] : null;
  console.log(`  ${a.name.padEnd(4)} ${row.map((d) => d.toFixed(4).padStart(8)).join('')}   侧: ${sides.join('→')}   ${flip > 0 ? `★ ${T.years[flip]} 年被扫过` : '未被扫过'}`);
}

// 出图比例
console.log('\n── 分水岭求解覆盖率（inRange 为 true 的比例）');
const cover = {};
for (const y of T.years) {
  let n = 0; const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const dT = computeD(slidersFromXY(x, 0), y);
    const dB = computeD(slidersFromXY(x, 1), y);
    if (dT === 0 || dB === 0 || dT * dB < 0) n++;
  }
  cover[y] = +(n / 49).toFixed(3);
  console.log(`  ${y}  ${(cover[y] * 100).toFixed(1)}%`);
}

console.log('\n' + (errs.length ? `✗ ${errs.length} 个问题：\n  ` + errs.join('\n  ') : '✓ 全部通过'));
console.log('\n供 __verified 用：');
console.log(JSON.stringify({ swept, cover }, null, 2));
process.exit(errs.length ? 1 : 0);
