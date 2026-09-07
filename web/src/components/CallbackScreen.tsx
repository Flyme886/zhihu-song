"use client";

/**
 * §4.6 卡失效回调 —— 两个节点之间的过场屏。
 *
 * 要同时把三件事摆在一张屏上，缺一件这一下就不成立：
 *   1. 卡面**一个字没改**（把上一节点那张卡原样再放一次，CardFace 不动）
 *   2. 赞数**还在涨**（旧数 → 新数，眼看着往上跳）
 *   3. 它依赖的条件**已经没了**（now_invalid_because + basis_refs）
 *
 * 定版文案压在最上面：「攻略没写错，是版本变了。」
 * ⚠️ 禁用「落后」「过时」「打脸」—— 答主是卡牌设计师，不是卡。这张卡在当前
 *    版本很弱，但答主没写错。措辞的分寸就是这个产品的立场，别改软也别改狠。
 *
 * 为什么是独立一屏而不是叠在桌面上：这一下要把注意力从「我刚才配得对不对」
 * 整个挪开，挪到「时间把这张卡改了」。留在桌上就还是复盘一局，压不住。
 */

import { useEffect, useRef, useState } from "react";

import { CardFace } from "@/components/CardFace";
import type { Card, EraCallback, Evidence } from "@/lib/model";
import { useReducedMotion } from "@/lib/useReducedMotion";

/** 赞数：和 CardFace 里那套读法保持一致（1.2 万赞） */
function formatUpvotes(n: number): string {
  if (n >= 10000) {
    const w = n / 10000;
    return `${w >= 10 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, "")} 万赞`;
  }
  return `${n} 赞`;
}

/**
 * 赞数从旧值爬到新值。用 rAF 自己数，不引第三方 ——
 * 这是全屏唯一一处「眼看着在动」的量，它就是「还在涨」这句话本身。
 * 减少动效时直接落在新值上：涨的过程是修辞，不是信息，可以整个取消。
 */
function useCountUp(from: number, to: number, ms: number, enabled: boolean): number {
  const [n, setN] = useState(from);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    // 减少动效时不跑动画：返回值那一行直接给 to，这里就不必（也不该）同步 setState
    if (!enabled) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // easeOutCubic：起步快、收尾慢，像滚表往上抬到位
      const e = 1 - Math.pow(1 - t, 3);
      setN(Math.round(from + (to - from) * e));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [from, to, ms, enabled]);

  // 减少动效直接落在新值上；开了动效才显示逐帧爬升的 n
  return enabled ? n : to;
}

export function CallbackScreen({
  card,
  evidence,
  callback,
  onContinue,
  onClickSound,
}: {
  /** 上一节点那张过期的卡，原样重放 */
  card: Card;
  evidence?: Evidence;
  callback: EraCallback;
  /** 点「继续」进入下一节点 */
  onContinue: () => void;
  onClickSound?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  // 赞数在文案落定之后才开始爬，1.4s 到位 —— 太快看不出在动，太慢拖节奏
  const live = useCountUp(callback.upvote_then, callback.upvote_now, 1400, !reducedMotion);
  const rose = callback.upvote_now - callback.upvote_then;

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center"
      // 桌面还在底下，压一层近黑把它推远 —— 这一屏说的是「时间」，不是「这一局」
      style={{ background: "rgb(8 9 11 / 0.94)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`卡失效：${card.headline}`}
    >
      <div
        className="flex w-full items-stretch justify-center gap-[3vw] px-[5vw]"
        style={{
          maxWidth: "min(94vw, 1120px)",
          animation: reducedMotion ? undefined : "amb-spot-in 520ms ease-out both",
        }}
      >
        {/* ── 左：原样卡面 ── */}
        <div className="flex shrink-0 flex-col items-center gap-[1.6vh]">
          <div style={{ width: "min(30vw, 260px)", aspectRatio: "3 / 4.2" }}>
            <CardFace card={card} evidence={evidence} />
          </div>
          {/* 过期卡的版本号章。§4.6：过期卡额外标 `2016 版` */}
          <span
            style={{
              fontSize: "clamp(11px, 1.1vw, 14px)",
              letterSpacing: "0.16em",
              color: "var(--color-dim)",
              border: "1px solid var(--glow-soft)",
              borderRadius: 3,
              padding: "0.4vh 0.9vw",
            }}
          >
            {callback.from_year} 版
          </span>
        </div>

        {/* ── 右：三件事的说明 ── */}
        <div className="flex max-w-[46ch] flex-col justify-center gap-[2.2vh]">
          {/* 定版文案 —— 全屏最重的一句，别改 */}
          <p
            style={{
              fontSize: "clamp(20px, 2.4vw, 34px)",
              fontWeight: 600,
              lineHeight: 1.3,
              fontFamily: "var(--font-serif)",
              color: "var(--color-card)",
            }}
          >
            攻略没写错，是版本变了。
          </p>

          {/* 赞数还在涨：旧 → 新，眼看着往上跳 */}
          <div className="flex items-baseline gap-[1vw]">
            <span
              style={{
                fontSize: "clamp(12px, 1.3vw, 16px)",
                color: "var(--color-dim)",
                textDecoration: "line-through",
                textDecorationColor: "var(--color-ineffective)",
              }}
            >
              {formatUpvotes(callback.upvote_then)}
            </span>
            <span style={{ color: "var(--color-dim)", fontSize: "clamp(12px, 1.3vw, 16px)" }}>
              →
            </span>
            <span
              aria-live="off"
              style={{
                fontSize: "clamp(22px, 2.6vw, 36px)",
                fontWeight: 700,
                color: "var(--color-red)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatUpvotes(live)}
            </span>
            <span
              style={{
                fontSize: "clamp(11px, 1.15vw, 14px)",
                color: "var(--color-red-dim)",
              }}
            >
              还在涨（+{rose.toLocaleString("zh-CN")}）
            </span>
          </div>

          {/* 它依赖的条件已经没了 */}
          <p
            style={{
              fontSize: "clamp(14px, 1.5vw, 19px)",
              lineHeight: 1.6,
              color: "rgb(216 226 238 / 0.86)",
            }}
          >
            {callback.now_invalid_because}
          </p>

          {/* basis_refs：为什么这么说，可点回原始依据（当前为占位） */}
          <div className="flex flex-wrap gap-[0.6vw]">
            {callback.basis_refs.map((ref, i) => (
              <span
                key={i}
                style={{
                  fontSize: "clamp(10px, 1vw, 13px)",
                  color: "var(--color-dim)",
                  border: "1px solid var(--glow-soft)",
                  borderRadius: 2,
                  padding: "0.3vh 0.7vw",
                  letterSpacing: "0.03em",
                }}
              >
                {ref}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              onClickSound?.();
              onContinue();
            }}
            className="self-start"
            style={{
              marginTop: "1vh",
              minHeight: 44,
              padding: "0 1.6vw",
              borderRadius: 4,
              fontSize: "clamp(13px, 1.2vw, 16px)",
              letterSpacing: "0.1em",
              fontWeight: 600,
              color: "#fff",
              background: "var(--color-red)",
              border: "1px solid var(--color-red)",
              boxShadow: "0 0 22px rgb(208 32 44 / 0.45)",
              cursor: "pointer",
            }}
          >
            进入 {callback.to_year} 年
          </button>
        </div>
      </div>
    </div>
  );
}
