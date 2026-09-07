// 原型自检：直接从 index.html 抽出纯逻辑段跑，避免测试与实现漂移
const fs = require('fs');
const js = fs.readFileSync(__dirname + '/index.html', 'utf8')
  .match(/<script>([\s\S]*)<\/script>/)[1];
const pure = js.slice(0, js.indexOf('/* ══ 4.'));   // 不碰 DOM 的部分
const ctx = {};
new Function('C', pure + '\nObject.assign(C,{ANS,MACRO,shiftAt,Dof,curve,smooth,uOf,aOf});')(ctx);
const { ANS, MACRO, shiftAt, Dof, curve, smooth, uOf, aOf } = ctx;

let fail = 0;
const ok = (c, m) => { console.log('  ' + (c ? '✓' : '✗') + ' ' + m); if (!c) fail++; };

console.log('── 引文逐字校验 (quote ∈ source_text) ──');
for (const k of ['A', 'B']) ok(ANS[k].src.includes(ANS[k].quote), '回答 ' + k);

console.log('\n── 分水岭位移轨迹 (>0 = 上移 = 留在 A 更难) ──');
let prev = null, dirs = [];
for (let y = 2014; y <= 2026; y++) {
  const s = shiftAt(y);
  const d = prev === null ? ' ' : s > prev + 1e-9 ? '↑' : s < prev - 1e-9 ? '↓' : '·';
  if (prev !== null) dirs.push(d);
  console.log('  ' + y, s.toFixed(3).padStart(7), d, MACRO[y] ? MACRO[y][4] : '');
  prev = s;
}
console.log('  方向:', dirs.join(''));
ok(dirs.includes('↓') && dirs.includes('↑'), '非单调（既有前进也有回退）');

console.log('\n── 四次微调 +0.08，应第 4 次才翻转 ──');
const S0 = { base: .40, think: .48, ai: .57, test: .34 };
let s = { ...S0 }, sh = shiftAt(2026), flipAt = 0;
console.log('  起点         D=' + Dof(s, sh).toFixed(3).padStart(7));
['base', 'think', 'ai', 'test'].forEach((k, i) => {
  s[k] += .08; const v = Dof(s, sh);
  if (!flipAt && v > 0) flipAt = i + 1;
  console.log('  +' + k.padEnd(10) + ' D=' + v.toFixed(3).padStart(7) + (v > 0 ? '  ← 翻转' : ''));
});
ok(flipAt === 4, '恰好第 4 次翻转（实际第 ' + flipAt + ' 次）');

console.log('\n── 任一单次微调都不该独自翻转 ──');
for (const k of ['base', 'think', 'ai', 'test']) {
  const t = { ...S0 }; t[k] += .08;
  ok(Dof(t, sh) <= 0, k + ' 单独 +0.08  D=' + Dof(t, sh).toFixed(3));
}

console.log('\n── 只拖年份，个人条件锁死 ──');
for (const y of [2014, 2020, 2021, 2023, 2026]) {
  const d = Dof(S0, shiftAt(y));
  console.log('  ' + y, d.toFixed(3).padStart(7), d >= 0 ? 'A 侧' : 'B 侧');
}
ok(Dof(S0, shiftAt(2014)) > 0 && Dof(S0, shiftAt(2026)) < 0, '同一个人 2014 在 A 侧、2026 在 B 侧');
ok(Dof(S0, shiftAt(2021)) > Dof(S0, shiftAt(2020)), '2021 相对 2020 往回退');

console.log('\n── D 必须是 (x,y) 的函数：同点必同值 ──');
// 找两组不同滑杆值但 (u,a) 相同的配置
const p = { base: .2, think: .9, ai: .3, test: .8 }, q = { base: .8, think: .3, ai: .9, test: .2 };
const mk = v => [uOf(v).toFixed(4), aOf(v).toFixed(4)].join('/');
console.log('  P (u/a)=' + mk(p) + '  D=' + Dof(p, sh).toFixed(3));
console.log('  Q (u/a)=' + mk(q) + '  D=' + Dof(q, sh).toFixed(3));
ok(mk(p) !== mk(q) || Math.abs(Dof(p, sh) - Dof(q, sh)) < 1e-9, '不同点允许不同值；同点必同值');
// 直接构造同点检验
const r1 = { base: .30, think: .50, ai: .50, test: .30 };
const r2 = { base: .30, think: .20, ai: .725, test: .30 };
console.log('  R1 (u/a)=' + mk(r1) + '  R2 (u/a)=' + mk(r2));
ok(Math.abs(uOf(r1) - uOf(r2)) < 1e-3 && Math.abs(Dof(r1, sh) - Dof(r2, sh)) < 1e-3,
  '同一 (u,a) → 同一 D（修正后成立）');

console.log('\n── 几何 ──');
for (const y of [2014, 2021, 2026]) {
  const c = curve(0, shiftAt(y)), ys = c.map(v => v[1]);
  const inside = c.filter(v => v[1] >= 20 && v[1] <= 344).length;
  console.log('  ' + y + '  y ' + Math.min(...ys).toFixed(0) + '→' + Math.max(...ys).toFixed(0)
    + '  绘图区内点 ' + inside + '/' + c.length);
  ok(inside >= 8, y + ' 年分水岭在视口内可见');
}
const d0 = smooth(curve(0, sh));
ok(/^M[-\d., ]+C/.test(d0) && !/NaN|Infinity/.test(d0), 'SVG path 合法且无 NaN');

console.log('\n' + (fail ? '✗ ' + fail + ' 项失败' : '✓ 全部通过'));
process.exit(fail ? 1 : 0);
