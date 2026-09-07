/**
 * 点下结算那一刻的产物：一份排好序、冻住的揭示清单。
 *
 * 纯数据 —— 没有 React、没有 DOM、没有样式。结算屏拿到 rows 之后只管照顺序往外放，
 * 不再自己判断谁排前面、该念哪一句。
 *
 * ── 唯一不显然的一处：叙述在这里就取定了 ──
 * pickNarration() 默认用 Math.random。要是留给组件在 render 里现取，那句话会在每次
 * 重渲染时换一条 —— 动画放到一半文字自己变了，投影仪上尤其扎眼。
 * 所以这里取一次、存成字符串，之后谁都改不动它。
 */

import { findCell, pickNarration, resolve, type Outcome } from "@/lib/model";
import { cardAtAsker, discardedCard, type Placements } from "@/lib/placement";
import {
  fullAsker,
  fullNode,
  loadSecret,
  type PublicAsker,
  type PublicNode,
} from "@/lib/secret";

export type SettleRow = {
  /** 提问者在桌上的位次，0~2，和 ASKER_SLOTS 对齐 */
  askerIndex: number;
  askerName: string;
  cardId: string;
  /** 卡面那句标题。带在行里而不是让调用方另查一张表 —— 一行自己就说得全，
   *  不需要两处对同一个 cardId 各查一遍、再指望查出来的是同一张。 */
  cardHeadline: string;
  /** 这一节点里的第几张卡，1 起 —— 屏上念的就是这个号 */
  handNumber: number;
  outcome: Outcome;
  /** 已经取定的那一句，见文件头 */
  narration: string;
  because: string;
  /** 只有反噬那一格揭示「他缺的是什么」，其余为 null */
  reveal: string | null;
};

export type Settlement = {
  year: number;
  /** 已按揭示顺序排好，组件不要再排一遍 */
  rows: SettleRow[];
  discardedCardId: string | null;
  discardedHeadline: string | null;
};

/**
 * 揭示档位。BRIEF §4.5：反噬排在最后，让这一下压住整屏。
 *
 * 为什么不按提问者位次排：demo 那一局刚好就是 生效→无效→反噬，按位次排在路演上
 * 看着是合的，换一种配法顺序就悄悄乱了 —— 这种偏差不报错，只是把最该压屏的一下挪到中间。
 */
const REVEAL_RANK: Readonly<Record<Outcome, number>> = {
  effective: 0,
  ineffective: 1,
  backfire: 2,
};

export async function settleNode(
  node: PublicNode,
  askers: readonly PublicAsker[],
  placements: Placements,
): Promise<Settlement> {
  // 取不到暗牌就让它抛出去 —— 这里没有能替代真答案的降级方案，
  // 编一份出来比报错难看得多。调用方负责把这句话说给玩家。
  const secret = await loadSecret();
  const full = fullNode(node, secret);

  const rows: SettleRow[] = [];

  for (let i = 0; i < askers.length; i++) {
    const pub = askers[i];
    if (!pub) continue;

    const cardId = cardAtAsker(placements, i);
    if (!cardId) {
      throw new Error(
        `结算早了：${pub.name}（位次 ${i}）面前还是空的。` +
          `配卡没配满就不该走到这一步，调用方应先用 canSettle() 拦住。`,
      );
    }

    // 用位次找卡，不解析 id 里的数字 —— id 的命名规则不是契约的一部分，
    // 换一批数据就可能不叫 card_2016_1 了。
    const handIndex = full.cards.findIndex((c) => c.id === cardId);
    const card = full.cards[handIndex];
    if (!card) throw new Error(`节点 ${full.year} 里没有卡 ${cardId}`);

    const asker = fullAsker(pub, secret);
    const cell = findCell(full, cardId, pub.id);
    if (!cell) throw new Error(`缺格：${cardId} × ${pub.id}（节点 ${full.year}）`);

    // 格表是人工签的，resolve() 是规则算的。两者不许有分歧：一旦分歧，说明数据本身
    // 有问题，此时无论显示哪一边，都是在对玩家撒谎 —— 所以宁可当场停下。
    const computed = resolve(card, asker);
    if (cell.outcome !== computed) {
      throw new Error(
        `格表与规则不一致：${cardId} × ${pub.id} 格表签了 ${cell.outcome}，` +
          `规则算出 ${computed}。数据要修，别在这儿二选一。`,
      );
    }

    rows.push({
      askerIndex: i,
      askerName: pub.name,
      cardId,
      cardHeadline: card.headline,
      handNumber: handIndex + 1,
      outcome: cell.outcome,
      narration: pickNarration(cell),
      because: cell.because,
      reveal: cell.outcome === "backfire" ? asker.reveal : null,
    });
  }

  /*
   * 同档保持位次升序：同为生效的两格，谁在桌上靠左谁先出，眼睛跟得上。
   * 显式比较位次而不是依赖 sort 的稳定性 —— 这一行读起来就是意图本身。
   *
   * 这样写顺带把 0 个反噬和 2 个以上反噬都覆盖了，不用特判。多个反噬时 BRIEF 没说
   * 怎么办（demo 那一局只有一个），这里选的是：全部排到最后、彼此按位次，停顿只留在
   * 第一个反噬之前，见 revealSchedule()。
   */
  rows.sort(
    (a, b) =>
      REVEAL_RANK[a.outcome] - REVEAL_RANK[b.outcome] || a.askerIndex - b.askerIndex,
  );

  const discardedCardId = discardedCard(placements);
  const discarded = discardedCardId
    ? full.cards.find((c) => c.id === discardedCardId)
    : undefined;

  return {
    year: full.year,
    rows,
    discardedCardId,
    discardedHeadline: discarded?.headline ?? null,
  };
}
// ── 节奏 ──────────────────────────────────────────────────────
// 时长照定稿 prototype/style-compare.html：三行落在 .8s / 1.6s / 3s，
// 也就是先隔 800，再隔 1400。那多出来的 600 就是 BRIEF §4.5 要的停顿。

/** 第一格不贴着按下就出，留一点「牌翻过来」的余地 */
const FIRST_OFFSET = 350;
const GAP = 800;
/** 反噬前那一档。BRIEF §4.5：反噬那格要留出停顿 */
const GAP_BEFORE_BACKFIRE = 1400;

/** 每一格的揭示时刻，相对点结算那一下，毫秒。scale 用来配合 prefers-reduced-motion 压时长 */
export function revealSchedule(rows: readonly SettleRow[], scale = 1): number[] {
  const out: number[] = [];
  let t = FIRST_OFFSET;
  let backfireSeen = false;

  for (let i = 0; i < rows.length; i++) {
    const outcome = rows[i]?.outcome;
    if (i > 0) {
      // 停顿只给第一个反噬 —— 每个反噬都顿一下，顿挫就变成节奏，不再是意外
      const pause = outcome === "backfire" && !backfireSeen;
      t += pause ? GAP_BEFORE_BACKFIRE : GAP;
    }
    if (outcome === "backfire") backfireSeen = true;
    out.push(Math.round(t * scale));
  }

  return out;
}

/**
 * 自检：节奏跑偏了要在开发时就喊，别等到路演现场才发现反噬没顿住。
 *
 * 期望值写成字面量，不用上面那三个常量去算。
 * 早先这里是拿 GAP / GAP_BEFORE_BACKFIRE 反推期望的 —— 那样两边一起变，
 * 永远相等：把 GAP_BEFORE_BACKFIRE 改成 800（等于删掉 §4.5 要的那个停顿），
 * 自检一声不响。一个不可能失败的自检比没有自检更坏，因为它让人以为查过了。
 * 350 / 1150 / 2550 是从 prototype/style-compare.html 上量下来的节奏，
 * 它是这份实现要对齐的外部事实，所以由它来管常量，不是反过来。
 * 改这几个数之前先回去看那张原型 —— 不是随手对齐代码。
 *
 * 只列 settleNode 真能排出来的顺序：反噬永远在最后（见上面的 REVEAL_RANK）。
 */
if (process.env.NODE_ENV !== "production") {
  const fake = (outcome: Outcome, i: number): SettleRow => ({
    askerIndex: i,
    askerName: "",
    cardId: "",
    cardHeadline: "",
    handNumber: i + 1,
    outcome,
    narration: "",
    because: "",
    reveal: null,
  });

  const cases: ReadonlyArray<{
    outcomes: readonly Outcome[];
    want: readonly number[];
    /** 这一档在验什么 */
    why: string;
  }> = [
    // demo 那局，也是路演现场会走的那条
    { outcomes: ["effective", "ineffective", "backfire"], want: [350, 1150, 2550], why: "反噬前多出 600 的停顿" },
    // 三个人都没踩雷：一路平铺，不该冒出停顿
    { outcomes: ["effective", "ineffective", "effective"], want: [350, 1150, 1950], why: "没有反噬就没有停顿" },
    // 两个反噬：只有第一个顿，第二个回到常速
    { outcomes: ["effective", "backfire", "backfire"], want: [350, 1750, 2550], why: "停顿只给第一个反噬" },
    // 全反噬：第一格就是反噬，i=0 不加间隔，所以整场没有停顿
    { outcomes: ["backfire", "backfire", "backfire"], want: [350, 1150, 1950], why: "首格反噬时停顿无处可加" },
    { outcomes: ["effective", "ineffective"], want: [350, 1150], why: "两格也要成立" },
  ];

  for (const { outcomes, want, why } of cases) {
    const label = outcomes.join("/");
    const at = revealSchedule(outcomes.map(fake));
    if (at.length !== want.length || at.some((v, i) => v !== want[i])) {
      console.warn(`[settlement] ${label} 节奏是 [${at}]，应为 [${want}] —— ${why}`);
    }
  }

  // 压时长那条路也得走一遍：prefers-reduced-motion 下按 0.4 倍
  const slow = revealSchedule(
    (["effective", "ineffective", "backfire"] as const).map(fake),
    0.4,
  );
  const slowWant = [140, 460, 1020];
  if (slow.some((v, i) => v !== slowWant[i])) {
    console.warn(`[settlement] 减少动效下节奏是 [${slow}]，应为 [${slowWant}]`);
  }
}
