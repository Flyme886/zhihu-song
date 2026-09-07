/**
 * 和不同 · 数据契约与结算模型
 *
 * v3.0（卡牌局版）。给 Claude.design 的输入，也是前后端共用的契约。
 * 运行时 0 次 AI 调用：全部数据离线人工核验后落库，前端只做纯函数计算。
 *
 * 两层，别混：
 *   §A 结算层 —— 离散、确定。一个节点里「哪张卡给谁 → 什么结果」由三行规则决定。
 *   §B 地图层 —— 连续、只读。仅供复盘屏解释「十年里分水岭扫过了谁」。
 *
 * ⚠️ 地图层的连续权重**不许参与结算**。v2.0 曾用 rank→weight（0.4/0.3/0.2/0.1）
 *    映射来定条件强弱，那是当时整套方案技术上最脆的一环：一个小数没法在原文里
 *    指出来。v3.0 改用集合成员判定（requires / strains），因为「他有没有说过
 *    这件事」可以指着原文回答。别把小数带回结算层。
 */

// ══ §A 结算层 ═══════════════════════════════════════════════════

/** 来源分档：全站强制标注，不允许裸引文 */
// author_stated  答主在原回答里自己写明的适用范围，可点原帖验证（最高档）
// human_verified 我们人工核对原文后判定
// ai_inferred    模型推测，UI 必须显式标注
export type SourceTier = 'author_stated' | 'human_verified' | 'ai_inferred';

/**
 * 能力项。刻意保持**少而粗** —— 每一项都要能靠读原文判断「这条建议是否依赖它」，
 * 判不出来的项就不该存在。加项之前先问：能在原帖里指出判据吗？
 */
export type Capacity =
  | 'self_control'      // 自制力
  | 'metacognition'     // 能觉察自己哪里不会
  | 'external_support'  // 有人能兜住（家长/老师/同学）
  | 'knowledge_base'    // 基础知识够用
  | 'tool_access';      // 拿得到工具

export type VariableType =
  | 'cost_curve' | 'policy' | 'engineering' | 'compute'
  | 'supply_chain' | 'demand_shift' | 'social_norm';

/** 证据层：来自 API 原始字段或原文逐字子串，模型不可改写 */
export interface Evidence {
  answer_id: string;
  url: string;
  question_title: string;
  author_name: string;
  author_credential: string | null;
  created_at: string;   // ISO8601
  upvote_count: number;
  quote: string;        // 硬约束：quote 必须是 source_text 的逐字子串
  source_text?: string; // 仅后端校验用，不出 UI
}

/**
 * 卡面上那句「如果……就……」。
 *
 * requires / strains 是**离散集合**，不是权重。判定它们的唯一依据是原文：
 *   requires —— 这条建议依赖对方具备什么
 *   strains  —— 这条建议会加重什么负担（反噬的判据）
 * 两者都必须能在 evidence_paragraph 里指出判据句子。指不出来就别填。
 */
export interface Condition {
  id: string;
  label: string;

  /** 逐字引文。硬约束：quote ∈ source_text，不通过直接丢弃，不许润色 */
  quote: string;

  requires: Capacity[];
  strains: Capacity[];

  evidence_answer_id: string;
  evidence_paragraph: string;

  /** ⚠️ 卡面「如果」那一句只能是 author_stated。别的档位不能占这个槽位 */
  source_tier: SourceTier;
}

/**
 * 提问者。三个人，性格与能力各异。
 *
 * ⚠️ has / lacks / reveal 是隐藏信息，结算前不可见 —— 也**不能出现在下发给前端的
 *    DOM/初始状态里**，会被扒。
 *
 *    已定：拆成单独文件，结算时才取。web/scripts/split-topic.mjs 把这份数据切成
 *    公开份（进包）和暗牌份（public/data/topic.secret.json，放下第一张卡时才请求）。
 *    前端组件拿到的是 PublicAsker，类型上就没有这几个字段，手滑也读不到。
 *
 *    买到的边界，说清楚：答案不在 JS 包里、不在初始 DOM 里、不点就不请求；
 *    但挡不住打开网络面板或直接猜 URL 的人。静态导出没有服务端，做不到真藏。
 *    这一层挡随手剧透，不是安全边界。
 */
export interface Asker {
  id: string;
  name: string;

  /** 可见信息：年级 / 住校与否 / 一句自述 */
  visible: string[];

  has: Capacity[];
  lacks: Capacity[];

  /** 结算后才揭示的那句话：他缺的是什么 */
  reveal: string;

  /** 复盘屏地图上的位置，逐年 */
  coords_by_year: Record<number, { x: number; y: number }>;

  /** 类型层强制打标：UI 必须主动说明提问者是虚构的，不等用户问 */
  is_fictional: true;
}

export interface Card {
  id: string;
  node_year: number;
  headline: string;
  condition: Condition;
  evidence_answer_id: string;

  /** 这张卡在哪一年之后失效。null = 至今仍然成立 */
  dies_after_year: number | null;
}

/** 只有三种结果。没有成功失败，没有分数 */
export type Outcome = 'effective' | 'ineffective' | 'backfire';

/**
 * 三态在界面上的说法。全场只有这一份 ——
 * 桌上印的图例、卡底下的筹码、结算面板的表头、读屏念的那句播报，四处都从这儿取。
 * 早先是四份各自写死的拷贝，今天恰好一致；改名时漏掉任何一处，
 * 桌上印着一个词、读屏念另一个词，而且不会有任何报错。
 *
 * 放在 model.ts 而不是某个组件里：这三个词是产品自己的术语（BRIEF 定的），
 * 和 Outcome 这个类型是一件事的两面，不是排版。
 */
export const OUTCOME_LABEL: Record<Outcome, string> = {
  effective: '生效',
  ineffective: '无效',
  backfire: '反噬',
};

/** 图例、遍历三态时的固定次序：由轻到重。别用 Object.keys 代替，那是碰巧。 */
export const OUTCOME_ORDER: readonly Outcome[] = ['effective', 'ineffective', 'backfire'];

/**
 * 绒面上那种「生 效」的排法 —— 字之间塞一个空格。
 * 印在桌布上的字都这么排（提 问 者、手 牌、弃 牌 区），字距靠这个撑开。
 * 由 OUTCOME_LABEL 推出来，不另写一份，省得两边分头改。
 */
export function spacedLabel(outcome: Outcome): string {
  return Array.from(OUTCOME_LABEL[outcome]).join(' ');
}

/**
 * 一格 = 一张卡 × 一个提问者。4 × 3 = 12 格，全部人工签字。
 * outcome 必须与 resolve() 的计算结果一致 —— 用 validateNode() 挡住不一致。
 */
export interface Cell {
  card_id: string;
  asker_id: string;
  outcome: Outcome;

  /**
   * 4~5 条叙述变体，运行时随机取一条。
   * 这是全站**唯一**允许随机的地方，且只影响措辞，不影响 outcome。
   */
  narration: string[];

  /** 一行解释：为什么是这个结果 */
  because: string;

  /** 人工签字，谁核的 */
  verified_by: string;
}

/** 卡失效回调：卡面一个字没改，赞数还在涨，它依赖的条件已经没了 */
export interface EraCallback {
  from_year: number;
  to_year: number;
  card_id: string;
  was_valid_because: string;
  now_invalid_because: string;
  macro_condition_id: string;
  basis_refs: string[];

  /**
   * §4.6 要「赞数还在涨」，得把两个年份的赞数并排放。
   * 卡的 evidence 里只有一个当下的数，说不出「涨了多少」，所以在回调里显式记两头。
   * upvote_now ≥ upvote_then 是设计意图（涨，不是跌）—— 这正是「卡面没改、赞还在涨、
   * 前提已经没了」这句话扎人的地方。放在暗牌份里：赞数变化本身就带着「这张卡会过期」
   * 的剧透，配卡阶段不能先漏出来。
   */
  upvote_then: number;
  upvote_now: number;
}

export interface Node {
  year: number;
  index: number;
  cards: Card[];        // 4 张
  cells: Cell[];        // 12 格
  callbacks: EraCallback[];
}

// ── 结算：三行规则 ────────────────────────────────────────────

/**
 * ★ 全产品的命门：这个函数**必须是纯函数，且不含任何随机数**。
 * 同一组配卡跑两遍必须完全一样。
 *
 * 意外感来自 asker.lacks 是隐藏的，不来自骰子。
 * 随机结果教给用户的是「命不好」；条件驱动的结果教给用户的是
 * 「同一句话对不同人后果不同」。后者才是这个产品要说的话。
 */
export function resolve(card: Card, asker: Asker): Outcome {
  const { requires, strains } = card.condition;

  const met = requires.every((r) => asker.has.includes(r));
  if (met) return 'effective';

  const strained = strains.some((s) => asker.lacks.includes(s));
  return strained ? 'backfire' : 'ineffective';
}

/** 结算屏用：取一条叙述。唯一允许的随机 */
export function pickNarration(cell: Cell, rand: () => number = Math.random): string {
  if (!cell.narration.length) return '';
  return cell.narration[Math.floor(rand() * cell.narration.length)];
}

export function findCell(node: Node, cardId: string, askerId: string): Cell | undefined {
  return node.cells.find((c) => c.card_id === cardId && c.asker_id === askerId);
}

/** 配卡方案：asker.id → card.id。必须恰好指派 3 张、弃 1 张 */
export type Assignment = Record<string, string>;

export function isAssignmentComplete(node: Node, askers: Asker[], a: Assignment): boolean {
  const given = askers.map((k) => a[k.id]).filter(Boolean);
  return given.length === askers.length
    && new Set(given).size === given.length
    && given.length === node.cards.length - 1;   // 必须弃满一张
}

export function discardedCard(node: Node, a: Assignment): Card | undefined {
  const given = new Set(Object.values(a));
  return node.cards.find((c) => !given.has(c.id));
}

// ── 造数据时的断言 ────────────────────────────────────────────

/**
 * ★ 造数据必跑。人工签的 outcome 与规则算出来的不一致，是**静默**的数据 bug ——
 * 不报错，只是让演示前后矛盾（结算屏说反噬，复盘屏的解释却按生效写）。
 */
export function validateNode(node: Node, askers: Asker[]): string[] {
  const errs: string[] = [];

  for (const card of node.cards) {
    for (const asker of askers) {
      const cell = findCell(node, card.id, asker.id);
      if (!cell) {
        errs.push(`缺格：${card.id} × ${asker.id}`);
        continue;
      }
      const computed = resolve(card, asker);
      if (cell.outcome !== computed) {
        errs.push(`签字与规则不一致：${card.id} × ${asker.id} 签了 ${cell.outcome}，规则算出 ${computed}`);
      }
      if (cell.narration.length < 4) {
        errs.push(`叙述变体不足 4 条：${card.id} × ${asker.id}`);
      }
      if (!cell.because || !cell.verified_by) {
        errs.push(`缺 because / verified_by：${card.id} × ${asker.id}`);
      }
    }

    if (card.condition.source_tier !== 'author_stated') {
      errs.push(`卡面条件不是答主原文自述：${card.id}（换回答，不要降档凑数）`);
    }
    if (!card.condition.requires.length) {
      errs.push(`requires 为空：${card.id}（这张卡对谁都生效，没有信息量）`);
    }
  }

  return errs;
}

/**
 * 一个节点至少要能演出「同一张卡，三个人不同结果」。
 * 12 格全是 effective 的节点没有任何说服力 —— 造数据时挡住。
 */
export function hasContrast(node: Node, askers: Asker[]): boolean {
  return node.cards.some((card) => {
    const outs = new Set(askers.map((k) => resolve(card, k)));
    return outs.size >= 2;
  });
}

/** 一个节点至少要有一格反噬 —— 那是唯一的高光时刻 */
export function hasBackfire(node: Node, askers: Asker[]): boolean {
  return node.cards.some((card) => askers.some((k) => resolve(card, k) === 'backfire'));
}

// ══ §B 地图层（复盘屏，只读）════════════════════════════════════
//
// 从 v2.0 完整保留。底层是 1D 标量 D，显示是 2D 地图：
//   D = 适用度(A) − 适用度(B)，D = 0 即分水岭。
// 复盘屏只播放年份、不接受输入 —— 没有滑杆，它是解释工具不是输入设备。
//
// ⚠️ 这一层的权重与结算无关。见文件头的警告。

/**
 * 地图层专用的加权条件。**与 §A 的 Condition 是两回事**，别复用。
 * 这里的小数只用来画一条解释性的曲线，不决定任何人的结果。
 */
export interface MapCondition {
  id: string;
  label: string;
  axis_low: string;
  axis_high: string;
  weight_a: number;
  weight_b: number;
  evidence_answer_id: string;
  evidence_paragraph: string;
  source_tier: SourceTier;

  /**
   * 这个条件的权重受哪几个宏观条件调制。
   * 界面必须能说清年份是「通过哪几个可解释的宏观条件」起作用的，
   * 所以这个映射必须显式存在，不能藏在一个神秘系数里。
   * ⚠️ affects 必须区分 a / b —— 若两侧同增同减，年份只会缩放 D 而永远无法改变
   *    符号，分水岭就不可能扫过任何点，整个时间层失效。
   */
  macro_sensitivity: Array<{
    macro_id: string;
    affects: 'a' | 'b';
    coef: number;      // 正 = 该宏观条件走高时这一侧权重变大
  }>;
}

export interface MacroCondition {
  id: string;
  label: string;                          // 如「工具可得性」
  values_by_year: Record<number, number>; // 归一到 0~1
  basis: Array<{
    year: number;
    kind: 'zhihu_answer' | 'public_data' | 'historic_event';
    ref: string;
    note: string;
  }>;
  source_tier: SourceTier;
}

export interface WatershedShift {
  from_year: number;
  to_year: number;
  direction: 'toward_a' | 'toward_b';  // 允许往回退：共识不总是往前走
  implicit_premise: string;
  changed_variable: string;
  variable_type: VariableType;
  basis_refs: string[];
}

/** 真实答主，同时是地图上的固定点。年份推进时它们不动，分水岭扫过它们 */
export interface Person {
  answer_id: string;
  coords: { x: number; y: number };
  side: 'a' | 'b';
  shared_goal: string;
  biggest_diff_condition: string;
  boundary_quote: string | null;    // 答主原文自述的适用范围，逐字
  boundary_tier: SourceTier | null; // 有 quote 时通常为 author_stated
}

export interface Topic {
  id: string;
  title: string;

  // 结算层
  askers: Asker[];                  // 3 个
  nodes: Node[];                    // 首发 2 个，最多 4 个
  evidence: Evidence[];             // 所有卡的出处

  // 地图层（复盘屏）
  map_conditions: MapCondition[];   // 4 个，最多 5
  interactions: Array<{ cond_a: string; cond_b: string; weight: number }>;
  macro_conditions: MacroCondition[];
  shifts: WatershedShift[];
  people: Person[];
  axis_x: { label: string; conditions: string[] };  // 合成轴：两个条件 id
  axis_y: { label: string; conditions: string[] };
  years: number[];

  curated: boolean;                 // 人工核验徽章
}

export type Sliders = Record<string, number>;  // map_condition.id → 0~1

/**
 * D > 0 更靠近 A 侧，D < 0 更靠近 B 侧，D = 0 在分水岭上。
 * year 通过宏观条件调制权重，不允许把年份设成一个神秘系数。
 */
export function computeD(topic: Topic, sliders: Sliders, year: number): number {
  const macro = macroVector(topic, year);
  let d = 0;

  for (const c of topic.map_conditions) {
    const v = sliders[c.id] ?? 0.5;
    const { wa, wb } = effectiveWeights(c, macro);
    d += (wa - wb) * v;
  }

  // 交互项：部分条件不独立起作用
  for (const it of topic.interactions) {
    d += it.weight * (sliders[it.cond_a] ?? 0.5) * (sliders[it.cond_b] ?? 0.5);
  }

  return d;
}

/**
 * 年份经宏观条件调制后的实际权重。两侧分别调制 —— 见 macro_sensitivity 的警告。
 * 宏观值以 0.5 为基线，只有偏离基线才产生影响，这样「年份」不是凭空加的偏置。
 */
export function effectiveWeights(
  c: MapCondition,
  macro: Record<string, number>,
): { wa: number; wb: number } {
  let wa = c.weight_a;
  let wb = c.weight_b;
  for (const s of c.macro_sensitivity ?? []) {
    const delta = ((macro[s.macro_id] ?? 0.5) - 0.5) * s.coef;
    if (s.affects === 'a') wa += delta;
    else wb += delta;
  }
  return { wa, wb };
}

/**
 * ⚠️ 标定权重时必须检查：`wa − wb` 的符号不能随年份翻转。
 * 若翻转，「这条轴往哪边走会靠近 A」就依赖当前年份，复盘屏的地图会自相矛盾。
 * 这个错误不报错，只是让解释站不住。造数据时用它挡住。
 */
export function signsStableAcrossYears(topic: Topic): boolean {
  return topic.map_conditions.every((c) => {
    const signs = new Set(topic.years.map((y) => {
      const { wa, wb } = effectiveWeights(c, macroVector(topic, y));
      return Math.sign(wa - wb);
    }));
    return signs.size === 1 && !signs.has(0);
  });
}

/** 年份 → 宏观条件向量。每个取值都必须挂真实依据（MacroCondition.basis） */
export function macroVector(topic: Topic, year: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of topic.macro_conditions) {
    out[m.id] = interpolateByYear(m.values_by_year, year);
  }
  return out;
}

/**
 * 归因：这一年是哪几个宏观条件在推动分水岭，各推了多少。
 * 供复盘屏「十年里发生了什么」用 —— 不允许出现无法展开的年份效应。
 */
export function macroContributions(
  topic: Topic, sliders: Sliders, fromYear: number, toYear: number,
): Array<{ macro_id: string; label: string; delta: number }> {
  const a = macroVector(topic, fromYear);
  const b = macroVector(topic, toYear);
  const out: Array<{ macro_id: string; label: string; delta: number }> = [];

  for (const m of topic.macro_conditions) {
    let delta = 0;
    for (const c of topic.map_conditions) {
      const v = sliders[c.id] ?? 0.5;
      for (const s of c.macro_sensitivity ?? []) {
        if (s.macro_id !== m.id) continue;
        const d = ((b[m.id] ?? 0.5) - (a[m.id] ?? 0.5)) * s.coef * v;
        delta += s.affects === 'a' ? d : -d;
      }
    }
    if (delta !== 0) out.push({ macro_id: m.id, label: m.label, delta });
  }

  return out.sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
}

function interpolateByYear(vals: Record<number, number>, year: number): number {
  const ys = Object.keys(vals).map(Number).sort((a, b) => a - b);
  if (!ys.length) return 0.5;
  if (year <= ys[0]) return vals[ys[0]];
  if (year >= ys[ys.length - 1]) return vals[ys[ys.length - 1]];
  for (let i = 0; i < ys.length - 1; i++) {
    const [a, b] = [ys[i], ys[i + 1]];
    if (year >= a && year <= b) {
      const t = (year - a) / (b - a);
      return vals[a] + t * (vals[b] - vals[a]);
    }
  }
  return 0.5;
}

// ── 2D 显示层 ─────────────────────────────────────────────────
// 每轴由两个条件合成。⚠️ 注意方向：独立思考时间越长 = 工具介入越低，要取反。

export function toScreenCoords(topic: Topic, sliders: Sliders): { x: number; y: number } {
  return {
    x: axisValue(topic.axis_x, sliders),
    y: axisValue(topic.axis_y, sliders),
  };
}

function axisValue(axis: { conditions: string[] }, sliders: Sliders): number {
  const vs = axis.conditions.map((id) => {
    const raw = sliders[id] ?? 0.5;
    return INVERTED.has(id) ? 1 - raw : raw;
  });
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
}

/** 语义方向与轴方向相反的条件 id */
const INVERTED = new Set(['c_think_time', 'c_ai_role']);

export interface Watershed {
  /** SVG path，点数恒定，可直接 `transition: d` */
  d: string;
  /** 每个采样点是否真的解出了 D=0；false 表示该列整列同号，曲线已出图 */
  inRange: boolean[];
  /** inRange 为 false 的连续区间 [起, 止]（闭区间，索引对齐 inRange） */
  clipped: Array<[number, number]>;
  /** 采样列数 = inRange.length - 1，渲染端算 x 用 i / steps */
  steps: number;
}

/**
 * 求 D = 0 等值线。
 *
 * ★ 关键一：在固定的 x 栅格上求解，所以点数恒定、path 的命令结构不变。
 *   这让年份推进可以直接 `transition: d 950ms`，不必逐帧 JS 插值。
 *
 * ★ 关键二：有些列上 D 整列同号 —— 分水岭在这一列已经跑出地图外了。
 *   语义是「这一整列都属于某一侧的适用区域」，是真信息，不是求解失败。
 *   但如果照旧二分，二分会收敛到边界，画出来是一条贴边的直线，
 *   看上去像渲染 bug。所以这些点照旧留在 path 里（点数必须恒定），
 *   但用 inRange 标出来，让渲染端把这些段虚化/淡出。
 *   mock 数据实测：2014/2020 全列有解，2017 92%，2023 64%，2026 60%。
 */
export function watershedPath(topic: Topic, year: number, steps = 48): Watershed {
  const pts: Array<[number, number]> = [];
  const inRange: boolean[] = [];

  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const dTop = computeD(topic, slidersFromXY(topic, x, 0), year);
    const dBot = computeD(topic, slidersFromXY(topic, x, 1), year);

    if (dTop === 0 || dBot === 0 || dTop * dBot < 0) {
      // 变号，二分求根。约定：hi 侧 D>0
      let lo = dTop > 0 ? 1 : 0;
      let hi = dTop > 0 ? 0 : 1;
      for (let k = 0; k < 22; k++) {
        const mid = (lo + hi) / 2;
        if (computeD(topic, slidersFromXY(topic, x, mid), year) > 0) hi = mid;
        else lo = mid;
      }
      pts.push([x, (lo + hi) / 2]);
      inRange.push(true);
    } else {
      // 整列同号：曲线在这一列之外。贴到「更靠近 0」的那条边，
      // 这样出图段是从曲线端点自然延伸出去的，形变过渡不会跳。
      pts.push([x, Math.abs(dTop) < Math.abs(dBot) ? 0 : 1]);
      inRange.push(false);
    }
  }

  const clipped: Array<[number, number]> = [];
  let run = -1;
  for (let i = 0; i < inRange.length; i++) {
    if (!inRange[i] && run < 0) run = i;
    if ((inRange[i] || i === inRange.length - 1) && run >= 0) {
      clipped.push([run, inRange[i] ? i - 1 : i]);
      run = -1;
    }
  }

  const d = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(4)},${y.toFixed(4)}`)
    .join(' ');

  return { d, inRange, clipped, steps };
}

/** 反解：地图坐标 → 条件值（求等值线时用，两个合成分量取同值） */
function slidersFromXY(topic: Topic, x: number, y: number): Sliders {
  const s: Sliders = {};
  for (const id of topic.axis_x.conditions) s[id] = INVERTED.has(id) ? 1 - x : x;
  for (const id of topic.axis_y.conditions) s[id] = INVERTED.has(id) ? 1 - y : y;
  return s;
}

// ── 复盘屏读数 ────────────────────────────────────────────────

export function distanceToWatershed(topic: Topic, sliders: Sliders, year: number): number {
  return Math.abs(computeD(topic, sliders, year));
}

export function side(topic: Topic, sliders: Sliders, year: number): 'a' | 'b' {
  return computeD(topic, sliders, year) > 0 ? 'a' : 'b';
}

/**
 * 「分水岭扫过了谁」：某个提问者在哪一年被分水岭跨过。
 * 复盘屏的主句子就是它的输出 ——「十年里分水岭扫过了小满，没扫过小雨」。
 * 返回 null = 这十年里他一直在同一侧。
 */
export function sweptYear(topic: Topic, asker: Asker): number | null {
  const years = [...topic.years].sort((a, b) => a - b);
  let prev: 'a' | 'b' | null = null;

  for (const y of years) {
    const c = asker.coords_by_year[y];
    if (!c) continue;
    const s = sideAtPoint(topic, c, y);
    if (prev && s !== prev) return y;
    prev = s;
  }
  return null;
}

function sideAtPoint(topic: Topic, p: { x: number; y: number }, year: number): 'a' | 'b' {
  return computeD(topic, slidersFromXY(topic, p.x, p.y), year) > 0 ? 'a' : 'b';
}

/**
 * 归因分解：这次变化来自个人还是时代。
 * 只能称「本模型中的影响分解」，不冒充严格因果推断。
 */
export function attribute(
  topic: Topic,
  from: { sliders: Sliders; year: number },
  to: { sliders: Sliders; year: number },
): { personal: number; macro: number; interaction: number } {
  const d00 = computeD(topic, from.sliders, from.year);
  const d10 = computeD(topic, to.sliders, from.year);   // 只变个人
  const d01 = computeD(topic, from.sliders, to.year);   // 只变年份
  const d11 = computeD(topic, to.sliders, to.year);
  return {
    personal: d10 - d00,
    macro: d01 - d00,
    interaction: d11 - d10 - d01 + d00,
  };
}
