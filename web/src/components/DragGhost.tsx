"use client";

/*
 * 拖拽中跟着指针走的那张卡。
 *
 * 它不在桌子里 —— 是一层 fixed 的浮层，平的、不带透视（理由见 useCardDrag 文件头）。
 * 桌上原来那张同时降成一块暗槽，所以看起来是「这张卡被拿起来了」，
 * 不是「多出来一张卡」。
 */

import { CardFace } from "@/components/CardFace";
import type { DragState } from "@/lib/useCardDrag";
import type { Card } from "@/lib/model";
import type { Evidence } from "@/lib/model";

export function DragGhost({
  drag,
  card,
  evidence,
}: {
  drag: DragState;
  card: Card;
  evidence?: Evidence;
}) {
  // 拿起来放大一点。手上的东西比桌上的东西近，近的东西大 ——
  // 不放大的话卡会像贴在玻璃上滑，没有「离开桌面」的感觉。
  const LIFT = 1.12;

  return (
    <div
      className="pointer-events-none fixed z-[100]"
      style={{
        left: drag.x - drag.grabX,
        top: drag.y - drag.grabY,
        width: drag.w,
        height: drag.h,
        // 绕抓着的那个点放大，卡就不会从指头下面溜走
        transformOrigin: `${((drag.grabX / drag.w) * 100).toFixed(1)}% ${((drag.grabY / drag.h) * 100).toFixed(1)}%`,
        // 落到槽上时正一正，像被吸住了；飞在半空是斜的
        transform: `scale(${LIFT}) rotate(${drag.target ? 0 : -2.4}deg)`,
        transition: "transform 140ms cubic-bezier(0.22, 1, 0.36, 1)",
        filter: drag.target
          ? "drop-shadow(0 18px 26px rgb(0 0 0 / 0.5)) brightness(1.06)"
          : "drop-shadow(0 26px 34px rgb(0 0 0 / 0.55))",
      }}
    >
      <CardFace card={card} evidence={evidence} />
    </div>
  );
}
