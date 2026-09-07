"use client";

import { useEffect, useRef, useState } from "react";

import { OUTCOME_LABEL, type Outcome } from "@/lib/model";
import { lastChar } from "@/lib/text";
import type { SettleRow } from "@/lib/settlement";
import { NARRATION_PANEL, toPercent } from "@/lib/table-layout";

/**
 * 结算说明面板。摊在手牌区那一排上（结算时手上已经没牌了）。
 *
 * ── 为什么一次只显示一格 ──
 * 量过字数：narration 最长 37 字、because 43 字、reveal 37 字。
 * 三格叠进 552×172 这块地方，字号得压到三米外读不清 —— 那这块面板就没意义了。
 * 所以桌上的徽章负责「三个人分别是哪一态」（一直留着），
 * 面板负责「这一格到底发生了什么」（一次一格，说清楚）。
 *
 * ── 为什么反噬那一下要把 narration 顶掉 ──
 * 同上，装不下。而且这是对的：reveal 是提问者自己的话，
 * 是全场最该被读到的一句，它该占满整块面板，不该缩在角落里当补充说明。
 * narration 是铺垫，铺垫让位给落点。
 */

/**
 * 三个提问者的头像配色。和桌上的立牌红圆是同一个人，所以底色统一成红 ——
 * 三个人靠亮度分开，不靠色相。冷板上再引进绿和紫，红就不是唯一重音了。
 */
const AVATARS: readonly { bg: string; fg: string }[] = [
  { bg: "#d0202c", fg: "#ffffff" },
  { bg: "#8f1a22", fg: "#f4dcde" },
  { bg: "#4a1418", fg: "#e0a8ac" },
];

const OUTCOME_INK: Record<Outcome, string> = {
  effective: "var(--color-effective)",
  ineffective: "var(--color-ineffective)",
  backfire: "var(--color-backfire)",
};

/**
 * BRIEF §4.5 的定版文案。压在反噬格里，不要改写成更软或更狠的版本。
 * 读屏那条播报里也要念这一句，所以导出去 —— 两处写两遍就会有一天只改了一处。
 */
export const BACKFIRE_LINE = "这条建议没写错。它只是不是写给他的。";

export function SettlementPanel({
  row,
  showReveal,
  durationMs,
  footnote,
}: {
  /** 当前要说的那一格。null = 还没揭到第一格，面板不出现。 */
  row: SettleRow | null;
  /** 已经走到反噬的揭示那一拍：reveal + 定版句 接替 narration + because。 */
  showReveal: boolean;
  /** 淡入时长，由上层按「减少动效」倍率给。 */
  durationMs: number;
  /** 面板底下那行小字（弃牌提示）。三格全揭完之后才给。 */
  footnote?: string | null;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useOverflowWarning(bodyRef, row, showReveal);

  // 「现在这一格该显示的是哪段话」。换人、或者进反噬那一拍，这个键就变。
  const bodyKey = row ? `${row.askerIndex}-${showReveal && row.reveal !== null}` : "";
  const bodyShown = useFadeIn(bodyKey);

  if (!row) return null;

  const avatar = AVATARS[row.askerIndex] ?? AVATARS[0]!;
  const ink = OUTCOME_INK[row.outcome];
  // 反噬那一拍才用 reveal 顶掉 narration；没有 reveal 的格子永远不进这个分支
  const revealing = showReveal && row.reveal !== null;

  return (
    <div
      className="absolute"
      data-panel="settlement"
      style={{
        ...toPercent(NARRATION_PANEL),
        containerType: "inline-size",
        transformStyle: "preserve-3d",
        transform: "translateZ(1px)",
        zIndex: 20,
      }}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden"
        style={{
          borderRadius: "1.6cqw",
          padding: "2.2cqw 2.6cqw",
          // 摊在桌心上的一张纸：比桌心深一档，靠一道三态色的细边和桌面分开。
          // 不透明 —— 留 0.9 的时候，底下手牌槽的四个框线会穿过文字区，
          // 一张纸不会让桌上的刻线透出来。绒面的质感交给外面那圈阴影去交代。
          background: "#0b0c0f",
          border: `1px solid color-mix(in srgb, ${ink} 34%, transparent)`,
          boxShadow: `0 1.4cqw 3cqw rgb(0 0 0 / 0.55), inset 0 0 4cqw color-mix(in srgb, ${ink} 7%, transparent)`,
          transition: `border-color ${durationMs}ms ease`,
        }}
      >
        {/* 谁 + 哪一态 + 哪张卡。一直在，换格子的时候只换内容不重放动画 */}
        <div className="flex shrink-0 items-center" style={{ gap: "1.6cqw" }}>
          <span
            aria-hidden
            className="flex shrink-0 items-center justify-center"
            style={{
              width: "5.4cqw",
              height: "5.4cqw",
              borderRadius: "50%",
              background: avatar.bg,
              color: avatar.fg,
              fontSize: "2.8cqw",
              fontWeight: 600,
            }}
          >
            {lastChar(row.askerName)}
          </span>
          <span
            style={{
              fontSize: "2.7cqw",
              fontWeight: 600,
              color: "rgb(236 242 250 / 0.94)",
            }}
          >
            {row.askerName}
          </span>
          <span
            style={{
              // 反噬那个色压在纸上是 4.18:1，AA 的小字要 4.5 —— 差一点。
              // 不动色（调色板定的），改成够大的字号：18.9px + 700 进「大字」档，只要 3:1。
              // 三米外也是这两个字最该先被读到。字号涨了不会顶开这一行 ——
              // 行高由左边那个 5.4cqw 的头像撑着，比这行字高。
              fontSize: "2.9cqw",
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: ink,
            }}
          >
            {OUTCOME_LABEL[row.outcome]}
          </span>
          <span
            className="min-w-0 flex-1 truncate"
            style={{
              fontSize: "2.4cqw",
              // 0.5 是 4.3:1，也差一点。这行说的是「哪张卡打出了这个结果」，
              // 下一轮复盘要靠它认回来，不是可省的补充说明
              color: "rgb(216 226 238 / 0.6)",
            }}
          >
            {`卡 ${row.handNumber}「${row.cardHeadline}」`}
          </span>
        </div>

        {/*
         * 换格子（点桌上另一张卡）和进反噬那一拍，这段话要重新淡入一次。
         * 新内容和 opacity:0 在同一次渲染里进来，40ms 后翻成 1 —— 见 useFadeIn。
         */}
        <div
          ref={bodyRef}
          className="flex min-h-0 flex-1 flex-col justify-center"
          style={{
            marginTop: "1.8cqw",
            opacity: bodyShown ? 1 : 0,
            transform: bodyShown ? "none" : "translateY(1.2cqw)",
            transition: `opacity ${durationMs}ms ease, transform ${durationMs}ms ease`,
          }}
        >
          {revealing ? (
            <>
              {/*
               * reveal 直接顶上来，前面不加「小雨真正缺的是」这类引子 ——
               * reveal 本身就是「小雨不缺工具，缺的是……」，加了等于名字连说两遍。
               * 少一行也正好是反噬这格能装下定版句的余量（见 table-layout 的面板高度）。
               */}
              <p
                style={{
                  fontSize: "3.6cqw",
                  lineHeight: 1.5,
                  fontFamily: "var(--font-serif)",
                  color: "#e6b8bc",
                }}
              >
                {row.reveal}
              </p>
              {/* 定版句。全场的落点，宋体，比 reveal 亮 —— 最后停在这一行上 */}
              <p
                style={{
                  marginTop: "1.6cqw",
                  paddingTop: "1.4cqw",
                  borderTop: `1px solid color-mix(in srgb, ${ink} 28%, transparent)`,
                  fontSize: "3.2cqw",
                  lineHeight: 1.45,
                  fontFamily: "var(--font-serif)",
                  color: "rgb(236 242 250 / 0.95)",
                }}
              >
                {BACKFIRE_LINE}
              </p>
            </>
          ) : (
            <>
              {/* 这一格发生了什么。面板上最大的字 */}
              <p
                style={{
                  fontSize: "3.2cqw",
                  lineHeight: 1.45,
                  color: "rgb(236 242 250 / 0.92)",
                }}
              >
                {row.narration}
              </p>
              {/* 为什么。判定的依据，不是补充说明 —— 玩家下一轮全靠这一句 */}
              <p
                style={{
                  marginTop: "1.4cqw",
                  fontSize: "2.4cqw",
                  lineHeight: 1.6,
                  color: "rgb(216 226 238 / 0.58)",
                }}
              >
                {row.because}
              </p>
            </>
          )}
        </div>

        {footnote && (
          <div
            className="shrink-0"
            style={{
              marginTop: "1.4cqw",
              paddingTop: "1.2cqw",
              borderTop: "1px solid rgb(207 214 222 / 0.12)",
              fontSize: "2.2cqw",
              // 0.44 压在 #0b0c0f 上只有 3.6:1，小字过不了 AA 的 4.5:1；
              // 这一行承着「复盘时会再见到它」那个承诺，投影仪上再掉一档就没了
              color: "rgb(216 226 238 / 0.55)",
            }}
          >
            {footnote}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 换内容时淡入一次。传一个「现在显示的是哪段」的键，返回「这段该显示了吗」。
 *
 * 键一变，当次渲染就返回 false（shownKey 还是旧的）——
 * 新的字和 opacity:0 一起进 DOM，所以看不见旧字被替换的那一下。
 * 一拍之后翻成 true，transition 负责淡入。
 *
 * ── 为什么用 transition 而不是 @keyframes ──
 * 末态写在元素自己的 style 里：读这段 JSX 就知道这块字最后长什么样，
 * 不用翻到 globals.css 去查某个 keyframes 的 to{} 是什么。
 * 停下来的样子是默认值，动起来的过程才是附加的 —— 这个次序不该反过来。
 *
 * （两者对「时间轴不前进」都一样无解：animation 钉在第一帧，
 *  transition 钉在起始值。真实浏览器里页面在前台，都不会遇到。）
 *
 * 用 setTimeout 而不是 requestAnimationFrame：后者在不出帧的页面里根本不回调，
 * 那就永远翻不成 true。setTimeout 会被夹到 1 秒上下，但它一定会响。
 */
function useFadeIn(key: string, delayMs = 40): boolean {
  const [shownKey, setShownKey] = useState<string | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setShownKey(key), delayMs);
    return () => window.clearTimeout(id);
  }, [key, delayMs]);
  return shownKey === key;
}

/**
 * 开发期自检：字装不下会被 overflow:hidden 悄悄切掉一截 ——
 * 切掉的要是定版句那一行，在投影仪上才发现就来不及了。
 * 面板尺寸是按 1000×540 的桌面单位定的，换视口、换系统字体都会变，所以量，不算。
 */
function useOverflowWarning(
  ref: React.RefObject<HTMLDivElement | null>,
  row: SettleRow | null,
  showReveal: boolean,
) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const el = ref.current;
    if (!el || !row) return;
    // 等动画把布局定下来再量
    const t = window.setTimeout(() => {
      if (el.scrollHeight > el.clientHeight + 1) {
        console.warn(
          `[SettlementPanel] ${row.askerName} 那格的字超出了面板 ` +
            `(${el.scrollHeight} > ${el.clientHeight})，底下会被切掉。` +
            `改字号或改 NARRATION_PANEL 的高度。`,
        );
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [ref, row, showReveal]);
}
