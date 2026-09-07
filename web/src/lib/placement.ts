/*
 * 一张卡在桌上待的地方 —— 牌堆、手里、某个提问者面前、弃牌区。
 *
 * ── 为什么卡的尺寸是写死的 ──
 * 卡面上所有字号都是 cqw（跟着卡自己的宽度走）。要是卡进了提问者的放卡处
 * 就跟着放卡处变大，那字会在飞过去的半路上一起变大 —— 看着像穿越，不像放牌。
 * 所以整局里卡永远是 120×172，只有中心点在动：
 *   牌堆中心 → 手上槽位中心 → 提问者放卡处中心 → 弃牌区中心。
 * 放卡处是 124×178，比卡大一圈，所以卡是「放进托盘里」，不是「填满托盘」，
 * 边上留出的 2px 正好是托盘框露出来的地方。
 */

import { ASKER_SLOTS, DECK, DISCARD, HAND_SLOTS, center, type Rect } from "./table-layout";

/** 一整局里卡的尺寸不变，只有位置变。见文件头。 */
export const CARD = { w: 120, h: 172 } as const;

export type Placement =
  | { kind: "deck" }
  | { kind: "hand"; i: number }
  | { kind: "asker"; i: number }
  | { kind: "discard" };

/** cardId → 它现在在哪 */
export type Placements = Readonly<Record<string, Placement>>;

const DECK_CENTER = { x: DECK.cx, y: DECK.cy };

function anchorOf(p: Placement): { x: number; y: number } {
  switch (p.kind) {
    case "deck":
      return DECK_CENTER;
    case "hand":
      return center(HAND_SLOTS[p.i] ?? HAND_SLOTS[0]!);
    case "asker":
      return center(ASKER_SLOTS[p.i] ?? ASKER_SLOTS[0]!);
    case "discard":
      return center(DISCARD);
  }
}

/** 卡在这个位置时占的那块地方 —— 尺寸恒定，中心对准落点。 */
export function rectFor(p: Placement): Rect {
  const c = anchorOf(p);
  return { x: c.x - CARD.w / 2, y: c.y - CARD.h / 2, w: CARD.w, h: CARD.h };
}

/** 开局：全部压在牌堆里。 */
export function inDeck(cardIds: readonly string[]): Placements {
  return Object.fromEntries(cardIds.map((id) => [id, { kind: "deck" } as Placement]));
}

/** 发完牌：按顺序摊在手上的四个槽位。 */
export function dealt(cardIds: readonly string[]): Placements {
  return Object.fromEntries(
    cardIds.map((id, i) => [id, { kind: "hand", i } as Placement]),
  );
}

function samePlace(a: Placement, b: Placement): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "hand" && b.kind === "hand") return a.i === b.i;
  if (a.kind === "asker" && b.kind === "asker") return a.i === b.i;
  return true;
}

/**
 * 把一张卡放到 target。
 *
 * 落点上已经有卡的话是**换位**，不是弹回去 —— BRIEF §4.3 说「可反复调整直到点结算」，
 * 弹回去等于逼玩家先把旧的拖走再拖新的，多一步没道理的操作。
 * 牌堆是例外：卡不回牌堆，也不会有两张卡挤在牌堆里的问题。
 */
export function place(state: Placements, cardId: string, target: Placement): Placements {
  const from = state[cardId];
  if (!from || samePlace(from, target)) return state;

  const next: Record<string, Placement> = { ...state, [cardId]: target };

  if (target.kind !== "deck") {
    for (const [id, p] of Object.entries(state)) {
      if (id !== cardId && samePlace(p, target)) next[id] = from;
    }
  }
  return next;
}

/** 三个提问者面前各有一张、弃牌区正好一张，才能结算。 */
export function canSettle(state: Placements): boolean {
  const askers = new Set<number>();
  let discards = 0;
  for (const p of Object.values(state)) {
    if (p.kind === "asker") askers.add(p.i);
    else if (p.kind === "discard") discards += 1;
  }
  return askers.size === 3 && discards === 1;
}

/** 第 i 个提问者面前那张卡的 id（没有就是 null）。 */
export function cardAtAsker(state: Placements, i: number): string | null {
  for (const [id, p] of Object.entries(state)) {
    if (p.kind === "asker" && p.i === i) return id;
  }
  return null;
}

/** 弃掉的那张 —— 复盘屏要用（§4.3：弃掉的卡要记住并传给复盘屏）。 */
export function discardedCard(state: Placements): string | null {
  for (const [id, p] of Object.entries(state)) {
    if (p.kind === "discard") return id;
  }
  return null;
}
