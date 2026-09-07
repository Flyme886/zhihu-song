"use client";

/*
 * 拖一张卡。
 *
 * ── 同一张卡上既要能点开看，又要能拖去配 ──
 * 靠位移区分：按下去先不算拖，指针挪过 6px 才转成拖拽；
 * 没挪够就松手 = 点击，卡举起来读。手指按屏幕总会抖一两个像素，
 * 阈值给 0 会导致每次想点开都变成一次微型拖拽。
 *
 * ── 为什么被拖的卡画在桌子外面 ──
 * 桌子有 rotateX(24deg) 透视。要让卡贴着指针走，就得把屏幕坐标反投影回桌面平面，
 * 那是一段没必要的矩阵数学，而且透视越强误差越明显。
 * 改成：卡从桌上拿起来之后就跟桌子无关了，用一层 fixed 的浮层平着跟指针 ——
 * 现实里也是这样，从桌上捏起一张牌，牌就朝着你自己了。
 * 落点判定完全不受影响，因为那是 elementsFromPoint 直接摸 DOM，不是算坐标。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { dropTargetAt, type DropTarget } from "@/components/DropZone";

const THRESHOLD = 6;

export type DragState = {
  cardId: string;
  /** 指针当前在屏幕上的位置 */
  x: number;
  y: number;
  /** 按下的那一刻，指针在卡内部的偏移 —— 卡才不会跳到指针中心 */
  grabX: number;
  grabY: number;
  /** 拿起来的时候卡在屏幕上有多大，浮层照这个尺寸画 */
  w: number;
  h: number;
  target: DropTarget | null;
};

export function useCardDrag(onDrop: (cardId: string, target: DropTarget) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);

  // pending 是「按下了但还没够位移」的那段。放 ref 里是因为 pointermove
  // 一秒能来几十次，用 state 会每次都重渲染整桌。
  const pending = useRef<{
    cardId: string;
    x0: number;
    y0: number;
    grabX: number;
    grabY: number;
    w: number;
    h: number;
    pointerId: number;
    el: HTMLElement;
  } | null>(null);

  /*
   * drag 存两份：state 给渲染用，ref 给 pointermove 里读用。
   * ref 才是当下的真值 —— pointermove 一秒来几十次，等 state 更新完再读会读到上一帧，
   * 那会让「够位移了没」判断两次，同一次按下起两回拖拽。
   * 所有写入都走 commit，两份永远同时改。
   */
  const dragRef = useRef<DragState | null>(null);
  const commit = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  /** 哪张卡刚拖完、什么时候。给 wasDrag 用，理由见下面。 */
  const justDragged = useRef<{ cardId: string; t: number } | null>(null);

  /** 卡上的 onPointerDown 接到这里。 */
  const onPointerDown = useCallback((cardId: string, e: React.PointerEvent<HTMLElement>) => {
    // 只接主键/单指。右键、多指交给浏览器。
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    pending.current = {
      cardId,
      x0: e.clientX,
      y0: e.clientY,
      grabX: e.clientX - r.left,
      grabY: e.clientY - r.top,
      w: r.width,
      h: r.height,
      pointerId: e.pointerId,
      el,
    };
  }, []);

  useEffect(() => {
    function move(e: PointerEvent) {
      const p = pending.current;
      if (p && !dragRef.current) {
        if (e.pointerId !== p.pointerId) return;
        const moved = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
        if (moved < THRESHOLD) return;
        // 够了，转成拖拽。setPointerCapture 让指针跑出卡外面也还归这张卡管。
        try {
          p.el.setPointerCapture(p.pointerId);
        } catch {
          // 元素已经被 React 换掉了，捕获失败无所谓，window 上的监听还在
        }
        commit({
          cardId: p.cardId,
          x: e.clientX,
          y: e.clientY,
          grabX: p.grabX,
          grabY: p.grabY,
          w: p.w,
          h: p.h,
          target: dropTargetAt(e.clientX, e.clientY),
        });
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const target = dropTargetAt(e.clientX, e.clientY);
      commit({ ...d, x: e.clientX, y: e.clientY, target });
    }

    function up() {
      const d = dragRef.current;
      pending.current = null;
      if (!d) return;
      // 用 d.target，不在这儿重新摸一遍 —— d.target 正是浮层刚才亮着的那个槽，
      // 手上看到的和落下去的必须是同一个。重新摸还会踩到「已经 commit(null)、
      // 但 DOM 还没更新」的时序缝。
      const target = d.target;
      justDragged.current = { cardId: d.cardId, t: performance.now() };
      commit(null);
      // 松手前指针飘出所有槽 = 后悔了，卡回原位。
      // PRD §493：「松手前可以后悔」—— 这就是那条后路，不需要额外的取消键。
      if (target) onDrop(d.cardId, target);
    }

    function cancel() {
      pending.current = null;
      commit(null);
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [onDrop, commit]);

  /**
   * 刚才那一下是拖拽吗 —— 调用方拿它决定该不该当点击处理。
   *
   * 不能查 dragRef，因为事件顺序是 pointerup → click：click 到的时候
   * 拖拽状态已经清干净了，查什么都是 null。而且 setPointerCapture 之后
   * click 会打回卡本身，所以每拖一次都会附赠一次点击 —— 配完卡卡面就弹开。
   * 所以记下「哪张卡刚拖完、什么时候」，紧接着那一次点击忽略掉。
   */
  const wasDrag = useCallback((cardId: string) => {
    const j = justDragged.current;
    return !!j && j.cardId === cardId && performance.now() - j.t < 400;
  }, []);

  return { drag, onPointerDown, wasDrag };
}
