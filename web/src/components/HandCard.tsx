"use client";

import { CardFace } from "@/components/CardFace";
import type { Card } from "@/lib/model";
import { evidenceFor } from "@/lib/topic";
import { TABLE, toPercent, type Rect } from "@/lib/table-layout";

/**
 * 一张放在桌面某个槽位上的卡。
 *
 * ── 手牌读不清怎么解 ──
 * 槽位里的卡在 1280 视口下实际约 187px 宽，放得下标题 + 前提，放不下逐字引文。
 * 两条路：点开放大读，或把手牌整层挪到桌沿外做大。
 * 这里选前者 —— 挪到桌沿外就等于承认「桌子」这个隐喻在最关键的一步失效了，
 * 而卡从桌面抬到眼前是真实动作，不用解释。
 *
 * raised 状态做三件事：
 *   1. translateZ 抬离桌面 —— 影子随之变大，是「拿起来了」而不是「变大了」
 *   2. rotateX(-24deg) 抵消桌面倾角，卡正对观众，字不再被压扁
 *   3. 放大到 2.1 倍并让出逐字引文的位置
 *   4. 横向挪到桌子正中
 *
 * 第 4 条的理由：拿起来读的那张卡是全场要看的东西，摆在最左边会压到桌子的暗边上，
 * 对比度掉一截；而且抬哪张卡它就停在哪，位置不固定。挪到正中两个问题一起解决。
 */
export function HandCard({
  card,
  slot,
  raised = false,
  dragging = false,
  idlePhase,
  onClick,
  onPointerDown,
}: {
  card: Card;
  slot: Rect;
  raised?: boolean;
  /** 这张卡正被拖着 —— 桌上留一个空槽，卡本体画在 DragGhost 里 */
  dragging?: boolean;
  /**
   * 待命时那点浮动的相位，秒。给了就浮，不给就是死的。
   *
   * 幅度只有 2px —— 这不是「卡在飘」，是让整屏别像一张截图。
   * 每张卡的相位错开，否则四张一起上下就成了呼吸灯。
   *
   * 举起来、拖着、结算之后都不传 —— 那三种时候卡该是定住的：
   * 举起来的卡有自己的 transform（浮动会跟它打架），
   * 结算之后徽章贴着卡边，卡一动描边就对不上了。
   */
  idlePhase?: number;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  const pos = toPercent(slot);
  const evidence = evidenceFor(card.evidence_answer_id);

  // 抬起时要横移多远才到桌子正中。translateX 的百分比按元素自身宽度算，
  // 所以这里换算成「几个卡宽」。放在 scale 前面，量是未缩放的卡宽，正好。
  const toCenterPct =
    ((TABLE.width / 2 - (slot.x + slot.w / 2)) / slot.w) * 100;

  /*
   * ── 为什么抬起来的卡要换个长宽比 ──
   * 卡上所有尺寸都是 cqw（跟着卡宽走），所以放大整张卡的时候字和框一起放大，
   * 装不装得下跟放多大**完全无关**。想给引文腾地方，只能改框本身的高宽比。
   * 于是抬起时把卡做高一点（1.58 而不是槽位的 1.43），倍数相应收到 1.95,
   * 渲染出来的大小跟原来差不多，但竖着多出一截，长引文和四行标题才装得下。
   */
  const RAISED_RATIO = 1.58;
  const RAISED_SCALE = 1.95;
  const raisedHeightPct = `${((slot.w * RAISED_RATIO) / TABLE.height) * 100}%`;

  // 浮动和 raised 的 transform 不能同时挂 —— 后者是 animation，会整个盖掉 style 里的
  // transform。所以举起来的时候浮动就摘掉，那也正是它该定住的时候。
  const floating = idlePhase !== undefined && !raised && !dragging;

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      aria-label={`${card.headline}。前提：${card.condition.label}`}
      aria-expanded={raised}
      className={`absolute cursor-pointer border-0 bg-transparent p-0 text-left${
        floating ? " amb-idle" : ""
      }`}
      style={{
        ...pos,
        ...(raised ? { height: raisedHeightPct } : null),
        transformStyle: "preserve-3d",
        // 抬起时把变换原点压到卡底，卡是从桌面「立起来」的，不是原地悬空
        transformOrigin: "50% 88%",
        transform: raised
          ? `translateX(${toCenterPct.toFixed(1)}%) translateZ(46px) rotateX(-24deg) scale(${RAISED_SCALE})`
          : "translateZ(1px)",
        // 相位用负延迟错开：四张卡各自从动画的不同位置起步，不是先后开始
        animation: floating
          ? `amb-idle-float 5.2s ease-in-out ${-idlePhase!}s infinite`
          : undefined,
        zIndex: raised ? 50 : 10,
        // 位置也要跟着动：配好卡之后卡从手牌区滑到提问者面前，
        // 靠 left/top 的过渡，不是重新挂载一个元素。
        transition:
          "left 300ms cubic-bezier(0.22, 1, 0.36, 1), top 300ms cubic-bezier(0.22, 1, 0.36, 1), transform 340ms cubic-bezier(0.22, 1, 0.36, 1), filter 340ms, opacity 140ms",
        // 拖起来的时候本体隐形但仍占位 —— 松手要是没落到槽上，卡就在这儿直接现形回来
        opacity: dragging ? 0 : 1,
        filter: raised ? "brightness(1.06)" : "none",
        // 拖拽中不能吃掉指针，否则 elementsFromPoint 摸到的永远是这张卡
        pointerEvents: dragging ? "none" : "auto",
        // 手机上按住卡不要触发系统的滚动/长按选中
        touchAction: "none",
      }}
    >
      <CardFace card={card} evidence={evidence} detail={raised} />
    </button>
  );
}
