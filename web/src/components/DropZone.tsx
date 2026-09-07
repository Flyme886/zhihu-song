/*
 * 落点。桌面上的刻线卡槽是 TableSurface 画死的（SVG，不可交互），
 * 这一层只负责两件事：
 *   1. 被 elementsFromPoint 摸到 —— 靠 data-drop 属性认领自己是谁；
 *   2. 拖到头上时亮起来。
 *
 * 为什么不用 HTML5 拖放（dragstart/dragover/drop）：桌子有 rotateX 透视，
 * 而且触屏上原生拖放根本不触发。指针事件 + elementsFromPoint 两边都通。
 */

import { ASKER_SLOTS, DISCARD, toPercent } from "@/lib/table-layout";

/** 拖着卡在桌上飞的时候，卡的目的地只有这几种。 */
export type DropTarget = { kind: "asker"; i: number } | { kind: "discard" };

/** data-drop 的值 → 落点。认不出来就是 null（说明指针不在任何槽上）。 */
export function parseDropTarget(raw: string | null | undefined): DropTarget | null {
  if (!raw) return null;
  if (raw === "discard") return { kind: "discard" };
  const m = /^asker-([0-2])$/.exec(raw);
  return m ? { kind: "asker", i: Number(m[1]) } : null;
}

/** 从指针位置往下摸，找到最上面那个落点。 */
export function dropTargetAt(clientX: number, clientY: number): DropTarget | null {
  // elementsFromPoint（复数）拿的是整叠元素。单数版只给最上面一个，
  // 会被铺满桌面的那层 inset-0 挡住，永远摸不到槽。
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const t = parseDropTarget(el.getAttribute?.("data-drop"));
    if (t) return t;
  }
  return null;
}

export function dropTargetKey(t: DropTarget): string {
  return t.kind === "discard" ? "discard" : `asker-${t.i}`;
}

function Zone({
  id,
  rect,
  armed,
  hot,
  label,
}: {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  /** 手上正拖着一张卡 —— 所有槽都要示意「可以放这儿」 */
  armed: boolean;
  /** 指针正压在这个槽上 */
  hot: boolean;
  label: string;
}) {
  return (
    <div
      data-drop={id}
      aria-hidden="true"
      className="absolute"
      style={{
        ...toPercent(rect),
        borderRadius: 6,
        // 没在拖的时候这层完全不存在 —— 桌面刻线已经画好了，
        // 再叠一层框只会把干净的桌子搞脏。
        opacity: armed ? 1 : 0,
        // 但 pointer-events 不能跟着关：拖拽中要靠它被摸到。
        // 不拖的时候关掉，免得吃掉卡牌的点击。
        pointerEvents: armed ? "auto" : "none",
        /*
         * 亮起来的那一档要够狠。投影仪在 3 米外会吃掉一半对比度，
         * 桌面本来就近黑，薄薄一层铺上去等于没铺 ——
         * 现场看到的会是「四个框长得一模一样」，玩的人不知道卡要落哪儿。
         * 所以命中的那个是实心红 + 3px 红边，不命中的几乎不画。
         *
         * 用红而不是冷白：红在这套板子上只归「要动手的地方」，
         * 落点正是最该动手的那一处。冷白留给刻线和已经定下来的结果。
         */
        background: hot ? "rgb(208 32 44 / 0.32)" : "rgb(207 214 222 / 0.03)",
        boxShadow: hot
          ? "inset 0 0 0 3px var(--red-line), inset 0 0 30px rgb(208 32 44 / 0.3), 0 0 34px rgb(208 32 44 / 0.42)"
          : "inset 0 0 0 1px var(--glow-soft)",
        transition: "opacity 160ms, background 120ms, box-shadow 120ms",
      }}
    >
      {/*
       * 落点提示字。只在指针压上来时出现，避免四个框同时喊话。
       * 槽被透视压扁了（rotateX 之后纵向只剩九成），字要偏大一点才认得出，
       * 而且要压一层深底 —— 桌面刻线和绒纹会从字缝里透过来。
       */}
      <span
        className="absolute inset-x-0 flex justify-center"
        style={{
          bottom: "5%",
          opacity: hot ? 1 : 0,
          transition: "opacity 120ms",
        }}
      >
        <span
          style={{
            padding: "0.2em 0.7em",
            borderRadius: 3,
            fontSize: "clamp(11px, 1.25vw, 17px)",
            fontWeight: 600,
            letterSpacing: "0.16em",
            whiteSpace: "nowrap",
            // 红底白字，不是红底黑字：红 #d0202c 对白是 5.1:1，对黑只有 4.1:1
            color: "#fff",
            background: "var(--color-red)",
          }}
        >
          {label}
        </span>
      </span>
    </div>
  );
}

/**
 * 三个提问者面前的放卡处 + 弃牌区。
 *
 * 提问者的放卡处（ASKER_SLOTS）本来是空的 —— 立牌铰在桌子远边上往后倒，
 * 不占桌面面积，所以这三块地方一直空着等卡。
 */
export function DropZones({
  armed,
  hot,
  askerNames,
}: {
  armed: boolean;
  hot: DropTarget | null;
  askerNames: readonly string[];
}) {
  const isHot = (t: DropTarget) =>
    !!hot && hot.kind === t.kind && (t.kind !== "asker" || hot.kind !== "asker" || hot.i === t.i);

  return (
    <>
      {ASKER_SLOTS.map((rect, i) => (
        <Zone
          key={`az-${i}`}
          id={`asker-${i}`}
          rect={rect}
          armed={armed}
          hot={isHot({ kind: "asker", i })}
          label={`给 ${askerNames[i] ?? ""}`}
        />
      ))}
      <Zone
        id="discard"
        rect={DISCARD}
        armed={armed}
        hot={isHot({ kind: "discard" })}
        label="弃 掉"
      />
    </>
  );
}
