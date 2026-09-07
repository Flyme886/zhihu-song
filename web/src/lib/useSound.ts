"use client";

/*
 * 把音效引擎接到 React 上。
 *
 * 这个 hook 只做两件事：第一次手势时把引擎点着、把静音状态读进渲染。
 * 音色、合成、静音的真值全在 lib/audio.ts —— 这里一行都不碰。
 *
 * ── 为什么静音状态不用 useState ──
 * 它是外部系统的状态（一个 GainNode 的值 + 一条 localStorage 记录），
 * React 只是需要知道它好画对喇叭图标。所以订阅，不持有 ——
 * 和 useReducedMotion 订阅媒体查询是同一个道理。存两份迟早不同步。
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  getMuted,
  getServerMuted,
  play,
  startAmbience,
  stopAmbience,
  subscribeMuted,
  toggleMuted as toggle,
  type Sfx,
} from "@/lib/audio";

export function useSound() {
  const muted = useSyncExternalStore(subscribeMuted, getMuted, getServerMuted);

  /*
   * 引擎必须在用户手势里建 —— 浏览器不许在那之前开 AudioContext。
   *
   * 监听挂在 window 上而不是某个元素上：第一次交互可能是点卡、可能是敲 Tab、
   * 也可能是点桌沿的按钮 —— 哪个都算。capture 让它跑在任何 React 事件处理之前，
   * 所以那一下的音效自己也能响。
   */
  useEffect(() => {
    let started = false;
    const kick = () => {
      if (started) return;
      started = true;
      startAmbience();
    };

    // pointerdown 而不是 click：click 要等松手，那时候「捏起卡」的音已经该响了
    window.addEventListener("pointerdown", kick, { once: true, capture: true });
    window.addEventListener("keydown", kick, { once: true, capture: true });

    return () => {
      window.removeEventListener("pointerdown", kick, { capture: true });
      window.removeEventListener("keydown", kick, { capture: true });
      // 卸载就把底噪收掉 —— 留着的话开发时热更新会叠出好几层持续音
      stopAmbience();
    };
  }, []);

  const sfx = useCallback((name: Sfx) => play(name), []);

  return { sfx, muted, toggleMuted: toggle };
}
