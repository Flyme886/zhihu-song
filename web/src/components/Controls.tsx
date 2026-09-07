"use client";

/*
 * 桌沿的操作件。
 *
 * ── 为什么下拉框平时不摆出来 ──
 * 桌子近边是切出画外的，手牌底下只剩十几个像素，四个下拉框并排一定压在卡上。
 * 而这四个框本来就不是主路径 —— 主路径是拖拽。它们是给拖不了的人留的等价路径：
 * 键盘、读屏、手抖或者用触控板拖不准的人。
 * 所以平时收起来，Tab 一进来就自己展开，也留一个「点选配卡」的按钮给
 * 用鼠标但拖不动的人。收起时是 opacity:0 而不是 display:none ——
 * 后者会把元素从焦点顺序和读屏树里一起删掉，那就等于没做无障碍。
 */

import { useState } from "react";

import type { Card } from "@/lib/model";
import type { PublicAsker } from "@/lib/secret";
import { canSettle, type Placement, type Placements } from "@/lib/placement";

/** select 的 value 编码：'' = 还在手上，'discard' = 弃掉，'a0'/'a1'/'a2' = 给第几个人 */
function encode(p: Placement | undefined): string {
  if (!p) return "";
  if (p.kind === "asker") return `a${p.i}`;
  if (p.kind === "discard") return "discard";
  return "";
}

/** 桌沿上的小按钮。深底冷边，读起来像设备上的键，不像网页控件。 */
function EdgeButton({
  onClick,
  children,
  primary = false,
  disabled = false,
  pressed,
  label,
  pulse = false,
}: {
  onClick: () => void;
  children: string;
  primary?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  /** 按钮上的字不足以说明用途时补一句给读屏（喇叭图标就是这种情况） */
  label?: string;
  /**
   * 备好了，在催人点。
   * 只给结算按钮用 —— 桌上同时有两个东西在闪就等于没有重点。
   */
  pulse?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      className={pulse ? "amb-ready" : undefined}
      style={{
        minHeight: 44,
        padding: "0 1.1vw",
        borderRadius: 4,
        fontSize: "clamp(11px, 1.05vw, 15px)",
        letterSpacing: "0.1em",
        fontWeight: primary ? 600 : 400,
        whiteSpace: "nowrap",
        cursor: disabled ? "not-allowed" : "pointer",
        // 主按钮是实心红 + 白字（5.35:1）。红底黑字只有 4.1:1，反而更糟。
        // 只有一个按钮能是红的 —— 红在这套板子上等于「现在动手的地方」。
        color: primary && !disabled ? "#fff" : "rgb(216 226 238 / 0.72)",
        background: primary && !disabled ? "var(--color-red)" : "rgb(0 0 0 / 0.55)",
        border: `1px solid ${primary && !disabled ? "var(--color-red)" : "var(--glow-soft)"}`,
        // 脉冲的 box-shadow 由 keyframes 给，这里就不能再写死一个 —— 会盖掉动画
        boxShadow: pulse
          ? undefined
          : primary && !disabled
            ? "0 0 22px rgb(208 32 44 / 0.45)"
            : "none",
        transition: "background 200ms, color 200ms, box-shadow 200ms",
        animation: pulse ? "amb-ready-pulse 1.9s ease-in-out infinite" : undefined,
      }}
    >
      {children}
    </button>
  );
}

export function Controls({
  cards,
  askers,
  placements,
  handIndexOf,
  onAssign,
  onReset,
  onSettle,
  onClickSound,
  muted = false,
  onToggleMuted,
  status,
  locked = false,
  onNext,
  nextLabel = null,
}: {
  cards: readonly Card[];
  askers: readonly PublicAsker[];
  placements: Placements;
  /** 卡回手上时该回哪个槽 —— 由 Scene 记着开局发牌的顺序 */
  handIndexOf: (cardId: string) => number;
  onAssign: (cardId: string, p: Placement) => void;
  onReset: () => void;
  onSettle: () => void;
  /** 按钮的敲击声。重置和结算自己带了更响的音效，只有其余按钮用它 */
  onClickSound?: () => void;
  muted?: boolean;
  onToggleMuted?: () => void;
  /** 读屏播报用的一句话 */
  status: string;
  /** 已经结算了：配卡不能再改（桌上的徽章是按那一刻的布局贴的）。重置仍然可用。 */
  locked?: boolean;
  /** 讲完之后往下走：下一节点 / 看复盘。null 时不显示（还在配卡或还在揭示）。 */
  onNext?: () => void;
  nextLabel?: string | null;
}) {
  const ready = canSettle(placements) && !locked;
  const [picking, setPicking] = useState(false);
  // 焦点进到下拉区就展开，Tab 用户不需要先找到那个按钮
  const [focused, setFocused] = useState(false);
  const open = picking || focused;

  return (
    <>
      {/*
       * ── 桌沿的按钮。竖着叠在右下角 ──
       * 弃牌区右边到画面右缘还空着一条，横着排三个会压到弃牌区上，
       * 竖着排正好塞进那条空隙，谁也不挡。
       */}
      <div className="absolute bottom-[1.4vh] right-[1.4vw] z-40 flex flex-col items-end gap-[0.8vh]">
        {/*
         * 喇叭。放在最上面，离主操作最远 ——
         * 路演现场调音量是开场前的事，不该跟结算挤在一起误触。
         */}
        {onToggleMuted && (
          <EdgeButton
            onClick={onToggleMuted}
            pressed={muted}
            label={muted ? "打开声音" : "静音"}
          >
            {muted ? "🔇" : "🔊"}
          </EdgeButton>
        )}
        <EdgeButton
          onClick={() => {
            onClickSound?.();
            setPicking((v) => !v);
          }}
          pressed={open}
          disabled={locked}
        >
          点选配卡
        </EdgeButton>
        {/* 结算之后重置是「重来这一局」的出路。讲完之后主按钮让给「下一节点」——
            那才是往下走的路，重置退成次按钮。 */}
        <EdgeButton onClick={onReset} primary={locked && !nextLabel}>
          重置本节点
        </EdgeButton>
        {/* 讲完了才出现，接过主按钮位置催人往下走（§4.6 过场 / §4.7 复盘） */}
        {onNext && nextLabel && (
          <EdgeButton onClick={onNext} primary pulse>
            {nextLabel}
          </EdgeButton>
        )}
        {/* 配满了就开始闪 —— 桌上唯一在催人动手的东西。讲完之后就不再是主按钮了。 */}
        <EdgeButton
          onClick={onSettle}
          primary={!locked}
          disabled={!ready}
          pulse={ready}
        >
          结 算
        </EdgeButton>
      </div>

      {/* ── 等价的非拖拽路径 ── */}
      <div
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          // 焦点还在这一片里就不收 —— 在四个下拉之间 Tab 不该把面板关掉
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
        className="absolute inset-x-0 bottom-0 z-50 flex justify-center pb-[9vh]"
        style={{
          opacity: open && !locked ? 1 : 0,
          // 收起时不吃鼠标，但键盘照样能 Tab 进来（见文件头）；
          // 结算之后连键盘也不该进 —— 那时候这四个框改不了东西了
          pointerEvents: open && !locked ? "auto" : "none",
          transition: "opacity 180ms",
        }}
      >
        <div
          className="flex flex-wrap items-end justify-center gap-[1vw] px-[1.6vw] py-[1.2vh]"
          style={{
            maxWidth: "min(92vw, 1180px)",
            borderRadius: 3,
            // 展开时压在卡上，所以要一层实底，否则卡面的字和下拉框的字叠在一起
            background: "rgb(9 10 13 / 0.95)",
            // 参考图里这条是「嵌进机壳的一道槽」：上缘一道亮线（受光），
            // 内侧一圈暗影（凹进去）。圆角收到 3px —— 切出来的，不是贴上去的。
            border: "1px solid var(--glow-soft)",
            boxShadow:
              "inset 0 1px 0 rgb(226 233 241 / 0.16), inset 0 0 24px rgb(0 0 0 / 0.6), 0 -8px 40px rgb(0 0 0 / 0.7)",
          }}
        >
          {cards.map((card) => {
            const value = encode(placements[card.id]);
            return (
              <label
                key={card.id}
                className="flex flex-col gap-[0.4vh]"
                style={{ width: "min(19vw, 176px)" }}
              >
                {/* 卡名要能对上桌上哪张卡，所以用标题原文，长了就截断 */}
                <span
                  className="truncate"
                  style={{
                    fontSize: "clamp(10px, 1.05vw, 13px)",
                    color: "var(--color-dim)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {card.headline}
                </span>
                <select
                  value={value}
                  disabled={locked}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "discard") onAssign(card.id, { kind: "discard" });
                    else if (v.startsWith("a"))
                      onAssign(card.id, { kind: "asker", i: Number(v.slice(1)) });
                    else onAssign(card.id, { kind: "hand", i: handIndexOf(card.id) });
                  }}
                  aria-label={`把「${card.headline}」给谁`}
                  // 触摸目标 ≥ 44px（BRIEF §4.3）
                  style={{
                    minHeight: 44,
                    borderRadius: 2,
                    padding: "0 0.6vw",
                    fontSize: "clamp(11px, 1.1vw, 14px)",
                    fontFamily: "var(--font-sans)",
                    letterSpacing: "0.04em",
                    // 已经选了人的框描一道红边、掺一点红底。
                    // 四个框里哪几个还空着，扫一眼就知道 —— 这正是「还差几张没配」。
                    color: "var(--color-card)",
                    background: value ? "rgb(208 32 44 / 0.16)" : "rgb(0 0 0 / 0.5)",
                    border: `1px solid ${value ? "var(--red-line)" : "var(--glow-soft)"}`,
                  }}
                >
                  <option value="">留在手上</option>
                  {askers.map((a, i) => (
                    <option key={a.id} value={`a${i}`}>
                      给 {a.name}
                    </option>
                  ))}
                  <option value="discard">弃掉</option>
                </select>
              </label>
            );
          })}
        </div>
      </div>

      {/* 结果和每一步操作都要念出来。视觉上不存在，读屏软件能听见。 */}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </>
  );
}
