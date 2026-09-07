"use client";

import { useEffect, useMemo, useState } from "react";

import { revealSchedule, type Settlement } from "@/lib/settlement";

/**
 * 结算揭示的时间轴。三格依次亮起，反噬那格多两拍。
 *
 * ── 为什么用 JS 定时器而不是 CSS animation-delay ──
 * 草图（prototype/style-compare.html）用的是 :nth-child(n) 配延迟。那份是静态 HTML，
 * 行的顺序写死了；这里行的顺序是算出来的（按三态排，反噬最后），
 * 而且反噬不一定是第三行 —— 玩家配的卡不同，可能一个反噬都没有，也可能两个。
 * 用 nth-child 就得假设「反噬在第 3 个」，那在示例局上看着对、换一局就错。
 * 所以延迟从数据来，CSS 只管每一格自己怎么淡入。
 *
 * ── 为什么状态是「已揭到第几格」而不是「每格一个 boolean」 ──
 * 揭示只往前走，不会跳回去。一个计数器就够，也顺便保证了顺序不会乱。
 */

/** 顿挫：反噬那格亮起之后多久，描边由软收硬。一瞬间的事，所以短。 */
const TIGHTEN_AFTER_MS = 200;
/** 揭示：顿挫之后多久，reveal + 定版句接替 narration。留一拍给人反应过来。 */
const REVEAL_AFTER_MS = 800;
/** 三格全说完之后多久算「这一局讲完了」—— 之后才允许点桌上的卡回看。 */
const SETTLED_AFTER_MS = 600;

export type RevealState = {
  /** 已经揭到第几格（按 settlement.rows 的顺序）。0 = 还没开始。 */
  landed: number;
  /** 已经收紧描边的提问者位置。反噬格才会进来。 */
  tightened: ReadonlySet<number>;
  /** 已经揭出 reveal 的提问者位置。反噬格才会进来。 */
  revealed: ReadonlySet<number>;
  /** 全部讲完了。弃牌那行小字和「点卡回看」都等这个。 */
  done: boolean;
};

const EMPTY: ReadonlySet<number> = new Set();

const START: RevealState = {
  landed: 0,
  tightened: EMPTY,
  revealed: EMPTY,
  done: false,
};

/**
 * 进度连着「这是哪一局的结算」一起存。
 *
 * ── 为什么不在 effect 里 setState 归零 ──
 * 重新配一次卡再结算，进度得从第一格重新走。在 effect 里同步归零能work，
 * 但那是一次白跑的渲染：先按旧进度画一帧，再清掉重画。
 * 把「这份进度属于哪一局」记进 state，渲染时对不上就当没开始 —— 不多画那一帧。
 */
type Progress = RevealState & { of: Settlement | null };

export function useReveal(
  settlement: Settlement | null,
  /** 时长倍率，见 useReducedMotion。减少动效时整条时间轴一起压。 */
  scale: number,
): RevealState {
  const [progress, setProgress] = useState<Progress>({ ...START, of: null });

  const offsets = useMemo(
    () => (settlement ? revealSchedule(settlement.rows, scale) : []),
    [settlement, scale],
  );

  useEffect(() => {
    if (!settlement) return;

    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, Math.max(0, ms)));
    };
    /** 只往这一局的进度上写。定时器要是比换局慢了半拍，写进来的就该丢掉。 */
    const advance = (fn: (cur: RevealState) => RevealState) =>
      setProgress((cur) =>
        cur.of === settlement
          ? { ...fn(cur), of: settlement }
          : { ...fn(START), of: settlement },
      );

    let last = 0;
    settlement.rows.forEach((row, i) => {
      const t = offsets[i] ?? 0;
      at(t, () => advance((cur) => ({ ...cur, landed: i + 1 })));

      // 反噬多两拍。用 row.reveal 判断而不是只看 outcome —— 面板要显示的就是它，
      // 有 reveal 才有东西可揭。
      if (row.outcome === "backfire" && row.reveal !== null) {
        const tighten = t + TIGHTEN_AFTER_MS * scale;
        const reveal = tighten + REVEAL_AFTER_MS * scale;
        at(tighten, () =>
          advance((cur) => ({
            ...cur,
            tightened: new Set(cur.tightened).add(row.askerIndex),
          })),
        );
        at(reveal, () =>
          advance((cur) => ({
            ...cur,
            revealed: new Set(cur.revealed).add(row.askerIndex),
          })),
        );
        last = Math.max(last, reveal);
      }
      last = Math.max(last, t);
    });

    at(last + SETTLED_AFTER_MS * scale, () =>
      advance((cur) => ({ ...cur, done: true })),
    );

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [settlement, offsets, scale]);

  // 进度是上一局的（或者刚点了重置），就当还没开始
  return progress.of === settlement && settlement !== null ? progress : START;
}
