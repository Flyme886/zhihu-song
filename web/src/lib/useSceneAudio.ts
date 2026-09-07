"use client";

/*
 * 结算那几秒的声音。
 *
 * ── 为什么单独拆一个 hook ──
 * 配卡阶段的音效都挂在回调上（点了、放了、拖了），写在 Scene 的回调里最清楚。
 * 但结算是一条时间轴：三格在不同时刻自己亮起来，没有对应的用户操作。
 * 那些声音只能靠「看着 reveal 的进度变化」来发 —— 那是一堆 effect 和 ref，
 * 塞进 Scene 会把「这一局怎么玩」的主线埋掉。
 *
 * ── 为什么盯着进度差、而不是在 useReveal 里顺手发声 ──
 * useReveal 里已经有定时器了，在那儿调 play() 看着更省事。
 * 但那样声音就绑在「定时器跑到了」上，而不是绑在「画面上确实揭开了」上。
 * 页面切到后台再回来时这两件事会错开：定时器补跑，画面还没画。
 * 盯着渲染用的那份状态发声，声音和画面就永远是一起的。
 */

import { useEffect, useRef, useState } from "react";

import { play } from "@/lib/audio";
import { setTension } from "@/lib/audio";
import type { Settlement } from "@/lib/settlement";
import type { RevealState } from "@/lib/useReveal";

/** 反噬的音效自己有 500ms 的二段落底，震屏要压在那一下上，不是第一声上 */
const SHAKE_DELAY_MS = 90;

export function useSceneAudio({
  settlement,
  reveal,
  /** 已经配出去几张卡（0~3）—— 底噪的张力跟着它走 */
  placedCount,
}: {
  settlement: Settlement | null;
  reveal: RevealState;
  placedCount: number;
}) {
  /** 变一次抖一次。震屏和红光闪都看它。 */
  const [backfireNonce, setBackfireNonce] = useState(0);

  // ── 三格依次揭示的声音 ──
  const lastLanded = useRef(0);
  useEffect(() => {
    if (!settlement) {
      lastLanded.current = 0;
      return;
    }
    if (reveal.landed <= lastLanded.current) return;

    /*
     * 一次可能跨好几格 —— 页面切后台再回来，攒下的定时器会一起补跑。
     * 那种情况下补发中间几格的声音只会糊成一团，所以只发最后一格，
     * 前面的当作「已经过去了」。
     */
    const row = settlement.rows[reveal.landed - 1];
    lastLanded.current = reveal.landed;
    if (!row) return;

    // 筹码磕在绒面上，和判定音同时 —— 那是同一个动作发出的两个声音
    play("chip");
    play(row.outcome);

    if (row.outcome === "backfire") {
      const t = window.setTimeout(() => setBackfireNonce((n) => n + 1), SHAKE_DELAY_MS);
      return () => window.clearTimeout(t);
    }
  }, [settlement, reveal.landed]);

  // ── 描边收紧的那一声 ──
  const lastTightened = useRef(0);
  useEffect(() => {
    const n = reveal.tightened.size;
    if (n > lastTightened.current) play("tighten");
    lastTightened.current = n;
  }, [reveal.tightened]);

  // ── 讲完了 ──
  const wasDone = useRef(false);
  useEffect(() => {
    if (reveal.done && !wasDone.current) play("done");
    wasDone.current = reveal.done;
  }, [reveal.done]);

  /*
   * ── 底噪的张力 ──
   * 配卡时跟着配出去的张数往上爬（每张 0.2），点结算那一刻拉满，
   * 讲完之后落回 0.35 —— 不回到 0，因为这一局已经发生过了，
   * 回到全空的松弛状态等于把刚才那几秒抹掉。
   */
  useEffect(() => {
    if (settlement) {
      setTension(reveal.done ? 0.35 : 1);
      return;
    }
    setTension(Math.min(0.6, placedCount * 0.2));
  }, [settlement, reveal.done, placedCount]);

  return { backfireNonce };
}
