"use client";

import { useSyncExternalStore } from "react";

/**
 * 系统「减少动效」开关。
 *
 * ── 为什么不用 CSS 变量 ──
 * 结算的揭示节奏一半在 CSS 里（淡入时长），一半在 JS 里（第几秒揭第几格）。
 * 只写一个 CSS 变量的话 JS 那一半读不到，两边就会各走一套时间轴 ——
 * 卡已经翻了，字还没跟上。所以倍率从这里出，两边都用它。
 *
 * ── 为什么是压时长而不是关掉 ──
 * 依次揭示本身带着意思：先生效、后反噬，反噬排最后。顺序取消了，
 * 三格同时冒出来，那句「它只是不是写给他的」就没有落点了。
 * 所以减少动效时保留顺序，只把时长压到 40%（BRIEF §8）。
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** 静态导出时先按「不减少」渲染，挂载后立刻纠正。
 *  猜错的代价只是第一帧的过渡时长，不影响顺序和内容。 */
function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 减少动效时的时长倍率。40% —— 快，但还看得出先后。 */
export const REDUCED_MOTION_SCALE = 0.4;

/** 揭示时长的倍率。JS 里的定时器和内联的 transition/animation 时长共用这一个数。 */
export function useMotionScale(): number {
  return useReducedMotion() ? REDUCED_MOTION_SCALE : 1;
}
